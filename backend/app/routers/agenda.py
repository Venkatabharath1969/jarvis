from __future__ import annotations

"""
Agenda file upload router for JARVIS.

POST /api/agenda/upload
  - Accepts PDF, DOCX, or JSON agenda files for a named person
  - Parses meeting slots and stores them in meeting_chunks with chunk_source='agenda'
  - Enables calendar fallback for board members with empty live calendar

Required packages: pypdf, python-docx (pip install pypdf python-docx)
"""

import io
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Form, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

from app.db.pool import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agenda", tags=["Agenda"])


def _get_pool_safe():
    """Return the DB pool or None without raising."""
    try:
        return get_pool()
    except RuntimeError:
        return None

# 1536-dim zero vector for placeholder embeddings (real embeddings require an embed model)
_ZERO_VEC = "[" + ",".join(["0"] * 1536) + "]"


async def _parse_pdf(data: bytes) -> str:
    """Extract all text from a PDF."""
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except ImportError:
        raise HTTPException(status_code=501, detail="pypdf not installed — PDF upload unavailable.")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"PDF parse error: {exc}")


async def _parse_docx(data: bytes) -> str:
    """Extract all paragraph text from a DOCX."""
    try:
        import docx
        doc = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        raise HTTPException(status_code=501, detail="python-docx not installed — DOCX upload unavailable.")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"DOCX parse error: {exc}")


def _extract_slots_from_json(data: bytes) -> list[dict[str, Any]]:
    """Parse structured JSON agenda: [{title, date, time, attendees, summary}]."""
    try:
        items = json.loads(data)
        if not isinstance(items, list):
            items = [items]
        slots = []
        for item in items:
            if isinstance(item, dict) and "title" in item:
                slots.append({
                    "title": item.get("title", ""),
                    "date": item.get("date", ""),
                    "time": item.get("time", ""),
                    "attendees": item.get("attendees", []),
                    "summary": item.get("summary", ""),
                })
        return slots
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"JSON parse error: {exc}")


async def _llm_extract_slots(text: str) -> list[dict[str, Any]]:
    """Use Groq to extract meeting slots from unstructured text."""
    from app.config import get_settings
    settings = get_settings()
    if not (settings.GROQ_API_KEY or settings.GOOGLE_API_KEY):
        # Graceful fallback: treat entire text as one chunk
        return [{"title": "Agenda", "date": "", "time": "", "attendees": [], "summary": text[:500]}]

    prompt = (
        "Extract all meeting slots from the following agenda text. "
        "Return a JSON array of objects with keys: title, date (YYYY-MM-DD), time (HH:MM), "
        "attendees (list of names), summary (1-2 sentences). "
        "Only return valid JSON, nothing else.\n\nAgenda text:\n" + text[:4000]
    )

    try:
        if settings.GROQ_API_KEY:
            from langchain_openai import ChatOpenAI
            from langchain_core.messages import HumanMessage
            llm = ChatOpenAI(
                model=settings.GROQ_MODEL,
                openai_api_key=settings.GROQ_API_KEY,
                openai_api_base="https://api.groq.com/openai/v1",
                temperature=0,
                max_retries=1,
                request_timeout=15,
            )
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            raw = response.content.strip()
        else:
            from langchain_google_genai import ChatGoogleGenerativeAI
            from langchain_core.messages import HumanMessage
            llm = ChatGoogleGenerativeAI(
                model=settings.GEMINI_MODEL,
                google_api_key=settings.GOOGLE_API_KEY,
                temperature=0,
                max_retries=0,
                request_timeout=12,
            )
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            raw = response.content.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        slots = json.loads(raw)
        if not isinstance(slots, list):
            slots = [slots]
        return slots
    except Exception as exc:
        logger.warning("LLM slot extraction failed: %s — using raw text chunk", exc)
        return [{"title": "Agenda", "date": "", "time": "", "attendees": [], "summary": text[:500]}]


@router.post("/upload")
async def upload_agenda(
    person_name: str = Form(..., description="Name of the board member (e.g. 'Bharath Kumar')"),
    file: UploadFile = File(..., description="PDF, DOCX, or JSON agenda file"),
) -> JSONResponse:
    """
    Upload an agenda file for a board member whose live calendar may be empty.
    Parsed slots are stored as meeting_chunks with chunk_source='agenda'.
    """
    pool = _get_pool_safe()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database pool not initialised.")

    content = await file.read()
    filename = file.filename or "agenda"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # Detect file type and extract text / slots
    if ext == "json":
        slots = _extract_slots_from_json(content)
        file_type = "json"
        raw_text = content.decode("utf-8", errors="replace")[:10000]
    elif ext == "pdf":
        raw_text = await _parse_pdf(content)
        slots = await _llm_extract_slots(raw_text)
        file_type = "pdf"
    elif ext in ("docx", "doc"):
        raw_text = await _parse_docx(content)
        slots = await _llm_extract_slots(raw_text)
        file_type = "docx"
    else:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'. Use pdf, docx, or json.")

    async with pool.acquire() as conn:
        # Resolve person by name
        row = await conn.fetchrow(
            "SELECT id, name FROM people WHERE name ILIKE $1 ORDER BY is_board_member DESC NULLS LAST LIMIT 1",
            f"%{person_name}%",
        )
        if not row:
            raise HTTPException(status_code=404, detail=f"Person '{person_name}' not found in database.")

        person_id = row["id"]
        person_resolved = row["name"]

        # Store agenda file metadata
        agenda_file_id = str(uuid.uuid4())
        try:
            await conn.execute(
                """
                INSERT INTO agenda_files (id, person_id, filename, file_type, raw_text)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT DO NOTHING
                """,
                agenda_file_id, person_id, filename, file_type, raw_text[:10000],
            )
        except Exception:
            logger.warning("agenda_files table may not exist — run agenda_migration.sql first")

        # Insert each slot as a meeting_chunk
        inserted = 0
        for i, slot in enumerate(slots):
            content_text = (
                f"{slot.get('title', '')} | {slot.get('date', '')} {slot.get('time', '')} "
                f"| Attendees: {', '.join(slot.get('attendees', [])) or 'N/A'} "
                f"| {slot.get('summary', '')}"
            ).strip()
            if not content_text:
                continue
            try:
                await conn.execute(
                    """
                    INSERT INTO meeting_chunks
                        (id, meeting_id, chunk_index, speaker, content, embedding,
                         chunk_source, agenda_person_id)
                    VALUES ($1, NULL, $2, $3, $4, $5::vector, 'agenda', $6)
                    """,
                    str(uuid.uuid4()),
                    i,
                    person_resolved,
                    content_text,
                    _ZERO_VEC,
                    person_id,
                )
                inserted += 1
            except Exception as exc:
                logger.warning("Failed to insert agenda chunk %d: %s", i, exc)

    return JSONResponse({
        "ok": True,
        "person": person_resolved,
        "person_id": str(person_id),
        "file_type": file_type,
        "slots_extracted": len(slots),
        "chunks_inserted": inserted,
        "message": (
            f"Uploaded {inserted} agenda chunk(s) for {person_resolved}. "
            "JARVIS will now use this agenda as a fallback when live calendar is empty."
        ),
    })
