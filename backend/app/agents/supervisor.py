from __future__ import annotations

"""
JARVIS LangGraph Supervisor
===========================
State machine built with LangGraph 0.2.x StateGraph API.

Flow:
  classify_intent
      |
      +--calendar_query    --> calendar_agent
      +--action_items      --> action_items_agent
      +--memory_search     --> memory_agent
      +--schedule_meeting  --> general_agent   (v1: handled by general LLM)
      +--general           --> general_agent
                                     |
                               compose_response
                                     |
                               generate_suggestions --> END
"""

import json
import re
from datetime import datetime, timezone
import logging
from typing import Annotated, Any, Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict

from app.config import get_settings
from app.providers import get_provider
from app.agents.graph_tools import availability_agent, email_agent

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Intent literal type
# --------------------------------------------------------------------------- #
IntentType = Literal[
    "calendar_query",
    "action_items",
    "memory_search",
    "schedule_meeting",
    "availability_query",
    "email_query",
    "general",
]

# --------------------------------------------------------------------------- #
# Graph state
# --------------------------------------------------------------------------- #


class JarvisState(TypedDict):
    messages: list[Any]
    query: str
    intent: str
    agent_result: str
    final_response: str
    suggestions: list[str]
    data_source: str
    subject_person: str
    session_context: list[dict]


# --------------------------------------------------------------------------- #
# People name cache (loaded at init_graph time)
# --------------------------------------------------------------------------- #

_people_names_cache: set[str] = set()


async def _load_people_cache() -> None:
    """Pre-load all people names into module-level cache for fast entity extraction."""
    global _people_names_cache
    try:
        provider = get_provider()
        people = await provider.get_people()
        _people_names_cache = {p["name"] for p in people if p.get("name")}
        logger.info("People name cache loaded: %d names", len(_people_names_cache))
    except Exception:
        logger.warning("Could not load people cache — entity extraction degraded")


# --------------------------------------------------------------------------- #
# Suggestion templates
# --------------------------------------------------------------------------- #

class _SafeMap(dict):
    """Returns empty string for missing keys so str.format_map never raises."""
    def __missing__(self, key: str) -> str:
        return ""


_SUGGESTION_TEMPLATES: dict[str, list[str]] = {
    "calendar_query": [
        "What is {meeting} about?",
        "Who is attending {meeting}?",
        "What were the action items from {meeting}?",
        "Do I have anything with {person} this week?",
        "What's on my schedule tomorrow?",
        "Who do I have back-to-back meetings with?",
    ],
    "action_items": [
        "Which action items are overdue?",
        "What did {person} commit to?",
        "Show me critical priority items only.",
        "What should I focus on today?",
        "Which items are due this week?",
    ],
    "memory_search": [
        "What did {person} say about that?",
        "What were the key decisions made?",
        "Who disagreed in that discussion?",
        "What commitments were made?",
        "Search for anything about Project Delta.",
    ],
    "availability_query": [
        "Is {person} free tomorrow morning?",
        "When is my next free slot this week?",
        "What is {person} working on next week?",
        "Can we schedule a 30-minute call with {person}?",
        "Am I free Friday afternoon?",
    ],
    "email_query": [
        "Any emails from {person}?",
        "What are my unread messages?",
        "Do I need to respond to anything urgent?",
        "Check for messages about Project Delta.",
    ],
    "schedule_meeting": [
        "When is {person} available next week?",
        "What should I prepare for the meeting?",
        "Who else should attend?",
        "Set a 30-minute slot with {person}.",
    ],
    "general": [
        "What meetings do I have today?",
        "What are my overdue action items?",
        "What should I prioritize today?",
        "Summarise my week.",
    ],
}


def _extract_entities(query: str, agent_result: str) -> dict[str, str]:
    """Extract person name and meeting title from query + result for slot filling."""
    combined = f"{query} {agent_result}".lower()

    # Sort by length descending — prefer "Bharath Kumar" over "Bharath"
    sorted_names = sorted(_people_names_cache, key=len, reverse=True)
    person = ""
    for name in sorted_names:
        if name.lower() in combined:
            person = name
            break

    # Extract meeting title: first "- YYYY-MM-DD...: Title" pattern line
    meeting = ""
    m = re.search(r"- \d{4}-\d{2}-\d{2}[^:]*: ([^\n(]+)", agent_result)
    if m:
        meeting = m.group(1).strip()

    return {"person": person, "meeting": meeting}


