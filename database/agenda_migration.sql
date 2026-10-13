-- JARVIS v2 — Agenda Fallback Migration
-- Run: docker compose exec db psql -U jarvis -d jarvis -f /docker-entrypoint-initdb.d/agenda_migration.sql

-- Mark board members for agenda fallback detection
ALTER TABLE people ADD COLUMN IF NOT EXISTS is_board_member BOOLEAN DEFAULT FALSE;
UPDATE people SET is_board_member = TRUE
WHERE role ILIKE '%board%'
   OR role ILIKE '%supervisory%'
   OR department ILIKE '%board%';

-- Agenda file metadata
CREATE TABLE IF NOT EXISTS agenda_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       UUID REFERENCES people(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    file_type       TEXT NOT NULL CHECK (file_type IN ('pdf','docx','json')),
    raw_text        TEXT,
    uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Add chunk source discriminator to meeting_chunks
ALTER TABLE meeting_chunks ADD COLUMN IF NOT EXISTS chunk_source TEXT NOT NULL DEFAULT 'transcript'
    CHECK (chunk_source IN ('transcript','agenda'));
ALTER TABLE meeting_chunks ADD COLUMN IF NOT EXISTS agenda_person_id UUID REFERENCES people(id) ON DELETE SET NULL;
-- Allow NULL meeting_id for agenda-only chunks
ALTER TABLE meeting_chunks ALTER COLUMN meeting_id DROP NOT NULL;

GRANT ALL PRIVILEGES ON agenda_files TO jarvis;
