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
                               compose_response --> END
"""

import json
from datetime import datetime, timezone
import logging
from typing import Annotated, Any, Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
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


# --------------------------------------------------------------------------- #
# LLM factory
# --------------------------------------------------------------------------- #


def _make_llm() -> ChatGoogleGenerativeAI | None:
    settings = get_settings()
    if not settings.GOOGLE_API_KEY:
        logger.warning("GOOGLE_API_KEY is not set; LLM calls will return placeholder responses.")
        return None
    return ChatGoogleGenerativeAI(
        model=settings.GEMINI_MODEL,
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=0.1,
        max_retries=0,          # fail fast on 429 — don't retry for hours
        request_timeout=12,     # hard timeout per call
    )


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
        # Heuristic fallback so data queries still work when LLM quota is exhausted
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
        return {"agent_result": "I was unable to retrieve your calendar at this time."}

    if not meetings:
        return {"agent_result": "No meetings found in the past 14 days."}

    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%A, %d %B %Y")
    lines = [f"Meetings relative to today ({today_str}):"]
    for m in meetings[:10]:  # cap at 10 for voice response
        date_str = str(m.get("meeting_date", ""))[:16]
        title = m.get("title", "(Untitled)")
        attendees_raw = m.get("attendees", [])
        if isinstance(attendees_raw, str):
            import json as _json
            try:
                attendees_raw = _json.loads(attendees_raw)
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

    return {"agent_result": "\n".join(lines)}


async def action_items_agent(state: JarvisState) -> dict[str, Any]:
    """Fetch open action items and format them."""
    try:
        provider = get_provider()
        items = await provider.get_action_items()
    except Exception:
        logger.exception("action_items_agent: provider call failed")
        return {"agent_result": "I was unable to retrieve your action items at this time."}

    if not items:
        return {"agent_result": "You have no open action items right now."}

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

    return {"agent_result": "\n".join(lines)}


async def memory_agent(state: JarvisState) -> dict[str, Any]:
    """Perform semantic search over meeting chunks."""
    query = state["query"]
    try:
        provider = get_provider()
        chunks = await provider.semantic_search(query, limit=5)
    except Exception:
        logger.exception("memory_agent: provider call failed")
        return {"agent_result": "I was unable to search the meeting memory at this time."}

    if not chunks:
        return {"agent_result": f"No relevant meeting notes found for: '{query}'."}

    lines = [f"Relevant meeting notes for '{query}':"]
    for chunk in chunks:
        speaker = chunk.get("speaker", "Unknown")
        content = chunk.get("content", "")
        meeting = chunk.get("meeting_title", "")
        date_str = str(chunk.get("meeting_date", ""))[:10]
        lines.append(f"- [{meeting} | {date_str}] {speaker}: {content[:200]}")

    return {"agent_result": "\n".join(lines)}


async def general_agent(state: JarvisState) -> dict[str, Any]:
    """Direct Gemini answer for general or schedule-meeting queries."""
    query = state["query"]
    llm = _make_llm()

    if llm is None:
        return {
            "agent_result": (
                "I'm sorry, I cannot process your request right now because "
                "the AI service is not configured. Please set the GOOGLE_API_KEY."
            )
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

    return {"agent_result": result}


async def compose_response(state: JarvisState) -> dict[str, Any]:
    """
    Final LLM pass: turn the raw agent_result into natural spoken English
    (1-3 sentences) suitable for a voice assistant.
    """
    agent_result = state.get("agent_result", "")
    query = state["query"]
    llm = _make_llm()

    if llm is None:
        # Return agent_result verbatim if LLM is unavailable
        return {"final_response": agent_result}

    now_utc = datetime.now(timezone.utc)
    now_str = now_utc.strftime("%A, %d %B %Y, %H:%M UTC")
    system = SystemMessage(
        content=(
            "You are JARVIS, an AI voice assistant for a Mercedes-Benz CEO. "
            f"Current date and time: {now_str}. "
            "Use this to correctly interpret 'today', 'tomorrow', 'this week'. "
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
        # Strip bullet-point lines into a readable sentence flow
        lines = [l.strip().lstrip('- ').strip() for l in agent_result.splitlines() if l.strip() and not l.startswith('#')]
        final = ' '.join(lines[:6])  # first 6 data lines, joined as prose

    return {"final_response": final}


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

    # compose_response → END
    builder.add_edge("compose_response", END)

    return builder.compile()


# Module-level compiled graph (populated during app lifespan)
_graph: Any = None


def init_graph() -> None:
    """Compile the graph and store it in the module-level variable."""
    global _graph
    _graph = build_graph()
    logger.info("LangGraph JARVIS supervisor compiled successfully")


async def run_query(query: str) -> str:
    """
    Entry point for the JARVIS supervisor.
    Returns a spoken-English response string.
    """
    if _graph is None:
        raise RuntimeError("LangGraph has not been initialised. Call init_graph() first.")

    initial_state: JarvisState = {
        "messages": [],
        "query": query,
        "intent": "",
        "agent_result": "",
        "final_response": "",
    }

    try:
        result = await _graph.ainvoke(initial_state)
        return result.get("final_response", "I'm sorry, I couldn't generate a response.")
    except Exception:
        logger.exception("run_query failed for query: %s", query[:80])
        return (
            "I encountered an unexpected error while processing your request. "
            "Please try again."
        )