def _generate_suggestions_from_state(
    intent: str, query: str, agent_result: str, session_context: list[dict]
) -> list[str]:
    """Generate 3-4 contextual follow-up suggestions from templates."""
    templates = _SUGGESTION_TEMPLATES.get(intent, _SUGGESTION_TEMPLATES["general"])
    entities = _extract_entities(query, agent_result)

    # Also check the last turn context for a fallback person
    if not entities["person"] and session_context:
        last = session_context[-1]
        entities["person"] = last.get("person", "")
        entities["meeting"] = entities.get("meeting") or last.get("meeting", "")

    slot_map = _SafeMap(entities)
    results: list[str] = []

    for tmpl in templates:
        filled = tmpl.format_map(slot_map)
        # Drop any unfilled slot placeholder leaking through
        if "{" in filled:
            continue
        # Drop suggestions with empty entity slots (double-space or trailing preposition)
        if "  " in filled:
            continue
        stripped = filled.rstrip(" .,?")
        if stripped.endswith(("with", "from", "about", "for", "meeting", "of")):
            continue
        # Skip if the filled value ends with a bare "?" after an entity slot was empty
        if filled.endswith(" ?") or filled.endswith("?") and filled[-3:-1] == "  ":
            continue
        results.append(filled)

    # If entity-filled suggestions are too few, pad with generic fallbacks
    generic = _SUGGESTION_TEMPLATES["general"]
    for g in generic:
        if len(results) >= 4:
            break
        if g not in results:
            results.append(g)

    return results[:4]


# --------------------------------------------------------------------------- #
# LLM factory
# --------------------------------------------------------------------------- #


def _make_llm() -> Any | None:
    """
    LLM factory — Groq first (fast, no daily quota), Gemini as fallback.
    Returns None when neither key is configured (heuristic-only mode).
    """
    settings = get_settings()

    if settings.GROQ_API_KEY:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.GROQ_MODEL,
            openai_api_key=settings.GROQ_API_KEY,
            openai_api_base="https://api.groq.com/openai/v1",
            temperature=0.1,
            max_retries=1,
            request_timeout=15,
        )

    if settings.GOOGLE_API_KEY:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL,
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=0.1,
            max_retries=0,
            request_timeout=12,
        )

    logger.warning("No LLM API key configured — running in heuristic-only mode.")
    return None


# --------------------------------------------------------------------------- #
# Node implementations
# --------------------------------------------------------------------------- #


