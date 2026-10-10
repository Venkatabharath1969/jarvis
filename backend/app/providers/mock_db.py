from __future__ import annotations

import logging
from typing import Any

from asyncpg import Pool

from app.providers.base import CalendarProvider

logger = logging.getLogger(__name__)

# A zero-vector of dimension 1536 used for testing when real embeddings are absent.
_ZERO_VECTOR = "[" + ",".join(["0"] * 1536) + "]"


class MockDBProvider(CalendarProvider):
    """CalendarProvider backed by the local PostgreSQL database (seed data)."""

    def __init__(self, pool: Pool) -> None:
        self._pool = pool

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    async def get_recent_meetings(self, days: int = 14) -> list[dict[str, Any]]:
        query = """
            SELECT
                m.id,
                m.title,
                m.meeting_date,
                m.duration_minutes,
                m.summary,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'person_id', p.id,
                            'name',      p.name,
                            'role',      p.role,
                            'email',     p.email
                        )
                    ) FILTER (WHERE p.id IS NOT NULL),
                    '[]'::json
                ) AS attendees
            FROM meetings m
            LEFT JOIN meeting_attendees ma ON ma.meeting_id = m.id
            LEFT JOIN people p            ON p.id = ma.person_id
            WHERE m.meeting_date >= NOW() - ($1 || ' days')::interval
            GROUP BY m.id
            ORDER BY m.meeting_date DESC
        """
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query, str(days))
            return [dict(r) for r in rows]
        except Exception:
            logger.exception("get_recent_meetings failed")
            return []

    async def get_action_items(self) -> list[dict[str, Any]]:
        query = """
            SELECT
                ai.id,
                ai.description,
                ai.due_date,
                ai.status,
                ai.priority,
                p.name   AS assignee_name,
                p.role   AS assignee_role,
                m.title  AS meeting_title,
                m.meeting_date
            FROM action_items ai
            LEFT JOIN people   p ON p.id = ai.assignee_id
            LEFT JOIN meetings m ON m.id = ai.meeting_id
            ORDER BY
                CASE ai.priority
                    WHEN 'high'   THEN 1
                    WHEN 'medium' THEN 2
                    ELSE               3
                END,
                ai.due_date ASC NULLS LAST
        """
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query)
            return [dict(r) for r in rows]
        except Exception:
            logger.exception("get_action_items failed")
            return []

    async def get_people(self) -> list[dict[str, Any]]:
        query = """
            SELECT id, name, role, email, department, phone
            FROM people
            ORDER BY name
        """
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query)
            return [dict(r) for r in rows]
        except Exception:
            logger.exception("get_people failed")
            return []

    async def semantic_search(
        self, query: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        """
        Vector similarity search over meeting_chunks.
        Uses a zero-vector as placeholder until real embeddings are generated.
        In v2 this will call an embedding model to vectorise *query* first.
        """
        sql = """
            SELECT
                mc.id,
                mc.content,
                mc.speaker,
                mc.chunk_index,
                m.title        AS meeting_title,
                m.meeting_date
            FROM meeting_chunks mc
            JOIN meetings m ON m.id = mc.meeting_id
            WHERE mc.embedding IS NOT NULL
            ORDER BY mc.embedding <=> $1::vector
            LIMIT $2
        """
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(sql, _ZERO_VECTOR, limit)
            return [dict(r) for r in rows]
        except Exception:
            logger.exception("semantic_search failed (falling back to keyword scan)")
            # Graceful fallback: return most-recent chunks by text
            fallback_sql = """
                SELECT
                    mc.id,
                    mc.content,
                    mc.speaker,
                    mc.chunk_index,
                    m.title        AS meeting_title,
                    m.meeting_date
                FROM meeting_chunks mc
                JOIN meetings m ON m.id = mc.meeting_id
                WHERE mc.content ILIKE $1
                ORDER BY m.meeting_date DESC
                LIMIT $2
            """
            try:
                async with self._pool.acquire() as conn:
                    rows = await conn.fetch(fallback_sql, f"%{query}%", limit)
                return [dict(r) for r in rows]
            except Exception:
                logger.exception("semantic_search fallback also failed")
                return []
