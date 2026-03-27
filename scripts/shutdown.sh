#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}~${NC}  $*"; }
dim()  { echo -e "${DIM}   $*${NC}"; }

_stop_pid_file() {
  local label="$1"
  local pid_file="$2"

  if [ ! -f "$pid_file" ]; then
    warn "$label not running (no PID file)"
    return
  fi

  local pid
  pid=$(cat "$pid_file")

  if ! kill -0 "$pid" 2>/dev/null; then
    warn "$label already stopped (stale PID $pid)"
    rm -f "$pid_file"
    return
  fi

  kill "$pid" 2>/dev/null || true
  for i in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done
  if kill -0 "$pid" 2>/dev/null; then
    dim "SIGKILL $pid…"
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
  ok "$label stopped"
}

echo ""
echo "  RUMI — shutdown"
echo "  ──────────────────────────────────"

# ── Frontend ──────────────────────────────────────────────────────────────────
echo ""
echo "  [1/2] Frontend"
_stop_pid_file "Frontend" "/tmp/rumi_frontend.pid"

VITE_PID=$(lsof -ti :5173 2>/dev/null || true)
if [ -n "$VITE_PID" ]; then
  dim "Killing orphaned Vite process(es): $VITE_PID"
  echo "$VITE_PID" | xargs kill 2>/dev/null || true
fi

# ── Backend ───────────────────────────────────────────────────────────────────
echo ""
echo "  [2/2] Backend"
_stop_pid_file "Backend" "/tmp/rumi_backend.pid"

UVICORN_PID=$(lsof -ti :8000 2>/dev/null || true)
if [ -n "$UVICORN_PID" ]; then
  dim "Killing orphaned uvicorn process(es): $UVICORN_PID"
  echo "$UVICORN_PID" | xargs kill 2>/dev/null || true
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "  ──────────────────────────────────"
echo -e "  ${GREEN}All services stopped${NC}"
echo ""