async def classify_intent(state: JarvisState) -> dict[str, Any]:
    """Use Gemini to classify the user query into one of five intent categories."""
    query = state["query"]
    llm = _make_llm()

    if llm is None:
        # Heuristic fallback when no API key is configured
        q_lower = query.lower()
        if any(w in q_lower for w in ("meeting", "calendar", "schedule", "agenda")):
            intent: IntentType = "calendar_query"
        elif any(w in q_lower for w in ("action", "task", "todo", "follow-up", "followup")):
            intent = "action_items"
        elif any(w in q_lower for w in ("remember", "search", "transcript", "what did", "who said")):
            intent = "memory_search"
        elif any(w in q_lower for w in ("book", "create meeting", "set up meeting")):
            intent = "schedule_meeting"
        elif any(w in q_lower for w in ("free", "available", "availability", "busy", "slot", "open slot")):
            intent = "availability_query"
        elif any(w in q_lower for w in ("email", "inbox", "mail", "message", "unread")):
            intent = "email_query"
        else:
            intent = "general"
        logger.info("classify_intent (heuristic): %s", intent)
        return {"intent": intent}

    system = SystemMessage(
        content=(
            "You are an intent classifier for JARVIS, an AI executive assistant. "
            "Classify the user query into exactly one of these categories:\n"
            "  calendar_query     - questions about past or upcoming meetings\n"
            "  action_items       - questions about tasks, to-dos, follow-ups\n"
            "  memory_search      - searching meeting transcripts or notes\n"
            "  schedule_meeting   - requests to book or create a new meeting\n"
            "  availability_query - checking free/busy status or calendar availability\n"
            "  email_query        - reading inbox, emails, or messages\n"
            "  general            - anything else\n\n"
            "Respond with ONLY the category name, nothing else."
        )
    )
    human = HumanMessage(content=query)

    try:
        response = await llm.ainvoke([system, human])
        raw = response.content.strip().lower()
        valid: set[str] = {
            "calendar_query", "action_items", "memory_search",
            "schedule_meeting", "availability_query", "email_query", "general",
        }
        intent = raw if raw in valid else "general"
    except Exception:
        logger.warning("classify_intent LLM call failed; falling back to heuristic")
        q_lower = query.lower()
        if any(w in q_lower for w in ("meeting", "calendar", "schedule", "agenda", "today", "week", "tomorrow")):
            intent = "calendar_query"
        elif any(w in q_lower for w in ("action", "task", "todo", "follow-up", "followup", "overdue")):
            intent = "action_items"
        elif any(w in q_lower for w in ("remember", "search", "transcript", "what did", "who said", "budget", "review")):
            intent = "memory_search"
        elif any(w in q_lower for w in ("free", "available", "availability", "busy", "slot")):
            intent = "availability_query"
        elif any(w in q_lower for w in ("email", "inbox", "mail", "unread")):
            intent = "email_query"
        elif any(w in q_lower for w in ("book", "create meeting", "set up")):
            intent = "schedule_meeting"
        else:
            intent = "general"

    logger.info("classify_intent: '%s' -> %s", query[:60], intent)
    return {"intent": intent}


async def calendar_agent(state: JarvisState) -> dict[str, Any]:
    """Fetch recent meetings and format them as readable text."""
    try:
        provider = get_provider()
        meetings = await provider.get_recent_meetings(days=7)
    except Exception:
        logger.exception("calendar_agent: provider call failed")
        return {"agent_result": "I was unable to retrieve your calendar at this time.", "data_source": "none"}

    if not meetings:
        return {"agent_result": "No meetings found in the past 14 days.", "data_source": "pg_database"}

    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%A, %d %B %Y")
    lines = [f"Meetings relative to today ({today_str}):"]
    for m in meetings[:10]:
        date_str = str(m.get("meeting_date", ""))[:16]
        title = m.get("title", "(Untitled)")
        attendees_raw = m.get("attendees", [])
        if isinstance(attendees_raw, str):
            try:
                attendees_raw = json.loads(attendees_raw)
            except Exception:
                attendees_raw = []
        names = ", ".join(a.get("name", "") for a in (attendees_raw or []) if isinstance(a, dict) and a.get("name"))
        summary = m.get("summary", "")
        line = f"- {date_str}: {title}"
        if names:
            line += f" (with {names})"
        if summary:
            line += f". {summary[:120]}"
        lines.append(line)

    return {"agent_result": "\n".join(lines), "data_source": "pg_database"}


async def action_items_agent(state: JarvisState) -> dict[str, Any]:
    """Fetch open action items and format them."""
    try:
        provider = get_provider()
        items = await provider.get_action_items()
    except Exception:
        logger.exception("action_items_agent: provider call failed")
        return {"agent_result": "I was unable to retrieve your action items at this time.", "data_source": "none"}

    if not items:
        return {"agent_result": "You have no open action items right now.", "data_source": "pg_database"}

    lines = ["Your open action items:"]
    for item in items[:10]:
        desc = item.get("description", "")
        priority = item.get("priority", "")
        due = str(item.get("due_date", "") or "no due date")[:10]
        assignee = item.get("assignee_name", "")
        meeting = item.get("meeting_title", "")
        line = f"- [{priority.upper()}] {desc}"
        if due and due != "no due date":
            line += f" (due {due})"
        if assignee:
            line += f" — assigned to {assignee}"
        if meeting:
            line += f" [from: {meeting}]"
        lines.append(line)

    return {"agent_result": "\n".join(lines), "data_source": "pg_database"}


