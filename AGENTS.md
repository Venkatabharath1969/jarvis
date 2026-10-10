# JARVIS — CEO Voice Assistant
## Architecture & Context for AI Agents

> Last updated: 2026-10-10 | Version: 1.3.0

---

## System Overview

JARVIS is an always-on AI voice assistant for a C-suite executive.
The Android app listens for "Hey Jarvis" (on-device, offline), then streams voice
to a backend that reasons over live calendar + memory data and replies in spoken English.

```
[Android App]
   │  Wake-word detected (Sherpa-ONNX, on-device)
   │  Google STT (speech → text)
   ▼
[WebSocket wss://utilsnow.com/jarvis/ws]
   │
   ▼
[FastAPI Backend — Docker on VPS 200.141.2.221]
   │
   ▼
[LangGraph Supervisor]
   │
   ├─ classify_intent ──────────────────────────────────────────────────────┐
   │                                                                         │
   ├─ calendar_agent      → PostgreSQL meetings table                       │
   ├─ action_items_agent  → PostgreSQL action_items table                   │
   ├─ memory_agent        → pgvector semantic search (HNSW index)           │
   ├─ availability_agent  → Graph API calendarView OR PostgreSQL            │
   ├─ email_agent         → Graph API inbox     OR stub []                  │
   └─ general_agent       → Gemini direct                                   │
           │                                                                 │
           └────────────── compose_response (Gemini voice-English) ─────────┘
                                   │
                                   ▼
                          [WebSocket response → Android TTS]
```

---

## Repository Layout

```
jarvis/
├── backend/                   FastAPI + LangGraph backend
│   ├── app/
│   │   ├── main.py            FastAPI app, WebSocket handler, lifespan
│   │   ├── config.py          Pydantic settings (reads .env)
│   │   ├── providers/
│   │   │   ├── base.py        CalendarProvider ABC
│   │   │   ├── mock_db.py     PostgreSQL (asyncpg) — USE_MOCK_DATA=true
│   │   │   └── graph_api.py   Microsoft Graph API — USE_MOCK_DATA=false
│   │   └── agents/
│   │       ├── supervisor.py  LangGraph StateGraph (classify → agents → compose)
│   │       └── graph_tools.py availability_agent + email_agent (Graph API nodes)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                  React Native 0.76.9 / Expo 52 (bare workflow)
│   ├── src/
│   │   ├── screens/
│   │   │   ├── VoiceScreen.tsx  Main UI — state machine, messages, mic
│   │   │   └── SettingsScreen.tsx
│   │   ├── hooks/
│   │   │   ├── useSpeech.ts     STT (callback API) + TTS (expo-speech)
│   │   │   ├── useWakeWord.ts   Sherpa-ONNX always-on foreground service
│   │   │   └── useWebSocket.ts  WebSocket client with auto-reconnect
│   │   └── components/
│   │       ├── MicButton.tsx    Animated mic/speaker button
│   │       ├── MicSvgIcon.tsx   Google Material SVG icons
│   │       ├── MessageBubble.tsx
│   │       └── StatusDot.tsx
│   └── android/
├── database/
│   └── init.sql               PostgreSQL schema + seed data
├── docker-compose.yml         VPS deployment (db + backend)
├── nginx-jarvis.conf          Nginx reverse proxy config (port 8001)
├── .env.example               All configurable env vars (template)
├── .github/workflows/
│   └── deploy.yml             GitHub Actions CI/CD
└── AGENTS.md                  ← this file
```

---

## Key Technical Decisions

| Decision | Choice | Why |
|---|---|---|
| LLM | Groq `openai/gpt-oss-120b` (Gemini fallback) | 1000 RPM, no daily limit; Gemini had 20 RPD free cap |
| STT | Android Google Voice Recognition | No cloud cost, accurate |
| Wake word | Sherpa-ONNX (ONNX model in APK) | Fully offline |
| DB | PostgreSQL 16 + pgvector | Structured + semantic search |
| WS transport | Raw WebSocket (not SocketIO) | Lower overhead for voice |
| APK signing | Debug keystore | Internal distribution only |
| Provider pattern | `USE_MOCK_DATA=true/false` | Swap mock↔live without code change |

---

## Intent Routing

| Intent | Trigger keywords | Agent |
|---|---|---|
| `calendar_query` | meeting, calendar, schedule, agenda | `calendar_agent` |
| `action_items` | action, task, todo, follow-up | `action_items_agent` |
| `memory_search` | remember, search, transcript, who said | `memory_agent` |
| `schedule_meeting` | book, create meeting, set up meeting | `general_agent` |
| `availability_query` | free, available, busy, slot | `availability_agent` |
| `email_query` | email, inbox, mail, unread | `email_agent` |
| `general` | anything else | `general_agent` (Gemini direct) |

---

## Data Providers

### MockDBProvider (`USE_MOCK_DATA=true`)
- Queries PostgreSQL tables directly via asyncpg
- `get_recent_meetings`: past + 30 days future, ordered ASC
- `check_availability`: overlapping meetings query
- `get_inbox_messages`: returns `[]` (stub)

### GraphAPIProvider (`USE_MOCK_DATA=false`)
- MSAL client credentials flow (non-interactive, background service)
- Token cached with 60-second early-expiry buffer
- Async token acquisition via `asyncio.to_thread` (MSAL is sync)
- `check_availability`: `GET /users/{upn}/calendarView?startDateTime=...&endDateTime=...`
- `get_inbox_messages`: `GET /users/{upn}/mailFolders/inbox/messages`

