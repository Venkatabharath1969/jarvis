from __future__ import annotations

import logging
from typing import Optional

from asyncpg import Pool

from app.config import get_settings
from app.providers.base import CalendarProvider

logger = logging.getLogger(__name__)

_provider: Optional[CalendarProvider] = None


def init_provider(pool: Pool) -> CalendarProvider:
    """
    Initialise the global provider based on USE_MOCK_DATA.

    - USE_MOCK_DATA=true  → MockDBProvider (default for the prototype)
    - USE_MOCK_DATA=false → GraphAPIProvider if Graph credentials are present,
                            otherwise falls back to MockDBProvider with a warning.
    """
    global _provider
    settings = get_settings()

    if settings.USE_MOCK_DATA:
        from app.providers.mock_db import MockDBProvider
        _provider = MockDBProvider(pool)
        logger.info("Provider: MockDBProvider (USE_MOCK_DATA=true)")
        return _provider

    # Attempt to use the live Graph API
    graph_credentials_present = all(
        [
            settings.GRAPH_TENANT_ID,
            settings.GRAPH_CLIENT_ID,
            settings.GRAPH_CLIENT_SECRET,
            settings.GRAPH_USER_UPN,
        ]
    )

    if graph_credentials_present:
        from app.providers.graph_api import GraphAPIProvider
        _provider = GraphAPIProvider()
        logger.info("Provider: GraphAPIProvider (live Microsoft Graph)")
    else:
        from app.providers.mock_db import MockDBProvider
        _provider = MockDBProvider(pool)
        logger.warning(
            "USE_MOCK_DATA=false but Graph credentials are incomplete. "
            "Falling back to MockDBProvider. "
            "Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, "
            "GRAPH_USER_UPN to enable live data."
        )

    return _provider


def get_provider() -> CalendarProvider:
    """Return the active provider; raises RuntimeError if not initialised."""
    if _provider is None:
        raise RuntimeError(
            "Provider has not been initialised. Call init_provider() first."
        )
    return _provider
