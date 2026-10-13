from __future__ import annotations

import logging
import os
from collections import deque
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.agents.supervisor import init_graph, run_query, _load_people_cache
from app.config import get_settings
from app.db.pool import close_pool, create_pool
from app.providers import init_provider, get_provider
from app.routers.agenda import router as agenda_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# Per-WebSocket session context (keyed by str(websocket.client), maxlen=5 turns)
_sessions: dict[str, deque] = {}


# --------------------------------------------------------------------------- #
# Lifespan
# --------------------------------------------------------------------------- #


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup: create DB pool, init provider, compile LangGraph, load caches."""
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

    # Pre-load people names for fast entity extraction in suggestion engine
    await _load_people_cache()

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
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agenda_router)


# --------------------------------------------------------------------------- #
# HTTP endpoints
# --------------------------------------------------------------------------- #


@app.get("/health", tags=["System"])
async def health() -> dict[str, Any]:
    """Basic health check."""
    settings = get_settings()
    if settings.GROQ_API_KEY:
        llm_provider = "groq"
        llm_model = settings.GROQ_MODEL
    elif settings.GOOGLE_API_KEY:
        llm_provider = "gemini"
        llm_model = settings.GEMINI_MODEL
    else:
        llm_provider = "none"
        llm_model = ""
    return {
        "status": "ok",
        "mock_mode": settings.USE_MOCK_DATA,
        "llm_provider": llm_provider,
        "llm_model": llm_model,
        "llm_configured": llm_provider != "none",
        "version": "2.0.0",
        "features": ["suggestions", "agenda_fallback"],
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


@app.get("/test", tags=["System"], include_in_schema=False)
async def test_ui() -> FileResponse:
    """Browser-based test UI — send text queries and see responses without the mobile app."""
    html_path = os.path.join(os.path.dirname(__file__), "test_ui.html")
    return FileResponse(path=html_path, media_type="text/html")


@app.get("/qa", tags=["System"], include_in_schema=False)
async def qa_dashboard() -> FileResponse:
    """Structured QA dashboard — automated test suite, REST inspector, agenda upload tester."""
    html_path = os.path.join(os.path.dirname(__file__), "qa_dashboard.html")
    return FileResponse(path=html_path, media_type="text/html")


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
        {
          "type": "response",
          "text": "<spoken-English answer>",
          "suggestions": ["<follow-up 1>", "<follow-up 2>", "<follow-up 3>"]
        }

    Error message:
        {"type": "error", "text": "<error description>"}
    """
    await websocket.accept()
    client_key = str(websocket.client)
    _sessions[client_key] = deque(maxlen=5)
    logger.info("WebSocket client connected: %s", client_key)

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

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

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
                session_ctx = list(_sessions.get(client_key, []))
                result = await run_query(text, session_context=session_ctx)
                answer = result["response"]
                suggestions = result.get("suggestions", [])
                intent = result.get("intent", "general")

                # Store turn in session context for next-turn entity resolution
                _sessions[client_key].append({
                    "query": text,
                    "intent": intent,
                    "response": answer[:200],
                })

                await websocket.send_json({
                    "type": "response",
                    "text": answer,
                    "suggestions": suggestions,
                })
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
        logger.info("WebSocket client disconnected: %s", client_key)
    except Exception:
        logger.exception("Unexpected error in WebSocket handler")
    finally:
        _sessions.pop(client_key, None)
