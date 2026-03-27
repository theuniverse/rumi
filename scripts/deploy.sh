#!/usr/bin/env bash
# =============================================================================
#  scripts/deploy.sh — Rumi 统一部署脚本
#
#  用法:
#    ./scripts/deploy.sh              # 构建并启动所有服务
#    ./scripts/deploy.sh --no-cache   # 强制完整重新构建
#    ./scripts/deploy.sh --pull       # 先拉取最新基础镜像
#    ./scripts/deploy.sh down         # 停止并删除容器（保留数据卷）
#    ./scripts/deploy.sh logs         # 实时查看所有服务日志
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/backend/.env"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()  { echo -e "${RED}[deploy]${NC} $*" >&2; exit 1; }

# ── 解析参数 ──────────────────────────────────────────────────────────────────
SUBCOMMAND="${1:-up}"
BUILD_FLAGS=""

case "$SUBCOMMAND" in
  down)
    ok "停止服务（保留数据卷）…"
    docker compose -f "$COMPOSE_FILE" down
    ok "已停止。"
    exit 0
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs -f
    exit 0
    ;;
  up|--no-cache|--pull)
    [[ "$*" == *"--no-cache"* ]] && BUILD_FLAGS="--no-cache"
    [[ "$*" == *"--pull"* ]] && docker compose -f "$COMPOSE_FILE" pull
    ;;
  *)
    err "未知参数: $SUBCOMMAND。用法: deploy.sh [up|down|logs|--no-cache|--pull]"
    ;;
esac

# ── 预检 ──────────────────────────────────────────────────────────────────────
ok "运行预检…"

# 1. Docker daemon
docker info > /dev/null 2>&1 || err "Docker daemon 未运行，请先启动 Docker。"

# 2. .env 文件
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_FILE.example" ]; then
    warn ".env 不存在，已从 .env.example 复制。请填写真实凭据后重新运行。"
    cp "$ENV_FILE.example" "$ENV_FILE"
    err "请编辑 $ENV_FILE 填入真实凭据，然后重新运行此脚本。"
  else
    err "$ENV_FILE 不存在，且找不到 .env.example。"
  fi
fi

# 3. 检测默认密码
if grep -qE "rumi_pass|change_me_in_production" "$ENV_FILE"; then
  warn "检测到默认密码！上线前请修改 $ENV_FILE 中的所有密码。"
fi

# ── 构建镜像 ──────────────────────────────────────────────────────────────────
ok "构建 Docker 镜像…"
docker compose -f "$COMPOSE_FILE" build $BUILD_FLAGS

# ── 启动服务 ──────────────────────────────────────────────────────────────────
ok "启动服务…"
docker compose -f "$COMPOSE_FILE" up -d

# ── 等待健康检查 ──────────────────────────────────────────────────────────────
ok "等待服务就绪…"
TIMEOUT=120
ELAPSED=0

wait_healthy() {
  local service="$1"
  while [ $ELAPSED -lt $TIMEOUT ]; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "rumi_${service}" 2>/dev/null || echo "none")
    if [ "$STATUS" = "healthy" ]; then
      ok "$service 已就绪。"
      return 0
    fi
    sleep 3
    ELAPSED=$((ELAPSED + 3))
  done
  err "$service 在 ${TIMEOUT}s 内未就绪。查看日志: docker compose logs $service"
}

wait_healthy "mysql"
wait_healthy "backend"

# ── 完成提示 ──────────────────────────────────────────────────────────────────
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo ""
echo "  ────────────────────────────────────────"
echo -e "  ${GREEN}Rumi 已启动${NC}"
echo ""
echo "    前端入口  →  http://${HOST_IP}"
echo "    健康检查  →  http://${HOST_IP}/health"
echo "    API 文档  →  http://${HOST_IP}/api/docs"
echo ""
echo "  查看日志:  ./scripts/deploy.sh logs"
echo "  停止服务:  ./scripts/deploy.sh down"
echo "  ────────────────────────────────────────"
