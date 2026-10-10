from __future__ import annotations

import logging
from typing import Optional

import asyncpg
from asyncpg import Pool

logger = logging.getLogger(__name__)

_pool: Optional[Pool] = None


async def create_pool(dsn: str) -> Pool:
    """Create and store a global asyncpg connection pool."""
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    logger.info("asyncpg pool created (dsn=%s)", dsn.split("@")[-1])  # hide credentials
    return _pool


def get_pool() -> Pool:
    """Return the active pool; raises RuntimeError if not initialised."""
    if _pool is None:
        raise RuntimeError("Database pool has not been initialised. Call create_pool() first.")
    return _pool


async def close_pool() -> None:
    """Gracefully close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("asyncpg pool closed")