async def memory_agent(state: JarvisState) -> dict[str, Any]:
    """Perform semantic search over meeting chunks."""
    query = state["query"]
    try:
        provider = get_provider()
        chunks = await provider.semantic_search(query, limit=5)
    except Exception:
        logger.exception("memory_agent: provider call failed")
        return {"agent_result": "I was unable to search the meeting memory at this time.", "data_source": "none"}

    if not chunks:
        return {"agent_result": f"No relevant meeting notes found for: '{query}'.", "data_source": "pg_database"}

    lines = [f"Relevant meeting notes for '{query}':"]
    for chunk in chunks:
        speaker = chunk.get("speaker", "Unknown")
        content = chunk.get("content", "")
        meeting = chunk.get("meeting_title", "")
        date_str = str(chunk.get("meeting_date", ""))[:10]
        lines.append(f"- [{meeting} | {date_str}] {speaker}: {content[:200]}")

    return {"agent_result": "\n".join(lines), "data_source": "pg_database"}


async def general_agent(state: JarvisState) -> dict[str, Any]:
    """Direct Gemini answer for general or schedule-meeting queries."""
    query = state["query"]
    llm = _make_llm()

    if llm is None:
        return {
            "agent_result": (
                "I'm sorry, I cannot process your request right now because "
                "the AI service is not configured. Please set GROQ_API_KEY or GOOGLE_API_KEY."
            ),
            "data_source": "none",
        }

    system = SystemMessage(
        content=(
            "You are JARVIS, an AI executive assistant for a Mercedes-Benz CEO. "
            "Be concise. Answer in 2-3 sentences max. "
            "Be professional, precise, and helpful."
        )
    )
    human = HumanMessage(content=query)

    try:
        response = await llm.ainvoke([system, human])
        result = response.content.strip()
    except Exception as exc:
        logger.warning("general_agent LLM call failed: %s", exc)
        result = (
            "I'm unable to reach the AI service right now due to rate limits. "
            "For calendar, meetings, or action items, please ask specifically — "
            "those work directly from your database."
        )

    return {"agent_result": result, "data_source": "general"}


async def compose_response(state: JarvisState) -> dict[str, Any]:
    """
    Final LLM pass: turn the raw agent_result into natural spoken English
    (1-3 sentences) suitable for a voice assistant.
    """
    agent_result = state.get("agent_result", "")
    query = state["query"]
    data_source = state.get("data_source", "")
    subject_person = state.get("subject_person", "")
    llm = _make_llm()

    if llm is None:
        return {"final_response": agent_result}

    now_utc = datetime.now(timezone.utc)
    now_str = now_utc.strftime("%A, %d %B %Y, %H:%M UTC")

    # Add transparency hint for agenda/fallback sources
    source_hint = {
        "live_calendar": "",
        "pg_database": "",
        "agenda_file": f"The response is based on {subject_person + chr(39) + 's' if subject_person else 'an'} agenda document. ",
        "none": "",
        "general": "",
    }.get(data_source, "")

    system = SystemMessage(
        content=(
            "You are JARVIS, an AI voice assistant for a Mercedes-Benz CEO. "
            f"Current date and time: {now_str}. "
            "Use this to correctly interpret 'today', 'tomorrow', 'this week'. "
            f"{source_hint}"
            "Convert the following data or answer into a natural, spoken English response. "
            "Be concise — 1 to 3 sentences. "
            "Do not use bullet points, markdown, or lists. "
            "Speak directly to the CEO in second person."
        )
    )
    human = HumanMessage(
        content=(
            f"User asked: {query}\n\n"
            f"Data / preliminary answer:\n{agent_result}"
        )
    )

    try:
        response = await llm.ainvoke([system, human])
        final = response.content.strip()
    except Exception as exc:
        logger.warning("compose_response LLM call failed: %s; returning structured result", exc)
        lines = [l.strip().lstrip('- ').strip() for l in agent_result.splitlines() if l.strip() and not l.startswith('#')]
        final = ' '.join(lines[:6])

    return {"final_response": final}


