from __future__ import annotations

"""
Graph-API agent nodes for JARVIS supervisor.

availability_agent  — resolves a natural-language time window to a Graph
                      calendarView query, then returns free/busy status.
email_agent         — fetches recent inbox messages from Graph API.
"""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.config import get_settings
from app.providers import get_provider

logger = logging.getLogger(__name__)


def _llm() -> Any | None:
    """Use the same LLM factory as supervisor: Groq first, Gemini fallback."""
    settings = get_settings()
    if settings.GROQ_API_KEY:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.GROQ_MODEL,
            openai_api_key=settings.GROQ_API_KEY,
            openai_api_base="https://api.groq.com/openai/v1",
            temperature=0,
            max_retries=1,
            request_timeout=15,
        )
    if settings.GOOGLE_API_KEY:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL,
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=0,
        )
    return None


def _parse_datetime_range(text: str) -> tuple[datetime, datetime] | None:
    """Extract ISO datetime window from LLM output like '2026-10-11T19:30:00Z to 2026-10-11T20:30:00Z'."""
    iso_pattern = r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)"
    matches = re.findall(iso_pattern, text)
    if len(matches) >= 2:
        try:
            start = datetime.fromisoformat(matches[0].replace("Z", "+00:00"))
            end = datetime.fromisoformat(matches[1].replace("Z", "+00:00"))
            return start, end
        except ValueError:
            pass
    return None


async def _resolve_time_window(query: str) -> tuple[datetime, datetime]:
    """Use Gemini to convert natural language time expression to ISO UTC range."""
    now = datetime.now(timezone.utc)
    default_start = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    default_end = default_start + timedelta(hours=1)

    llm = _llm()
    if llm is None:
        return default_start, default_end

    now_str = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    system = SystemMessage(
        content=(
            f"Current UTC time: {now_str}. "
            "Extract a time window from the user query and return exactly two ISO 8601 UTC timestamps "
            "in this format: START_ISO to END_ISO. "
            "If no duration is stated, assume 1 hour. "
            "Do not include any other text."
        )
    )
    human = HumanMessage(content=query)

    try:
        response = await llm.ainvoke([system, human])
        result = _parse_datetime_range(response.content)
        if result:
            return result
    except Exception:
        logger.exception("_resolve_time_window LLM call failed")

    return default_start, default_end


async def availability_agent(state: dict[str, Any]) -> dict[str, Any]:
    """Check calendar availability for a time window derived from the query."""
    query = state["query"]

    try:
        start, end = await _resolve_time_window(query)
        provider = get_provider()
        result = await provider.check_availability(start, end)
    except Exception:
        logger.exception("availability_agent: provider call failed")
        return {"agent_result": "I was unable to check your calendar availability at this time."}

    if result.get("error"):
        return {"agent_result": "Calendar access is not configured. Please set up Microsoft Entra ID credentials."}

    start_fmt = start.strftime("%H:%M UTC on %A, %d %B")
    end_fmt = end.strftime("%H:%M UTC")

    if result["free"]:
        return {"agent_result": f"You are FREE from {start_fmt} to {end_fmt}. No conflicts found."}

    conflicts = result["conflicts"]
    conflict_lines = "\n".join(
        f"  - {c['title']} ({c.get('start', '')[:16].replace('T', ' ')} to {c.get('end', '')[:16].replace('T', ' ')})"
        for c in conflicts[:5]
    )
    return {
        "agent_result": (
            f"You are BUSY from {start_fmt} to {end_fmt}. "
            f"Conflicting events:\n{conflict_lines}"
        )
    }


async def email_agent(state: dict[str, Any]) -> dict[str, Any]:
    """Fetch and summarise recent inbox messages."""
    query = state["query"]
    unread_only = any(w in query.lower() for w in ("unread", "new", "unseen"))

    try:
        provider = get_provider()
        messages = await provider.get_inbox_messages(limit=10, unread_only=unread_only)
    except Exception:
        logger.exception("email_agent: provider call failed")
        return {"agent_result": "I was unable to retrieve your inbox at this time."}

    if not messages:
        label = "unread " if unread_only else ""
        return {"agent_result": f"You have no {label}emails in your inbox."}

    label = "unread " if unread_only else "recent "
    lines = [f"Your {label}inbox messages:"]
    for m in messages[:8]:
        received = str(m.get("received", ""))[:16].replace("T", " ")
        subject = m.get("subject", "(No subject)")
        sender = m.get("from_name", "Unknown")
        preview = m.get("preview", "")[:100]
        read_marker = "" if m.get("is_read") else "[UNREAD] "
        lines.append(f"- {read_marker}{received} | {sender}: {subject}. {preview}")

    return {"agent_result": "\n".join(lines)}
