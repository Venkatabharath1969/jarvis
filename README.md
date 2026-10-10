# JARVIS — Voice AI Executive Assistant

JARVIS is a voice-first AI executive assistant for enterprise use. The CEO speaks a question, JARVIS listens (wake word "Hey Jarvis" — always on, like "Ok Google"), routes the query through a LangGraph AI pipeline backed by Google Gemini 2.5 Flash, queries a PostgreSQL knowledge base, and replies in natural speech — all in under 2 seconds.

**No paid services required to run.** Wake word detection uses Apache 2.0 Sherpa-ONNX models. LLM uses Google Gemini free tier (1M tokens/day). TTS uses the device's system voice.

---

## Live Demo (VPS)

| What | URL |
|------|-----|
| Download APK | http://200.141.2.221:8765/apk |
| API health | http://200.141.2.221:8765/health |
| API docs | http://200.141.2.221:8765/docs |
| WebSocket | ws://200.141.2.221:8765/ws |

---

## Architecture

```
[Android Phone]
  │  "Hey Jarvis" → Sherpa-ONNX KWS (on-device, Apache 2.0, always-on)
  │  expo-speech TTS  ◄────────────────────────────────────────────┐
  │  WebSocket ws://<host>:8765/ws                                  │
  ▼                                                                 │
[FastAPI + LangGraph — Python 3.12]                                 │
  │  classify_intent → calendar_agent | action_agent | memory_agent │
  │  Google Gemini 2.5 Flash (free tier)                            │
  │  asyncpg → PostgreSQL 16 + pgvector                             │
  └─────────────────────────────────────────────────────────────────┘
[Docker Compose — one command deploy]
  db   : pgvector/pgvector:pg16   (schema + CEO seed data auto-loaded)
  backend: python:3.12-slim       (FastAPI + LangGraph + Gemini)
```

---

## Option A — Deploy on a VPS / Server (recommended for teams)

### Prerequisites

- Linux server (Ubuntu 22.04+ recommended), 2 GB RAM minimum
- Docker 24+ with Compose plugin (`docker compose version`)
- Port 8765 open in firewall (`ufw allow 8765/tcp`)

### Steps

```bash
git clone https://github.com/Venkatabharath1969/jarvis.git
cd jarvis
cp .env.example .env
nano .env          # set POSTGRES_PASSWORD and GOOGLE_API_KEY (see below)
docker compose up -d --build
```

Wait ~60 s for PostgreSQL to initialise. Then verify:

```bash
curl http://localhost:8765/health
# → {"status":"ok","llm_configured":true,"db_connected":true}
```

**Your team downloads the APK from:** `http://<your-server-ip>:8765/apk`

After installing the APK:
1. Open the app → Settings → set Backend URL to `ws://<your-server-ip>:8765/ws`
2. Toggle **Wake Word** ON
3. Say "Hey Jarvis" — the app opens automatically

---

## Option B — Deploy Locally (no VPS)

```bash
git clone https://github.com/Venkatabharath1969/jarvis.git
cd jarvis
cp .env.example .env
nano .env          # set POSTGRES_PASSWORD and GOOGLE_API_KEY
docker compose up -d --build
```

Backend runs at `http://localhost:8000` / `http://localhost:8765`.

To connect the phone to your laptop: your phone and laptop must be on the same Wi-Fi network. Use your laptop's LAN IP (e.g., `192.168.1.100`).

---

## Option C — Deploy to AWS (Docker image)

The same Docker Compose setup runs on any cloud VM:

### AWS EC2 — fastest path

```bash
# 1. Launch EC2: t3.small, Ubuntu 22.04, Security Group: open port 8765 inbound
# 2. SSH in and install Docker:
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker ubuntu && newgrp docker

# 3. Clone and run:
git clone https://github.com/Venkatabharath1969/jarvis.git
cd jarvis
cp .env.example .env
nano .env   # fill credentials
docker compose up -d --build

# 4. Get your EC2 public IP from AWS console, open port 8765 in Security Group
# APK download: http://<ec2-public-ip>:8765/apk
```

### AWS ECS / Fargate (container-native)

Push images to ECR and deploy via ECS. See `docs/aws-ecs.md` (drop-in task definition provided).

---

## Get a Free Google API Key

1. Go to [https://aistudio.google.com](https://aistudio.google.com)
2. Sign in with any Google account
3. Click **Get API key** → **Create API key**
4. Copy the key
5. Add to `.env`: `GOOGLE_API_KEY=AIza...`

Free tier: 1,500 requests/day, 1M tokens/day. No credit card.

---

## Build the APK Yourself

Only needed if you change the frontend code. A pre-built APK is served at `/apk`.

```bash
# Prerequisites: Node.js 20+, Android SDK 34, Java 17
cd frontend
npm install
cd android
export ANDROID_HOME=~/android-sdk JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
./gradlew assembleDebug
# APK at: app/build/outputs/apk/debug/app-debug.apk
cp app/build/outputs/apk/debug/app-debug.apk /path/to/jarvis/dist/jarvis.apk
docker compose restart backend   # serves the new APK
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | **Yes** | Choose a strong password |
| `GOOGLE_API_KEY` | **Yes** | Gemini key from aistudio.google.com |
| `USE_MOCK_DATA` | No (default `true`) | `false` to use live Microsoft 365 |
| `GEMINI_MODEL` | No (default `gemini-2.5-flash`) | Change to `gemini-2.0-flash` for faster responses |
| `GRAPH_TENANT_ID` | Only if `USE_MOCK_DATA=false` | Azure AD tenant ID |
| `GRAPH_CLIENT_ID` | Only if `USE_MOCK_DATA=false` | App registration client ID |
| `GRAPH_CLIENT_SECRET` | Only if `USE_MOCK_DATA=false` | App secret |
| `GRAPH_USER_UPN` | Only if `USE_MOCK_DATA=false` | CEO's email, e.g. `ceo@company.com` |

---

## Sample CEO Queries

| Say this | JARVIS answers |
|----------|----------------|
| "What meetings did I have this week?" | Lists 5 meetings with attendees and summaries |
| "What are my overdue action items?" | 3 overdue items with owners and deadlines |
| "Who is Klaus Weber and what did he commit to?" | VP APAC Sales, Hyundai JV review by Oct 14 |
| "Summarise my 1:1 with Bharath" | Q4 CapEx debate, FCF scenarios, 10% hardware cut |
| "What was the Project Delta disagreement?" | CTO prefers Q1 2029 go-live vs CEO's 2028 |

---

## Upgrade to Premium Voice (Amazon Polly)

The app ships with the device's built-in TTS. For a natural neural voice:

1. Create a free AWS account (1M Polly characters/month free for 12 months)
2. IAM user with `AmazonPollyReadOnlyAccess` → copy Access Key + Secret
3. App → Settings → Amazon Polly section → enter keys → toggle ON
4. Full guide: [docs/polly-upgrade.md](docs/polly-upgrade.md)

---

## Sharing with Your Team

The simplest way to share JARVIS with colleagues:

```
"Clone https://github.com/Venkatabharath1969/jarvis.git, copy .env.example to .env,
add your GOOGLE_API_KEY and a POSTGRES_PASSWORD, then run: docker compose up -d --build
APK is at http://localhost:8765/apk — download and install on Android."
```

Or share the GitHub URL with an AI assistant / dev environment — the README and `docker-compose.yml` contain everything needed for fully automated setup.
