#!/usr/bin/env bash
# =============================================================================
#  scripts/shutdown.sh — Rumi 本地开发停止脚本
#
#  用法:
#    ./scripts/shutdown.sh                        # 停止全部服务
#    ./scripts/shutdown.sh backend                # 只停 backend
#    ./scripts/shutdown.sh scraper                # 只停 scraper
#
#  可用服务名: backend  frontend  scraper
#  WeWeRSS 请使用: ./scripts/wewerss.sh shutdown
# =============================================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}~${NC}  $*"; }
err()  { echo -e "${RED}✗${NC}  $*"; }
dim()  { echo -e "${DIM}   $*${NC}"; }

# ── 服务选择 ──────────────────────────────────────────────────────────────────
ALL_SERVICES=(frontend backend scraper)
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

# 通过 PID 文件优雅停止进程，失败也继续
stop_pid_file() {
  local label="$1"
  local pid_file="$2"
  local orphan_port="${3:-}"   # 可选：端口号，用于清理孤儿进程

  if [ ! -f "$pid_file" ]; then
    warn "$label: no PID file found"
  else
    local pid
    pid=$(cat "$pid_file")
    if ! kill -0 "$pid" 2>/dev/null; then
      warn "$label: already stopped (stale PID $pid)"
    else
      dim "Stopping $label (pid $pid)…"
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
      if kill -0 "$pid" 2>/dev/null; then
        dim "SIGKILL $label (pid $pid)…"
        kill -9 "$pid" 2>/dev/null || true
      fi
      ok "$label stopped"
    fi
    rm -f "$pid_file"
  fi

  # 清理同端口的孤儿进程
  if [ -n "$orphan_port" ]; then
    local orphans
    orphans=$(lsof -ti :"$orphan_port" 2>/dev/null || true)
    if [ -n "$orphans" ]; then
      dim "Killing orphaned processes on :$orphan_port ($orphans)…"
      echo "$orphans" | xargs kill 2>/dev/null || true
    fi
  fi
}

# 停止 Docker 容器，失败也继续
stop_container() {
  local name="$1"
  local state
  state=$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || echo "missing")

  if [ "$state" = "missing" ]; then
    warn "Container $name: not found"
  elif [ "$state" = "false" ]; then
    warn "Container $name: already stopped"
  else
    dim "Stopping container $name…"
    docker stop "$name" > /dev/null 2>&1 && ok "Container $name stopped" || \
      err "Failed to stop container $name"
  fi
}

echo ""
echo "  RUMI — shutdown"
printf "  Services: %s\n" "${RUN_SERVICES[*]}"
echo "  ──────────────────────────────────"

# =============================================================================
#  SERVICE: frontend
# =============================================================================
if should_run frontend; then
  echo ""
  echo "  [frontend]"
  stop_pid_file "Frontend" "/tmp/rumi_frontend.pid" "5173"
fi

# =============================================================================
#  SERVICE: backend
# =============================================================================
if should_run backend; then
  echo ""
  echo "  [backend]"
  stop_pid_file "Backend" "/tmp/rumi_backend.pid" "8000"
fi

# =============================================================================
#  SERVICE: scraper
# =============================================================================
if should_run scraper; then
  echo ""
  echo "  [scraper]"
  stop_pid_file "Scraper" "/tmp/rumi_scraper.pid" "9000"
fi

# =============================================================================
#  Summary
# =============================================================================
echo ""
echo "  ──────────────────────────────────"
echo -e "  ${GREEN}Shutdown complete${NC}"
echo ""
