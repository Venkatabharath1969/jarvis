from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------ #
    # Database
    # ------------------------------------------------------------------ #
    POSTGRES_USER: str = "jarvis"
    POSTGRES_PASSWORD: str = "jarvis"
    POSTGRES_DB: str = "jarvis"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    # Explicit override wins; otherwise built from the individual fields above.
    DATABASE_URL: Optional[str] = None

    @computed_field  # type: ignore[misc]
    @property
    def effective_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @computed_field  # type: ignore[misc]
    @property
    def asyncpg_dsn(self) -> str:
        """Plain asyncpg DSN (no SQLAlchemy driver prefix)."""
        if self.DATABASE_URL:
            # Strip the sqlalchemy driver prefix if present
            url = self.DATABASE_URL
            if url.startswith("postgresql+asyncpg://"):
                url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
            return url
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # ------------------------------------------------------------------ #
    # Feature flags
    # ------------------------------------------------------------------ #
    USE_MOCK_DATA: bool = True

    # ------------------------------------------------------------------ #
    # Google / Gemini
    # ------------------------------------------------------------------ #
    GOOGLE_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # ------------------------------------------------------------------ #
    # Microsoft Graph API
    # ------------------------------------------------------------------ #
    GRAPH_TENANT_ID: str = ""
    GRAPH_CLIENT_ID: str = ""
    GRAPH_CLIENT_SECRET: str = ""
    GRAPH_USER_UPN: str = ""

    # ------------------------------------------------------------------ #
    # Application
    # ------------------------------------------------------------------ #
    SECRET_KEY: str = "dev-secret-change-in-production"
    DEBUG: bool = False


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
