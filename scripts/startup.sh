#!/usr/bin/env bash
# =============================================================================
#  scripts/startup.sh — Rumi 本地开发启动脚本
#
#  用法:
#    ./scripts/startup.sh                        # 启动全部服务
#    ./scripts/startup.sh backend                # 只启动 backend
#    ./scripts/startup.sh backend frontend       # 启动多个指定服务
#    ./scripts/startup.sh scraper wewe           # 启动 scraper + WeWeRSS
#
#  可用服务名: backend  frontend  scraper  wewe
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
ALL_SERVICES=(backend frontend scraper wewe)
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
#  SERVICE: wewe  (WeWeRSS + MySQL, via Docker)
# =============================================================================
if should_run wewe; then
  header "[wewe] WeWeRSS + MySQL (Docker)"

  (
    # Docker 可用性检查
    if ! docker info > /dev/null 2>&1; then
      err "Docker daemon not running — cannot start WeWeRSS"
      exit 1
    fi

    WEWE_NETWORK="wewe-net"
    WEWE_DB_PASS="${WEWE_DB_PASSWORD:-wewe_rss_pass}"
    WEWE_AUTH="${WEWE_AUTH_CODE:-changeme_wewe}"

    # ── 网络 ────────────────────────────────────────────────────────────────
    if ! docker network inspect "$WEWE_NETWORK" > /dev/null 2>&1; then
      dim "Creating Docker network $WEWE_NETWORK…"
      docker network create "$WEWE_NETWORK"
    else
      dim "Network $WEWE_NETWORK already exists"
    fi

    # ── MySQL ────────────────────────────────────────────────────────────────
    MYSQL_RUNNING=$(docker inspect -f '{{.State.Running}}' wewe-mysql 2>/dev/null || echo "false")
    MYSQL_EXISTS=$(docker inspect wewe-mysql > /dev/null 2>&1 && echo "true" || echo "false")

    if [ "$MYSQL_RUNNING" = "true" ]; then
      warn "wewe-mysql already running — skipping"
    else
      if [ "$MYSQL_EXISTS" = "true" ]; then
        dim "Restarting existing wewe-mysql container…"
        docker start wewe-mysql > /dev/null
      else
        dim "Creating wewe-mysql container…"
        docker run -d --name wewe-mysql \
          --network "$WEWE_NETWORK" \
          -e MYSQL_ROOT_PASSWORD="$WEWE_DB_PASS" \
          -e MYSQL_DATABASE=wewe_rss \
          -e MYSQL_ROOT_HOST='%' \
          --restart unless-stopped \
          mysql:8.0 > /dev/null
      fi

      dim "Waiting for MySQL to be ready…"
      for i in $(seq 1 20); do
        if docker exec wewe-mysql mysqladmin ping -uroot -p"$WEWE_DB_PASS" --silent 2>/dev/null; then
          ok "MySQL ready"
          break
        fi
        [ "$i" -eq 20 ] && { err "MySQL did not become ready in time"; exit 1; }
        sleep 3
      done
    fi

    # ── WeWeRSS ──────────────────────────────────────────────────────────────
    WEWE_RUNNING=$(docker inspect -f '{{.State.Running}}' wewe-rss 2>/dev/null || echo "false")
    WEWE_EXISTS=$(docker inspect wewe-rss > /dev/null 2>&1 && echo "true" || echo "false")

    if [ "$WEWE_RUNNING" = "true" ]; then
      warn "wewe-rss already running — skipping"
    else
      if [ "$WEWE_EXISTS" = "true" ]; then
        dim "Restarting existing wewe-rss container…"
        docker start wewe-rss > /dev/null
      else
        dim "Creating wewe-rss container…"
        docker run -d --name wewe-rss \
          --network "$WEWE_NETWORK" \
          -p 4000:4000 \
          -e DATABASE_URL="mysql://root:${WEWE_DB_PASS}@wewe-mysql:3306/wewe_rss" \
          -e AUTH_CODE="$WEWE_AUTH" \
          -e SERVER_ORIGIN_URL="http://localhost:4000" \
          -e MAX_ITEMS_PER_FEED=20 \
          -e CRON_EXPRESSION="35 5,17 * * *" \
          -e ENABLE_FEED_AUTH=false \
          --restart unless-stopped \
          cooderl/wewe-rss:latest > /dev/null
      fi

      dim "Waiting for WeWeRSS to be ready…"
      for i in $(seq 1 15); do
        if curl -sf http://localhost:4000 > /dev/null 2>&1; then
          ok "WeWeRSS ready at http://localhost:4000"
          break
        fi
        [ "$i" -eq 15 ] && { warn "WeWeRSS may still be starting — check: docker logs wewe-rss"; }
        sleep 2
      done
    fi

    ok "WeWeRSS: http://localhost:4000  (登录密码: $WEWE_AUTH)"
  ) && STARTED+=(wewe) || { err "wewe failed — continuing"; FAILED+=(wewe); }
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
should_run wewe     && echo "    WeWeRSS    →  http://localhost:4000   (docker logs wewe-rss)"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo -e "  ${RED}Failed:${NC} ${FAILED[*]}"
fi
echo ""
