#!/usr/bin/env bash
# deploy.sh — JARVIS deployment helper
# Usage: ./deploy.sh [local|prod]
# Default mode: local

set -euo pipefail

MODE="${1:-local}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PORT="${APP_PORT:-8000}"
HEALTH_URL="http://localhost:${APP_PORT}/health"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

# -------------------------------------------------------
# Colour helpers
# -------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Colour

info()    { echo -e "${GREEN}[JARVIS]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# -------------------------------------------------------
# 1. Validate mode
# -------------------------------------------------------
if [[ "$MODE" != "local" && "$MODE" != "prod" ]]; then
    die "Unknown mode '${MODE}'. Use: ./deploy.sh [local|prod]"
fi

info "Deploying JARVIS in ${MODE} mode..."

# -------------------------------------------------------
# 2. Check dependencies
# -------------------------------------------------------
check_deps() {
    local missing=()
    for cmd in docker git; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done
    # Docker Compose v2 (plugin) or v1 (standalone)
    if ! docker compose version &>/dev/null 2>&1 && ! command -v docker-compose &>/dev/null; then
        missing+=("docker-compose (or Docker Compose plugin)")
    fi
    if [[ ${#missing[@]} -gt 0 ]]; then
        die "Missing required tools: ${missing[*]}"
    fi
    info "Dependency check passed."
}

check_deps

# -------------------------------------------------------
# 3. Load environment file
# -------------------------------------------------------
load_env() {
    local env_file="${SCRIPT_DIR}/.env.${MODE}"
    if [[ ! -f "$env_file" ]]; then
        if [[ "$MODE" == "local" && -f "${SCRIPT_DIR}/.env" ]]; then
            env_file="${SCRIPT_DIR}/.env"
            warn ".env.local not found — falling back to .env"
        else
            die "Environment file not found: ${env_file}"$'\n'"  Copy .env.example to ${env_file} and fill in your values."
        fi
    fi
    info "Loading environment from ${env_file}"
    # Export variables for subprocesses (skip comments and blank lines)
    set -o allexport
    # shellcheck source=/dev/null
    source "$env_file"
    set +o allexport
    ENV_FILE="$env_file"
}

load_env

# -------------------------------------------------------
# 4. Production-only: pull latest code + nginx check
# -------------------------------------------------------
if [[ "$MODE" == "prod" ]]; then
    info "Pulling latest code from origin..."
    git -C "$SCRIPT_DIR" pull --ff-only || die "git pull failed. Resolve conflicts manually."

    info "Testing nginx configuration..."
    if command -v nginx &>/dev/null; then
        nginx -t || die "nginx config test failed. Fix before reloading."
    else
        warn "nginx not found — skipping nginx config test."
    fi
fi

# -------------------------------------------------------
# 5. Build + start containers
# -------------------------------------------------------
compose_up() {
    info "Building Docker images..."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build

    info "Starting services (detached)..."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

    info "Services started. Container status:"
    docker compose -f "$COMPOSE_FILE" ps
}

compose_up

# -------------------------------------------------------
# 6. Reload nginx (prod only, after containers are up)
# -------------------------------------------------------
if [[ "$MODE" == "prod" ]]; then
    if command -v systemctl &>/dev/null && systemctl is-active --quiet nginx 2>/dev/null; then
        info "Reloading nginx..."
        systemctl reload nginx && info "nginx reloaded." || warn "nginx reload failed — check systemd logs."
    else
        warn "nginx systemd service not active — skipping reload."
    fi
fi

# -------------------------------------------------------
# 7. Health check — poll /health up to 60 seconds
# -------------------------------------------------------
health_check() {
    info "Waiting for backend to become healthy (up to 60 s)..."
    local elapsed=0
    local interval=3
    local timeout=60

    while [[ $elapsed -lt $timeout ]]; do
        if curl -sf "${HEALTH_URL}" -o /dev/null 2>/dev/null; then
            info "Backend is healthy."
            return 0
        fi
        sleep "$interval"
        elapsed=$(( elapsed + interval ))
        echo -n "."
    done

    echo ""
    warn "Health check timed out after ${timeout}s."
    warn "Check logs with: docker compose -f ${COMPOSE_FILE} logs --tail=50 backend"
    return 1
}

health_check

# -------------------------------------------------------
# 8. Print URLs
# -------------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  JARVIS is running${NC}"
echo -e "${GREEN}========================================${NC}"

if [[ "$MODE" == "local" ]]; then
    echo -e "  Backend API  : http://localhost:${APP_PORT:-8000}"
    echo -e "  Health check : http://localhost:${APP_PORT:-8000}/health"
    echo -e "  API docs     : http://localhost:${APP_PORT:-8000}/docs"
else
    BASE_URL="${PUBLIC_BASE_URL:-https://utilsnow.com}"
    echo -e "  API endpoint : ${BASE_URL}/jarvis/api/"
    echo -e "  WebSocket    : ${BASE_URL}/jarvis/ws"
    echo -e "  APK download : ${BASE_URL}/jarvis/app.apk"
    echo -e "  Presentation : ${BASE_URL}/jarvis/presentation"
fi

echo -e "${GREEN}========================================${NC}"
echo ""
info "To tail logs: docker compose -f ${COMPOSE_FILE} logs -f backend"
info "To stop:      docker compose -f ${COMPOSE_FILE} down"