**Required Azure permissions (Application, admin-consented):**
- `Calendars.Read`
- `Mail.Read`

---

## Database Schema (PostgreSQL 16 + pgvector)

```sql
meetings(id, title, meeting_date, duration_minutes, meeting_type, location,
         summary, attendees jsonb, action_items_count)
people(id, name, role, company, relationship_type, email, phone, notes)
meeting_attendees(id, meeting_id, person_id, role)
action_items(id, meeting_id, description, assignee_id, due_date, priority,
             status, created_at)
relationships(id, person_id_a, person_id_b, relationship_type, strength,
              context, last_interaction)
meeting_chunks(id, meeting_id, speaker, content, timestamp_offset,
               chunk_index, embedding vector(1536))
```

HNSW index on `meeting_chunks.embedding` for fast semantic search.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_USER` | Yes | `jarvis` | DB username |
| `POSTGRES_PASSWORD` | Yes | — | DB password |
| `POSTGRES_DB` | Yes | `jarvis` | DB name |
| `POSTGRES_HOST` | Yes | `db` | DB host (Docker service name) |
| `POSTGRES_PORT` | No | `5432` | DB port |
| `GROQ_API_KEY` | Yes (preferred) | — | Groq API key (console.groq.com) — 1000 RPM, no daily limit |
| `GROQ_MODEL` | No | `openai/gpt-oss-120b` | Groq model ID |
| `GOOGLE_API_KEY` | Fallback | — | Gemini API key — only used when GROQ_API_KEY is blank |
| `GEMINI_MODEL` | No | `gemini-3.5-flash` | Gemini model ID |
| `USE_MOCK_DATA` | No | `true` | `true` = PostgreSQL, `false` = Graph API |
| `GRAPH_TENANT_ID` | Graph only | — | Azure AD tenant ID |
| `GRAPH_CLIENT_ID` | Graph only | — | Azure App client ID |
| `GRAPH_CLIENT_SECRET` | Graph only | — | Azure App client secret |
| `GRAPH_USER_UPN` | Graph only | — | CEO's email (e.g. `ceo@mercedes-benz.com`) |
| `SECRET_KEY` | No | dev default | App secret (generate with `openssl rand -hex 32`) |
| `DEBUG` | No | `false` | Enable FastAPI debug mode |

---

## Deployment

### VPS (Docker Compose) — Current Production

```bash
# 1. Clone
git clone https://github.com/<org>/jarvis.git /root/jarvis
cd /root/jarvis

# 2. Configure
cp .env.example .env
vim .env          # set POSTGRES_PASSWORD, GOOGLE_API_KEY

# 3. Deploy
docker compose up -d --build

# 4. Init DB (first time only)
docker compose exec db psql -U jarvis -d jarvis -f /docker-entrypoint-initdb.d/init.sql

# 5. Deploy nginx config
cp nginx-jarvis.conf /etc/nginx/conf.d/jarvis.conf
nginx -t && systemctl reload nginx

# 6. Deploy APK
mkdir -p /var/www/jarvis
cp dist/app.apk /var/www/jarvis/app.apk
```

Backend is on `127.0.0.1:8001`; nginx proxies:
- `wss://utilsnow.com/jarvis/ws` → WebSocket
- `https://utilsnow.com/jarvis/api/` → REST
- `https://utilsnow.com/jarvis/app.apk` → APK download

### AWS ECS (optional cloud deployment)

```bash
# Build and push Docker image
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-1.amazonaws.com

docker build -t jarvis-backend backend/
docker tag jarvis-backend:latest <account>.dkr.ecr.ap-south-1.amazonaws.com/jarvis-backend:latest
docker push <account>.dkr.ecr.ap-south-1.amazonaws.com/jarvis-backend:latest

# Deploy via ECS task definition (see docs/aws-ecs.md)
```

### GitHub Actions CI/CD

Secrets required in GitHub repo settings:
- `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- `GOOGLE_API_KEY`, `POSTGRES_PASSWORD`, `SECRET_KEY`

Pipeline: `main` push → lint → build APK → deploy to VPS

---

## Frontend Build (APK)

```bash
cd frontend
npm install
./android/gradlew -p android assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
# Deploy: scp to VPS → /var/www/jarvis/app.apk
```

APK download URL (internal only): `https://utilsnow.com/jarvis/app.apk`

---

## Microsoft Entra ID Setup

1. Azure Portal → **App registrations** → New registration
2. Name: `JARVIS-Backend`, Supported account types: single tenant
3. **Certificates & secrets** → New client secret → copy the value
4. **API permissions** → Add:
   - `Microsoft Graph` → Application → `Calendars.Read`
   - `Microsoft Graph` → Application → `Mail.Read`
5. Click **Grant admin consent**
6. Copy Tenant ID, Client ID, Client Secret into `.env`
7. Set `USE_MOCK_DATA=false`
8. Restart: `docker compose restart backend`

---

## Security Notes

- `.env` is in `.gitignore` — never commit secrets
- PostgreSQL port `127.0.0.1:5432` only (not exposed externally)
- WebSocket uses WSS (TLS via nginx)
- MSAL token cached; refreshed 60s before expiry
- APK signed with debug keystore — for internal distribution only
