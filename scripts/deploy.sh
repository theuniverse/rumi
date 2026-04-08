#!/usr/bin/env bash
# =============================================================================
#  scripts/deploy.sh — Rumi unified deployment script
#
#  Usage:
#    ./scripts/deploy.sh              # build and start all services
#    ./scripts/deploy.sh --no-cache   # force full rebuild (no layer cache)
#    ./scripts/deploy.sh --pull       # pull latest base images before build
#    ./scripts/deploy.sh down         # stop containers (data volumes preserved)
#    ./scripts/deploy.sh logs         # tail logs for all services
#    ./scripts/deploy.sh logs scraper # tail logs for a single service
#    ./scripts/deploy.sh ps           # show container status
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()  { echo -e "${RED}[deploy]${NC} $*" >&2; exit 1; }

# ── Parse arguments ───────────────────────────────────────────────────────────
SUBCOMMAND="${1:-up}"
BUILD_FLAGS=""

case "$SUBCOMMAND" in
  down)
    ok "Stopping services (data volumes preserved)…"
    docker compose -f "$COMPOSE_FILE" down
    ok "Done."
    exit 0
    ;;
  logs)
    SERVICE="${2:-}"
    docker compose -f "$COMPOSE_FILE" logs -f $SERVICE
    exit 0
    ;;
  ps)
    docker compose -f "$COMPOSE_FILE" ps
    exit 0
    ;;
  up|--no-cache|--pull)
    [[ "$*" == *"--no-cache"* ]] && BUILD_FLAGS="--no-cache"
    [[ "$*" == *"--pull"* ]]     && docker compose -f "$COMPOSE_FILE" pull
    ;;
  *)
    err "Unknown argument: $SUBCOMMAND. Usage: deploy.sh [up|down|logs|ps|--no-cache|--pull]"
    ;;
esac

# ── Pre-flight checks ─────────────────────────────────────────────────────────
ok "Running pre-flight checks…"

# 1. Docker daemon
docker info > /dev/null 2>&1 || err "Docker daemon is not running. Start Docker first."

# 2. backend/.env
BACKEND_ENV="$REPO_ROOT/backend/.env"
if [ ! -f "$BACKEND_ENV" ]; then
  if [ -f "${BACKEND_ENV}.example" ]; then
    warn "backend/.env not found — copying from .env.example"
    cp "${BACKEND_ENV}.example" "$BACKEND_ENV"
    err "Edit $BACKEND_ENV with real credentials, then re-run."
  else
    err "$BACKEND_ENV is missing and no .env.example found."
  fi
fi

# 3. scraper/.env
SCRAPER_ENV="$REPO_ROOT/scraper/.env"
if [ ! -f "$SCRAPER_ENV" ]; then
  if [ -f "${SCRAPER_ENV}.example" ]; then
    warn "scraper/.env not found — copying from .env.example"
    cp "${SCRAPER_ENV}.example" "$SCRAPER_ENV"
    warn "Edit $SCRAPER_ENV and set OPENROUTER_API_KEY before LLM features will work."
  else
    err "$SCRAPER_ENV is missing and no .env.example found."
  fi
fi

# 4. Check for placeholder credentials
if grep -qE "your-key-here|sk-or-v1-your" "$SCRAPER_ENV" 2>/dev/null; then
  warn "OPENROUTER_API_KEY is still a placeholder in scraper/.env — LLM extraction will fail."
fi
if grep -qE "rumi_pass|change_me_in_production" "$BACKEND_ENV" 2>/dev/null; then
  warn "Default passwords detected in backend/.env — update before exposing to the internet."
fi

# 5. Warn if scraper is pointed at localhost (common mistake when deploying from a dev machine)
if grep -qE "RSSHUB_BASE=http://localhost" "$SCRAPER_ENV" 2>/dev/null; then
  warn "scraper/.env: RSSHUB_BASE points to localhost — inside Docker the correct value is:"
  warn "  RSSHUB_BASE=http://wewe-rss:4000"
  warn "Fixing automatically…"
  sed -i.bak 's|RSSHUB_BASE=http://localhost:[0-9]*|RSSHUB_BASE=http://wewe-rss:4000|g' "$SCRAPER_ENV"
  ok "Fixed RSSHUB_BASE → http://wewe-rss:4000"
fi

# ── Build images ──────────────────────────────────────────────────────────────
ok "Building Docker images…"
docker compose -f "$COMPOSE_FILE" build $BUILD_FLAGS

# ── Start services ────────────────────────────────────────────────────────────
ok "Starting services…"
docker compose -f "$COMPOSE_FILE" up -d

# ── Wait for health checks ────────────────────────────────────────────────────
ok "Waiting for services to become healthy…"

# WeWeRSS DB must be healthy first (scraper depends on wewe-rss)
"$REPO_ROOT/scripts/wewerss.sh" compose-check

TIMEOUT=180
ELAPSED=0

wait_healthy() {
  local container="$1"
  local label="$2"
  while [ $ELAPSED -lt $TIMEOUT ]; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
    if [ "$STATUS" = "healthy" ]; then
      ok "$label is healthy."
      return 0
    fi
    if [ "$STATUS" = "unhealthy" ]; then
      echo ""
      warn "$label is unhealthy — check: docker compose logs $label"
    fi
    printf "."
    sleep 5
    ELAPSED=$((ELAPSED + 5))
  done
  echo ""
  err "$label did not become healthy within ${TIMEOUT}s. Run: docker compose logs $label"
}

# Backend and scraper in sequence
wait_healthy "rumi_backend" "backend"
wait_healthy "rumi_scraper" "scraper"
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo ""
echo "  ─────────────────────────────────────────────────────"
echo -e "  ${GREEN}Rumi is up${NC}"
echo ""
echo "    Frontend    →  http://${HOST_IP}:8888/rumi"
echo "    API health  →  http://${HOST_IP}:8888/api/health"
echo "    API docs    →  http://${HOST_IP}:8888/api/docs"
echo "    Scraper     →  http://${HOST_IP}:8888/rumi/scraper"
echo ""
echo "  Useful commands:"
echo "    Tail logs:   ./scripts/deploy.sh logs [service]"
echo "    Stop:        ./scripts/deploy.sh down"
echo "    Rebuild:     ./scripts/deploy.sh --no-cache"
echo "    Status:      ./scripts/deploy.sh ps"
echo "  ─────────────────────────────────────────────────────"
