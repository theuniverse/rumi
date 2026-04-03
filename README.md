# Rumi

音乐现场分析工具。实时 BPM 检测、曲目管理、Flomo 笔记集成，以及电子音乐活动自动抓取。

## 技术栈

| 层 | 技术 |
|----|------|
| Frontend | React + TypeScript + Vite + Tailwind CSS（PWA） |
| Backend | FastAPI + Python 3.11 + librosa（音频分析） |
| Scraper | FastAPI + APScheduler + SQLAlchemy（aiosqlite）+ OpenRouter LLM |
| 数据库 | 浏览器端 SQLite（sql.js）+ scraper SQLite |
| 部署 | Docker Compose + nginx |
| 公众号 RSS | WeWeRSS（企业微信驱动）+ MySQL 8.0 |

---

## 快速开始（Docker 部署）

### 1. 配置环境变量

```bash
cp backend/.env.example backend/.env
cp scraper/.env.example scraper/.env
# 编辑两个 .env 文件，填写真实凭据
# scraper/.env 中至少需要填写 OPENROUTER_API_KEY
```

### 2. 启动所有服务

```bash
./scripts/deploy.sh
```

服务启动后访问：

| 地址 | 说明 |
|------|------|
| `http://HOST:8888/rumi` | 主界面 |
| `http://HOST:4000` | WeWeRSS 管理界面（初始配置用） |
| `http://HOST:8888/rumi/scraper` | Scraper 审计界面 |

### 其他部署命令

```bash
./scripts/deploy.sh --no-cache   # 强制完整重新构建镜像
./scripts/deploy.sh --pull       # 先拉取最新基础镜像
./scripts/deploy.sh down         # 停止所有服务（数据卷保留）
./scripts/deploy.sh logs         # 实时查看所有服务日志
```

---

## 本地开发

### 一键启动 / 停止

```bash
./scripts/startup.sh             # 启动全部服务
./scripts/shutdown.sh            # 停止全部服务
```

支持只操作指定服务（任意组合）：

```bash
./scripts/startup.sh wewe                  # 只启动 WeWeRSS
./scripts/startup.sh backend scraper       # 启动 backend + scraper
./scripts/shutdown.sh wewe                 # 只停 WeWeRSS
./scripts/shutdown.sh frontend backend     # 停 frontend + backend
```

可用服务名：`backend` `frontend` `scraper` `wewe`

各服务失败互不影响，脚本会继续启动其余服务并在末尾汇报失败项。

### 日志位置

| 服务 | 日志 |
|------|------|
| backend | `/tmp/rumi_backend.log` |
| frontend | `/tmp/rumi_frontend.log` |
| scraper | `/tmp/rumi_scraper.log` |
| WeWeRSS | `docker logs wewe-rss` |
| WeWeRSS MySQL | `docker logs wewe-mysql` |

### 环境变量覆盖

WeWeRSS 密码默认值可在启动前 export 覆盖：

```bash
export WEWE_DB_PASSWORD=my_secure_pass
export WEWE_AUTH_CODE=my_login_code
./scripts/startup.sh wewe
```

---

## WeWeRSS 初始配置（首次部署必做）

WeWeRSS 通过企业微信获取微信公众号 RSS，需要一次性扫码绑定。

### 步骤

1. 启动服务后访问 `http://HOST:4000`
2. 输入 `AUTH_CODE`（默认 `changeme_wewe`，见 `docker-compose.yml`）登录
3. 扫码绑定企业微信账号（个人可免费注册企业微信）
4. 在搜索框中搜索目标微信公众号 → 订阅
5. 订阅后在 Rumi → Scraper → Sources 添加订阅源：
   - `rsshub_path` 填 `/feeds/{mpId}.xml`
   - `mpId` 在 WeWeRSS 订阅列表中可以看到（格式如 `Gh_xxxxxxxxxx`）
6. 点击"试抓取"按钮验证 RSS 正常抓取
7. 完成后可注释掉 `docker-compose.yml` 中 `wewe-rss` 的 `ports: 4000` 映射，关闭公网访问

### 自动刷新

WeWeRSS 默认每天 5:35 和 17:35 自动拉取新文章（由 `CRON_EXPRESSION` 控制）。
Scraper 的 Monitor 任务每 2 小时读取 RSS 并分类，每天 11:00/19:00 进行深度抽取。

---

## Scraper 配置

在 Rumi → Scraper → Settings 页面可以直接管理：

| 配置项 | 说明 |
|--------|------|
| OpenRouter API Key | LLM 调用密钥，保存在 DB 中，重启后仍生效 |
| 分类模型 | 判断文章是否为活动公告（轻量，推荐 Qwen 32B） |
| 抽取模型 | 深度提取结构化活动数据（推荐 Qwen 72B） |
| 更新检测模型 | 对比新旧内容判断是否有增量信息（轻量） |
| RSSHub 地址 | WeWeRSS base URL（Docker 内网：`http://wewe-rss:4000`） |

---

## 查看运行状态

```bash
# Docker 容器健康状态
docker compose ps

# 验证整个链路
docker compose ps && curl -s http://localhost:8888/api/health

# 单个服务日志（Docker）
docker compose logs -f backend
docker compose logs -f scraper
docker compose logs -f wewe-rss
docker compose logs -f wewe-rss-db

# 本地开发日志（实时）
tail -f /tmp/rumi_scraper.log
tail -f /tmp/rumi_backend.log

# 资源占用
docker stats
```

---

## 排查问题

```bash
# 进入 backend 容器
docker exec -it rumi_backend bash

# 检查 scraper 数据库
docker exec -it rumi_scraper sqlite3 /app/data/scraper.db ".tables"

# 检查 WeWeRSS MySQL
docker exec -it wewe-mysql mysql -uroot -pwewe_rss_pass wewe_rss

# 手动测试 WeWeRSS RSS feed
curl http://localhost:4000/feeds/Gh_xxxxxxxx.xml

# 停掉本地占用端口的进程（紧急清理）
kill $(lsof -ti :8000 -ti :5173 -ti :9000) 2>/dev/null || true

# 完全重置 WeWeRSS（会清空订阅数据，慎用）
docker rm -f wewe-rss wewe-mysql
docker volume rm wewe_rss_db
./scripts/startup.sh wewe
```

---

## 数据持久化

| 数据 | 存储位置 | 备注 |
|------|----------|------|
| 用户录音 / 上传音频 | Docker volume `rumi_storage` | |
| 曲目 / 会话记录 | 浏览器本地 SQLite（IndexedDB） | 随浏览器走 |
| Scraper 抓取数据 | Docker volume `scraper_data` | SQLite |
| WeWeRSS 订阅数据 | Docker volume `wewe_rss_db` | MySQL |

`docker compose down` 不会删除数据卷，只有 `docker compose down -v` 才会清空。

---

## 云部署（阿里云）

1. **安全组**：开放 80/443（公网）、22（仅限你的 IP）；8000/9000/4000/3306 不对外暴露
2. **HTTPS**：在 SLB 配置 SSL 证书，443 → ECS:80，nginx 容器只监听 80
3. **WeWeRSS**：初始配置完成后注释掉 `docker-compose.yml` 中 `wewe-rss` 的 `ports: 4000`
4. **镜像仓库**：推送到阿里云 ACR，ECS 上 `docker pull` 而非在服务器上编译
5. **音频存储**：文件量大时迁移到阿里云 OSS，消除本地磁盘依赖

环境变量中的默认密码（`wewe_rss_pass`、`changeme_wewe`）在上线前必须替换。
