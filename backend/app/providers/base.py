from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any


class CalendarProvider(ABC):
    """Abstract interface for all data providers (mock DB, Graph API, etc.)."""

    @abstractmethod
    async def get_recent_meetings(self, days: int = 14) -> list[dict[str, Any]]:
        """Return meetings from the past *days* calendar days."""
        ...

    @abstractmethod
    async def get_action_items(self) -> list[dict[str, Any]]:
        """Return all open action items."""
        ...

    @abstractmethod
    async def get_people(self) -> list[dict[str, Any]]:
        """Return the full roster of known people."""
        ...

    @abstractmethod
    async def semantic_search(
        self, query: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        """Semantic search over meeting transcripts / notes."""
        ...

    @abstractmethod
    async def check_availability(
        self, start: datetime, end: datetime
    ) -> dict:
        """Check free/busy for a window. Returns {free:bool, conflicts:list}."""
        ...

    @abstractmethod
    async def get_inbox_messages(
        self, limit: int = 10, unread_only: bool = False
    ) -> list[dict]:
        """Return recent inbox messages."""
        ...

