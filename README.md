# Rumi

音乐现场分析工具。实时 BPM 检测、曲目管理、Flomo 笔记集成。

## 技术栈

- **Frontend**: React + TypeScript + Vite + Tailwind CSS（PWA）
- **Backend**: FastAPI + Python 3.11 + librosa（音频分析）
- **数据库**: MySQL 8.0（预留）+ 浏览器端 SQLite（sql.js）
- **部署**: Docker Compose + nginx

---

## 快速开始（Docker 部署）

### 1. 配置环境变量

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env，填写真实凭据
```

### 2. 启动所有服务

```bash
./scripts/deploy.sh
```

访问 `http://localhost` 即可使用。

### 其他部署命令

```bash
./scripts/deploy.sh --no-cache   # 强制完整重新构建镜像
./scripts/deploy.sh --pull       # 先拉取最新基础镜像
./scripts/deploy.sh down         # 停止所有服务（数据卷保留）
./scripts/deploy.sh logs         # 实时查看所有服务日志
```

---

## 本地开发（不用 Docker）

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend（新终端）
cd frontend
npm install
npm run dev
```

访问 `http://localhost:5173`。

---

## 查看运行状态

```bash
# 容器健康状态总览
docker compose ps

# 快速验证整个链路
docker compose ps && curl -s http://localhost/health

# 查看单个服务日志
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mysql

# 资源占用（CPU / 内存）
docker stats
```

---

## 排查问题

```bash
# 进入 backend 容器
docker exec -it rumi_backend bash

# 进入 MySQL
docker exec -it rumi_mysql mysql -u rumi -p

# 检查音频文件挂载
docker exec rumi_backend ls -la /app/storage/live/

# 停掉本地占用端口的进程（开发环境清理用）
kill $(lsof -ti :8000 -ti :5173 -ti :5174) 2>/dev/null || true
```

---

## 数据持久化

| 数据 | 存储位置 |
|------|----------|
| 用户录音 / 上传音频 | Docker volume `rumi_storage` |
| MySQL 数据库 | Docker volume `rumi_mysql_data` |
| 曲目 / 会话记录 | 浏览器本地 SQLite（IndexedDB） |

`docker compose down` 不会删除数据卷，只有 `docker compose down -v` 才会清空。

---

## 云部署（阿里云）

1. **安全组**：开放 80/443（公网）、22（仅限你的 IP）；8000/3306 不对外暴露
2. **HTTPS**：在 SLB 配置 SSL 证书，443 → ECS:80，nginx 容器只监听 80
3. **镜像仓库**：推送到阿里云 ACR，ECS 上 `docker pull` 而非在服务器上编译
4. **数据库**：生产环境建议换用阿里云 RDS MySQL，更新 `DATABASE_URL` 后移除 docker-compose 中的 mysql 服务
5. **音频存储**：文件量大时迁移到阿里云 OSS（`oss2` SDK），消除本地磁盘依赖

环境变量中的默认密码（`rumi_pass`）在上线前必须替换。
