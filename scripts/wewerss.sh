#!/usr/bin/env bash
# =============================================================================
#  scripts/wewerss.sh — WeWeRSS + MySQL 启动 / 停止脚本
#
#  用法:
#    ./scripts/wewerss.sh startup         # 启动 WeWeRSS + MySQL（独立容器模式）
#    ./scripts/wewerss.sh shutdown        # 停止 WeWeRSS + MySQL
#    ./scripts/wewerss.sh compose-check   # deploy.sh 用：检查 root .env 并等待 DB 健康
# =============================================================================

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}~${NC}  $*"; }
err()  { echo -e "${RED}✗${NC}  $*"; }
dim()  { echo -e "${DIM}   $*${NC}"; }

if [ $# -ne 1 ] || { [ "$1" != "startup" ] && [ "$1" != "shutdown" ] && [ "$1" != "compose-check" ]; }; then
  echo "用法: $0 startup|shutdown|compose-check"
  exit 1
fi

ACTION="$1"

# =============================================================================
#  startup
# =============================================================================
if [ "$ACTION" = "startup" ]; then
  echo ""
  echo "  WeWeRSS — startup"
  echo "  ──────────────────────────────────"

  if ! docker info > /dev/null 2>&1; then
    err "Docker daemon not running — cannot start WeWeRSS"
    exit 1
  fi

  # ── root .env（供 docker-compose 模式读取 WeWeRSS 变量）─────────────────────
  ROOT_ENV="$REPO_ROOT/.env"
  if [ ! -f "$ROOT_ENV" ]; then
    if [ -f "$REPO_ROOT/.env.example" ]; then
      warn "Root .env not found — copying from .env.example"
      cp "$REPO_ROOT/.env.example" "$ROOT_ENV"
      warn "Edit $ROOT_ENV and set WEWE_DB_PASSWORD + WEWE_AUTH_CODE, then re-run."
      err "Aborted — please fill in $ROOT_ENV first."
    else
      warn "No root .env found — WeWeRSS will use default passwords (change in production!)."
    fi
  fi

  WEWE_NETWORK="wewe-net"
  WEWE_DB_PASS="${WEWE_DB_PASSWORD:-wewe_rss_pass}"
  WEWE_AUTH="${WEWE_AUTH_CODE:-changeme_wewe}"

  # ── 网络 ──────────────────────────────────────────────────────────────────
  if ! docker network inspect "$WEWE_NETWORK" > /dev/null 2>&1; then
    dim "Creating Docker network $WEWE_NETWORK…"
    docker network create "$WEWE_NETWORK"
  else
    dim "Network $WEWE_NETWORK already exists"
  fi

  # ── MySQL ──────────────────────────────────────────────────────────────────
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

  # ── WeWeRSS ────────────────────────────────────────────────────────────────
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
  echo ""
  echo "  首次使用配置："
  echo "    1. 打开 http://localhost:4000 并用 WEWE_AUTH_CODE 登录"
  echo "    2. 扫描二维码绑定企业微信账号"
  echo "    3. 搜索并订阅目标微信公众号"
  echo "    4. 在 Scraper → Sources 中添加各账号（Feed Path = /feeds/{mpId}.xml）"
  echo "    5. 在 Scraper → Settings 中填入 WEWE_AUTH_CODE 以启用自动补全"
  echo ""

# =============================================================================
#  shutdown
#  注意：只停容器，不删除（数据保留）。
#  彻底删除数据请手动运行: docker rm wewe-rss wewe-mysql
# =============================================================================
elif [ "$ACTION" = "shutdown" ]; then
  echo ""
  echo "  WeWeRSS — shutdown"
  echo "  ──────────────────────────────────"

  if ! docker info > /dev/null 2>&1; then
    warn "Docker daemon not running — skipping"
    exit 0
  fi

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

  stop_container "wewe-rss"
  stop_container "wewe-mysql"

  echo ""
  echo -e "  ${GREEN}Shutdown complete${NC}"
  echo ""

# =============================================================================
#  compose-check
#  由 deploy.sh 调用：检查 root .env 并等待 docker-compose 中的 wewe-rss-db 健康
# =============================================================================
elif [ "$ACTION" = "compose-check" ]; then
  COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"

  # ── root .env ────────────────────────────────────────────────────────────────
  ROOT_ENV="$REPO_ROOT/.env"
  if [ ! -f "$ROOT_ENV" ]; then
    if [ -f "$REPO_ROOT/.env.example" ]; then
      warn "Root .env not found — copying from .env.example"
      cp "$REPO_ROOT/.env.example" "$ROOT_ENV"
      warn "Edit $ROOT_ENV and set WEWE_DB_PASSWORD + WEWE_AUTH_CODE, then re-run."
      echo -e "${RED}[wewerss]${NC} Aborted — please fill in $ROOT_ENV first." >&2
      exit 1
    else
      warn "No root .env found — WeWeRSS will use default passwords (change in production!)."
    fi
  fi

  # ── 等待 wewe-rss-db 健康（MySQL 须在 scraper 之前就绪）────────────────────
  ok "Waiting for wewe-rss-db to become healthy…"
  TIMEOUT=180
  ELAPSED=0
  while [ $ELAPSED -lt $TIMEOUT ]; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "rumi_wewe_rss_db" 2>/dev/null || echo "none")
    if [ "$STATUS" = "healthy" ]; then
      ok "wewe-rss-db is healthy."
      break
    fi
    if [ "$STATUS" = "unhealthy" ]; then
      warn "wewe-rss-db is unhealthy — check: docker compose logs wewe-rss-db"
    fi
    printf "."
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    if [ $ELAPSED -ge $TIMEOUT ]; then
      echo ""
      echo -e "${RED}[wewerss]${NC} wewe-rss-db did not become healthy within ${TIMEOUT}s." >&2
      exit 1
    fi
  done

  HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
  echo ""
  echo "    WeWeRSS UI  →  http://${HOST_IP}:4000"
  echo ""
  echo "  首次使用配置："
  echo "    1. 打开 http://${HOST_IP}:4000 并用 WEWE_AUTH_CODE 登录"
  echo "    2. 扫描二维码绑定企业微信账号"
  echo "    3. 搜索并订阅目标微信公众号"
  echo "    4. 在 Scraper → Sources 中添加各账号（Feed Path = /feeds/{mpId}.xml）"
  echo "    5. 在 Scraper → Settings 中填入 WEWE_AUTH_CODE 以启用自动补全"
  echo ""
fi
