#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}~${NC}  $*"; }
err()  { echo -e "${RED}✗${NC}  $*"; }
dim()  { echo -e "${DIM}   $*${NC}"; }

echo ""
echo "  RUMI — startup"
echo "  ──────────────────────────────────"

# ── 1. Python venv + deps ─────────────────────────────────────────────────────
echo ""
echo "  [1/3] Backend dependencies"

VENV="$BACKEND_DIR/.venv"

if [ ! -d "$VENV" ]; then
  dim "Creating virtualenv…"
  python3 -m venv "$VENV"
fi

# shellcheck disable=SC1090
source "$VENV/bin/activate"

# Use md5 to skip pip install when requirements haven't changed
HASH_CMD="md5 -q"
command -v md5 &>/dev/null || HASH_CMD="md5sum"
REQ_HASH=$($HASH_CMD "$BACKEND_DIR/requirements.txt" 2>/dev/null | awk '{print $1}')
STORED_HASH=$(cat "$VENV/.req_hash" 2>/dev/null || echo "")

if [ "$REQ_HASH" != "$STORED_HASH" ]; then
  dim "Installing Python packages…"
  pip install -q -r "$BACKEND_DIR/requirements.txt"
  echo "$REQ_HASH" > "$VENV/.req_hash"
  ok "Dependencies installed"
else
  ok "Dependencies up to date — skipping"
fi

# Copy .env if missing
cd "$BACKEND_DIR"
[ ! -f .env ] && [ -f .env.example ] && cp .env.example .env && dim "Created .env from .env.example"

# ── 2. FastAPI backend ────────────────────────────────────────────────────────
echo ""
echo "  [2/3] Backend server"

BACKEND_PID_FILE="/tmp/rumi_backend.pid"

if [ -f "$BACKEND_PID_FILE" ]; then
  OLD_PID=$(cat "$BACKEND_PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    warn "Backend already running (pid $OLD_PID) — skipping"
  else
    rm -f "$BACKEND_PID_FILE"
  fi
fi

if [ ! -f "$BACKEND_PID_FILE" ]; then
  dim "Starting uvicorn on :8000…"
  nohup uvicorn main:app --host 0.0.0.0 --port 8000 --reload \
    > /tmp/rumi_backend.log 2>&1 &
  echo $! > "$BACKEND_PID_FILE"
  sleep 2
  if kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
    ok "Backend started (pid $(cat "$BACKEND_PID_FILE"), logs: /tmp/rumi_backend.log)"
  else
    err "Backend failed to start — check /tmp/rumi_backend.log"
    exit 1
  fi
fi

# ── 3. Frontend ───────────────────────────────────────────────────────────────
echo ""
echo "  [3/3] Frontend (Vite)"

FRONTEND_PID_FILE="/tmp/rumi_frontend.pid"

if [ -f "$FRONTEND_PID_FILE" ]; then
  OLD_PID=$(cat "$FRONTEND_PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    warn "Frontend already running (pid $OLD_PID) — skipping"
  else
    rm -f "$FRONTEND_PID_FILE"
  fi
fi

if [ ! -f "$FRONTEND_PID_FILE" ]; then
  cd "$FRONTEND_DIR"
  if [ ! -d node_modules ]; then
    dim "Installing npm packages…"
    npm install --silent
  fi
  dim "Starting Vite on :5173…"
  nohup npm run dev > /tmp/rumi_frontend.log 2>&1 &
  echo $! > "$FRONTEND_PID_FILE"
  sleep 3
  if kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
    ok "Frontend started (pid $(cat "$FRONTEND_PID_FILE"), logs: /tmp/rumi_frontend.log)"
  else
    err "Frontend failed to start — check /tmp/rumi_frontend.log"
    exit 1
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "  ──────────────────────────────────"
echo -e "  ${GREEN}All services running${NC}"
echo ""
echo "    Frontend  →  http://localhost:5173"
echo "    Backend   →  http://localhost:8000"
echo "    API docs  →  http://localhost:8000/docs"
echo ""
echo "  Data stored in your browser (SQLite / IndexedDB)."
echo "  Configure Flomo at http://localhost:5173/settings"
echo ""
