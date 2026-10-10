from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.agents.supervisor import init_graph, run_query
from app.config import get_settings
from app.db.pool import close_pool, create_pool
from app.providers import init_provider, get_provider

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Lifespan
# --------------------------------------------------------------------------- #


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup: create DB pool, init provider, compile LangGraph."""
    settings = get_settings()
    logger.info("JARVIS backend starting up (mock_mode=%s)", settings.USE_MOCK_DATA)

    try:
        pool = await create_pool(settings.asyncpg_dsn)
    except Exception:
        logger.exception(
            "Failed to connect to PostgreSQL at %s — "
            "continuing without a DB pool (some endpoints will fail)",
            settings.asyncpg_dsn.split("@")[-1],
        )
        pool = None  # type: ignore[assignment]

    init_provider(pool)  # type: ignore[arg-type]
    init_graph()

    logger.info("JARVIS backend ready")
    yield

    # Shutdown
    await close_pool()
    logger.info("JARVIS backend shut down cleanly")


# --------------------------------------------------------------------------- #
# Application
# --------------------------------------------------------------------------- #

app = FastAPI(
    title="JARVIS Executive Assistant API",
    description="Voice AI backend for a Mercedes-Benz CEO prototype.",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow all origins for the prototype (tighten in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# HTTP endpoints
# --------------------------------------------------------------------------- #


@app.get("/health", tags=["System"])
async def health() -> dict[str, Any]:
    """Basic health check."""
    settings = get_settings()
    return {
        "status": "ok",
        "mock_mode": settings.USE_MOCK_DATA,
        "gemini_model": settings.GEMINI_MODEL,
        "llm_configured": bool(settings.GOOGLE_API_KEY),
    }


@app.get("/api/meetings", tags=["Calendar"])
async def list_meetings(days: int = 14) -> dict[str, Any]:
    """Return meetings from the past *days* calendar days."""
    try:
        provider = get_provider()
        meetings = await provider.get_recent_meetings(days=days)
        return {"ok": True, "count": len(meetings), "meetings": meetings}
    except Exception as exc:
        logger.exception("/api/meetings failed")
        return {"ok": False, "error": str(exc), "meetings": []}


@app.get("/api/action-items", tags=["Tasks"])
async def list_action_items() -> dict[str, Any]:
    """Return all open action items."""
    try:
        provider = get_provider()
        items = await provider.get_action_items()
        return {"ok": True, "count": len(items), "action_items": items}
    except Exception as exc:
        logger.exception("/api/action-items failed")
        return {"ok": False, "error": str(exc), "action_items": []}


@app.get("/api/people", tags=["People"])
async def list_people() -> dict[str, Any]:
    """Return the full roster of known people."""
    try:
        provider = get_provider()
        people = await provider.get_people()
        return {"ok": True, "count": len(people), "people": people}
    except Exception as exc:
        logger.exception("/api/people failed")
        return {"ok": False, "error": str(exc), "people": []}


@app.get("/apk", tags=["System"], include_in_schema=False)
async def download_apk() -> FileResponse:
    """Serve the latest JARVIS APK for direct download."""
    apk_path = os.getenv("APK_PATH", "/apk/jarvis.apk")
    if not os.path.exists(apk_path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="APK not yet built — see README.")
    return FileResponse(
        path=apk_path,
        filename="jarvis.apk",
        media_type="application/vnd.android.package-archive",
    )


# --------------------------------------------------------------------------- #
# WebSocket endpoint
# --------------------------------------------------------------------------- #


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """
    Real-time voice query interface.

    Expected inbound message:
        {"type": "query", "text": "<user query string>"}

    Outbound message:
        {"type": "response", "text": "<spoken-English answer>"}

    Error message:
        {"type": "error", "text": "<error description>"}
    """
    await websocket.accept()
    logger.info("WebSocket client connected: %s", websocket.client)

    try:
        while True:
            try:
                data: dict[str, Any] = await websocket.receive_json()
            except ValueError:
                await websocket.send_json(
                    {"type": "error", "text": "Invalid JSON. Send {\"type\":\"query\",\"text\":\"...\"}"}
                )
                continue

            msg_type = data.get("type", "")
            text = data.get("text", "").strip()

            if msg_type != "query" or not text:
                await websocket.send_json(
                    {
                        "type": "error",
                        "text": (
                            "Unrecognised message format. "
                            "Expected {\"type\": \"query\", \"text\": \"<your question>\"}."
                        ),
                    }
                )
                continue

            logger.info("WebSocket query: %s", text[:80])

            try:
                answer = await run_query(text)
                await websocket.send_json({"type": "response", "text": answer})
            except Exception as exc:
                logger.exception("run_query raised for WebSocket client")
                await websocket.send_json(
                    {
                        "type": "error",
                        "text": (
                            "I encountered an internal error while processing your request. "
                            f"Details: {exc}"
                        ),
                    }
                )

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected: %s", websocket.client)
    except Exception:
        logger.exception("Unexpected error in WebSocket handler")