async def generate_suggestions(state: JarvisState) -> dict[str, Any]:
    """Generate 3-4 contextual follow-up suggestions using template engine."""
    intent = state.get("intent", "general")
    query = state.get("query", "")
    agent_result = state.get("agent_result", "")
    session_context = state.get("session_context", [])

    suggestions = _generate_suggestions_from_state(intent, query, agent_result, session_context)
    logger.debug("generate_suggestions: intent=%s -> %s", intent, suggestions)
    return {"suggestions": suggestions}


# --------------------------------------------------------------------------- #
# Routing function
# --------------------------------------------------------------------------- #


def route_intent(state: JarvisState) -> str:
    """Conditional edge: maps intent to the appropriate agent node name."""
    intent = state.get("intent", "general")
    routing: dict[str, str] = {
        "calendar_query": "calendar_agent",
        "action_items": "action_items_agent",
        "memory_search": "memory_agent",
        "schedule_meeting": "general_agent",
        "availability_query": "availability_agent",
        "email_query": "email_agent",
        "general": "general_agent",
    }
    return routing.get(intent, "general_agent")


# --------------------------------------------------------------------------- #
# Graph compilation
# --------------------------------------------------------------------------- #


def build_graph() -> Any:
    """Build and compile the JARVIS LangGraph StateGraph."""
    builder = StateGraph(JarvisState)

    # Add nodes
    builder.add_node("classify_intent", classify_intent)
    builder.add_node("calendar_agent", calendar_agent)
    builder.add_node("action_items_agent", action_items_agent)
    builder.add_node("memory_agent", memory_agent)
    builder.add_node("general_agent", general_agent)
    builder.add_node("availability_agent", availability_agent)
    builder.add_node("email_agent", email_agent)
    builder.add_node("compose_response", compose_response)
    builder.add_node("generate_suggestions", generate_suggestions)

    # Entry point
    builder.set_entry_point("classify_intent")

    # Conditional routing after classification
    builder.add_conditional_edges(
        "classify_intent",
        route_intent,
        {
            "calendar_agent": "calendar_agent",
            "action_items_agent": "action_items_agent",
            "memory_agent": "memory_agent",
            "general_agent": "general_agent",
            "availability_agent": "availability_agent",
            "email_agent": "email_agent",
        },
    )

    # All agent nodes flow into compose_response
    for agent_node in (
        "calendar_agent",
        "action_items_agent",
        "memory_agent",
        "general_agent",
        "availability_agent",
        "email_agent",
    ):
        builder.add_edge(agent_node, "compose_response")

    # compose_response → generate_suggestions → END
    builder.add_edge("compose_response", "generate_suggestions")
    builder.add_edge("generate_suggestions", END)

    return builder.compile()


# Module-level compiled graph (populated during app lifespan)
_graph: Any = None


def init_graph() -> None:
    """Compile the graph and store it in the module-level variable."""
    global _graph
    _graph = build_graph()
    logger.info("LangGraph JARVIS supervisor compiled successfully")


async def run_query(query: str, session_context: list[dict] | None = None) -> dict[str, Any]:
    """
    Entry point for the JARVIS supervisor.
    Returns dict with 'response' (str) and 'suggestions' (list[str]).
    """
    if _graph is None:
        raise RuntimeError("LangGraph has not been initialised. Call init_graph() first.")

    initial_state: JarvisState = {
        "messages": [],
        "query": query,
        "intent": "",
        "agent_result": "",
        "final_response": "",
        "suggestions": [],
        "data_source": "",
        "subject_person": "",
        "session_context": session_context or [],
    }

    try:
        result = await _graph.ainvoke(initial_state)
        return {
            "response": result.get("final_response", "I'm sorry, I couldn't generate a response."),
            "suggestions": result.get("suggestions", []),
            "intent": result.get("intent", "general"),
        }
    except Exception:
        logger.exception("run_query failed for query: %s", query[:80])
        return {
            "response": (
                "I encountered an unexpected error while processing your request. "
                "Please try again."
            ),
            "suggestions": [],
            "intent": "general",
        }

