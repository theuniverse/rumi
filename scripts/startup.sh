#!/usr/bin/env bash
# =============================================================================
#  scripts/startup.sh — Rumi 本地开发启动脚本
#
#  用法:
#    ./scripts/startup.sh                        # 启动全部服务
#    ./scripts/startup.sh backend                # 只启动 backend
#    ./scripts/startup.sh backend frontend       # 启动多个指定服务
#
#  可用服务名: backend  frontend  scraper
#  WeWeRSS 请使用: ./scripts/wewerss.sh startup
# =============================================================================

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
SCRAPER_DIR="$REPO_ROOT/scraper"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

ok()    { echo -e "${GREEN}✓${NC}  $*"; }
warn()  { echo -e "${YELLOW}~${NC}  $*"; }
err()   { echo -e "${RED}✗${NC}  $*"; }
dim()   { echo -e "${DIM}   $*${NC}"; }
header(){ echo ""; echo "  $*"; }

# ── 服务选择 ──────────────────────────────────────────────────────────────────
ALL_SERVICES=(backend frontend scraper)
if [ $# -eq 0 ]; then
  RUN_SERVICES=("${ALL_SERVICES[@]}")
else
  RUN_SERVICES=("$@")
fi

should_run() {
  local svc="$1"
  for s in "${RUN_SERVICES[@]}"; do
    [ "$s" = "$svc" ] && return 0
  done
  return 1
}

# ── 工具函数 ──────────────────────────────────────────────────────────────────
HASH_CMD="md5 -q"
command -v md5 &>/dev/null || HASH_CMD="md5sum"

# 启动一个 uvicorn 进程，写 PID 文件，失败时 warn 而不是 exit
start_uvicorn() {
  local label="$1"       # 显示名
  local pid_file="$2"    # /tmp/xxx.pid
  local log_file="$3"    # /tmp/xxx.log
  local cmd="$4"         # 完整 uvicorn 命令（含参数）
  local workdir="$5"     # cd 到哪里再启动

  # 已在运行则跳过
  if [ -f "$pid_file" ]; then
    local old_pid
    old_pid=$(cat "$pid_file")
    if kill -0 "$old_pid" 2>/dev/null; then
      warn "$label already running (pid $old_pid) — skipping"
      return 0
    fi
    rm -f "$pid_file"
  fi

  dim "Starting $label…"
  (cd "$workdir" && eval "nohup $cmd > $log_file 2>&1 &" && echo $! > "$pid_file")
  sleep 2

  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    ok "$label started (pid $(cat "$pid_file"), logs: $log_file)"
  else
    err "$label failed to start — check $log_file"
    return 1
  fi
}

# 安装 Python 依赖（hash 去重）
ensure_python_deps() {
  local venv="$1"
  local req_file="$2"
  local label="$3"

  if [ ! -d "$venv" ]; then
    dim "Creating virtualenv for $label…"
    python3 -m venv "$venv"
  fi

  local req_hash stored_hash
  req_hash=$($HASH_CMD "$req_file" 2>/dev/null | awk '{print $1}')
  stored_hash=$(cat "$venv/.req_hash" 2>/dev/null || echo "")

  if [ "$req_hash" != "$stored_hash" ]; then
    dim "Installing $label packages…"
    "$venv/bin/pip" install -q -r "$req_file"
    echo "$req_hash" > "$venv/.req_hash"
    ok "$label dependencies installed"
  else
    ok "$label dependencies up to date — skipping"
  fi
}

# ── 状态追踪 ──────────────────────────────────────────────────────────────────
STARTED=()
SKIPPED=()
FAILED=()

echo ""
echo "  RUMI — startup"
printf "  Services: %s\n" "${RUN_SERVICES[*]}"
echo "  ──────────────────────────────────"

# =============================================================================
#  SERVICE: backend
# =============================================================================
if should_run backend; then
  header "[backend] FastAPI"

  (
    ensure_python_deps "$BACKEND_DIR/.venv" "$BACKEND_DIR/requirements.txt" "backend"
    source "$BACKEND_DIR/.venv/bin/activate"
    [ ! -f "$BACKEND_DIR/.env" ] && [ -f "$BACKEND_DIR/.env.example" ] && \
      cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env" && \
      dim "Created backend/.env from .env.example"
    start_uvicorn "Backend" "/tmp/rumi_backend.pid" "/tmp/rumi_backend.log" \
      "uvicorn main:app --host 0.0.0.0 --port 8000 --reload" \
      "$BACKEND_DIR"
  ) && STARTED+=(backend) || { err "backend failed — continuing"; FAILED+=(backend); }
fi

# =============================================================================
#  SERVICE: frontend
# =============================================================================
if should_run frontend; then
  header "[frontend] Vite"

  (
    cd "$FRONTEND_DIR"
    if [ ! -d node_modules ]; then
      dim "Installing npm packages…"
      npm install --silent
    fi

    FRONTEND_PID_FILE="/tmp/rumi_frontend.pid"
    if [ -f "$FRONTEND_PID_FILE" ]; then
      old_pid=$(cat "$FRONTEND_PID_FILE")
      if kill -0 "$old_pid" 2>/dev/null; then
        warn "Frontend already running (pid $old_pid) — skipping"
        exit 0
      fi
      rm -f "$FRONTEND_PID_FILE"
    fi

    dim "Starting Vite on :5173…"
    nohup npm run dev > /tmp/rumi_frontend.log 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    sleep 3

    if kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
      ok "Frontend started (pid $(cat "$FRONTEND_PID_FILE"), logs: /tmp/rumi_frontend.log)"
    else
      err "Frontend failed — check /tmp/rumi_frontend.log"
      exit 1
    fi
  ) && STARTED+=(frontend) || { err "frontend failed — continuing"; FAILED+=(frontend); }
fi

# =============================================================================
#  SERVICE: scraper
# =============================================================================
if should_run scraper; then
  header "[scraper] FastAPI + APScheduler"

  (
    ensure_python_deps "$SCRAPER_DIR/.venv" "$SCRAPER_DIR/requirements.txt" "scraper"
    [ ! -f "$SCRAPER_DIR/.env" ] && [ -f "$SCRAPER_DIR/.env.example" ] && \
      cp "$SCRAPER_DIR/.env.example" "$SCRAPER_DIR/.env" && \
      dim "Created scraper/.env from .env.example — add your OPENROUTER_API_KEY"
    export RSSHUB_BASE="${RSSHUB_BASE:-http://localhost:4000}"
    start_uvicorn "Scraper" "/tmp/rumi_scraper.pid" "/tmp/rumi_scraper.log" \
      "$SCRAPER_DIR/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload" \
      "$SCRAPER_DIR"
  ) && STARTED+=(scraper) || { err "scraper failed — continuing"; FAILED+=(scraper); }
fi

# =============================================================================
#  Summary
# =============================================================================
echo ""
echo "  ──────────────────────────────────"

if [ ${#FAILED[@]} -eq 0 ]; then
  echo -e "  ${GREEN}All requested services running${NC}"
else
  echo -e "  ${YELLOW}Done with warnings${NC}"
fi

echo ""
should_run backend  && echo "    Backend    →  http://localhost:8000   (logs: /tmp/rumi_backend.log)"
should_run frontend && echo "    Frontend   →  http://localhost:5173   (logs: /tmp/rumi_frontend.log)"
should_run scraper  && echo "    Scraper    →  http://localhost:9000   (logs: /tmp/rumi_scraper.log)"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo -e "  ${RED}Failed:${NC} ${FAILED[*]}"
fi
echo ""
