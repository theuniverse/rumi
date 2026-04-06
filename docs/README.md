# Rumi项目文档

欢迎来到Rumi项目文档中心。本目录包含所有项目相关的文档,按类型分类如下。

## 📚 文档分类

### 🎯 项目规划

#### [ROADMAP.md](ROADMAP.md)
**项目路线图** - 项目的长期规划和发展方向
- 已完成功能清单
- 进行中的工作
- 近期计划(1-2个月)
- 中期计划(3-6个月)
- 长期愿景(6-12个月)
- 技术债务和重构计划
- 版本里程碑

#### [EVENTS_INTEGRATION_PLAN.md](EVENTS_INTEGRATION_PLAN.md)
**Events功能集成方案** - Events推荐系统的技术设计文档
- 系统架构设计
- 数据库Schema设计
- API接口设计
- 前端数据流设计
- 推荐算法设计
- 实施步骤和时间线

#### [MATCHER_IMPROVEMENTS.md](MATCHER_IMPROVEMENTS.md)
**Matcher服务改进计划** - 活动匹配系统的优化方案
- 当前状态和限制
- 基于上下文的消歧义方案
- 手动更正UI设计
- 学习系统设计
- 自动触发机制
- 性能优化策略
- 实施计划和成功指标

### 📖 操作手册

#### [EVENTS_FEATURE_GUIDE.md](EVENTS_FEATURE_GUIDE.md)
**Events功能完整指南** - Events功能的用户使用手册
- 功能概述
- 快速开始指南
- 详细功能说明
  - 我的活动管理
  - 推荐活动浏览
  - 关注艺术家和场馆
  - 实体关联操作
- 常见问题解答
- 故障排除

#### [REMATCH_GUIDE.md](REMATCH_GUIDE.md)
**Rematch功能使用指南** - 活动匹配功能的操作手册
- 功能概述和作用
- 三种使用方法
  - UI批量Rematch
  - API单个Rematch
  - API批量Rematch
- 匹配算法说明
- 结果验证方法
- 常见问题解答
- 最佳实践
- 技术细节

#### [PWA_MOBILE_GUIDE.md](PWA_MOBILE_GUIDE.md)
**PWA移动端使用指南** - Progressive Web App功能说明
- PWA功能介绍
- 安装到主屏幕
- 离线使用
- 移动端优化
- 故障排除

#### [VERSION_MANAGEMENT.md](VERSION_MANAGEMENT.md)
**版本管理指南** - 项目版本控制和发布流程
- 版本号规范
- 版本更新流程
- 自动化脚本使用
- Git hooks配置
- 版本检测机制

### 🔧 技术文档

#### [../README.md](../README.md)
**项目README** - 项目总体介绍和快速开始
- 项目简介
- 功能特性
- 技术栈
- 安装和运行
- 项目结构
- 开发指南

#### API文档 (待创建)
- Backend API文档
- Scraper API文档
- Frontend API文档

#### 架构文档 (待创建)
- 系统架构图
- 数据流图
- 组件关系图
- 部署架构

### 🚀 部署和运维

#### Docker部署 (见docker-compose.yml)
- 容器配置
- 环境变量
- 网络配置
- 数据持久化

#### Nginx配置 (见nginx/rumi.conf)
- 反向代理配置
- SSL配置
- 静态资源服务
- 缓存策略

#### 脚本工具 (见scripts/)
- `startup.sh` - 启动服务
- `shutdown.sh` - 停止服务
- `deploy.sh` - 部署脚本
- `bump_version.sh` - 版本更新

## 📝 文档使用建议

### 新用户
1. 先阅读 [../README.md](../README.md) 了解项目
2. 查看 [EVENTS_FEATURE_GUIDE.md](EVENTS_FEATURE_GUIDE.md) 学习核心功能
3. 参考 [PWA_MOBILE_GUIDE.md](PWA_MOBILE_GUIDE.md) 安装移动端

### 开发者
1. 阅读 [EVENTS_INTEGRATION_PLAN.md](EVENTS_INTEGRATION_PLAN.md) 了解技术架构
2. 查看 [VERSION_MANAGEMENT.md](VERSION_MANAGEMENT.md) 了解开发流程
3. 参考 [ROADMAP.md](ROADMAP.md) 了解开发计划

### 运维人员
1. 查看 docker-compose.yml 和 nginx 配置
2. 使用 scripts/ 目录下的运维脚本
3. 参考 [VERSION_MANAGEMENT.md](VERSION_MANAGEMENT.md) 进行版本更新

### 产品经理
1. 阅读 [ROADMAP.md](ROADMAP.md) 了解产品规划
2. 查看 [EVENTS_FEATURE_GUIDE.md](EVENTS_FEATURE_GUIDE.md) 了解功能细节
3. 参考 [MATCHER_IMPROVEMENTS.md](MATCHER_IMPROVEMENTS.md) 了解优化方向

## 🔍 快速查找

### 按功能查找

**Events功能**
- 使用指南: [EVENTS_FEATURE_GUIDE.md](EVENTS_FEATURE_GUIDE.md)
- 技术方案: [EVENTS_INTEGRATION_PLAN.md](EVENTS_INTEGRATION_PLAN.md)
- Rematch操作: [REMATCH_GUIDE.md](REMATCH_GUIDE.md)
- 改进计划: [MATCHER_IMPROVEMENTS.md](MATCHER_IMPROVEMENTS.md)

**音频分析**
- 功能说明: [../README.md](../README.md)
- 代码位置: `backend/services/audio_analyzer.py`

**Scraper系统**
- 代码位置: `scraper/app/`
- API文档: (待创建)

**PWA功能**
- 使用指南: [PWA_MOBILE_GUIDE.md](PWA_MOBILE_GUIDE.md)
- 配置文件: `frontend/public/manifest.json`

### 按角色查找

**用户**
- [EVENTS_FEATURE_GUIDE.md](EVENTS_FEATURE_GUIDE.md)
- [REMATCH_GUIDE.md](REMATCH_GUIDE.md)
- [PWA_MOBILE_GUIDE.md](PWA_MOBILE_GUIDE.md)

**开发者**
- [EVENTS_INTEGRATION_PLAN.md](EVENTS_INTEGRATION_PLAN.md)
- [MATCHER_IMPROVEMENTS.md](MATCHER_IMPROVEMENTS.md)
- [VERSION_MANAGEMENT.md](VERSION_MANAGEMENT.md)
- [../README.md](../README.md)

**产品/项目管理**
- [ROADMAP.md](ROADMAP.md)
- [EVENTS_FEATURE_GUIDE.md](EVENTS_FEATURE_GUIDE.md)
- [MATCHER_IMPROVEMENTS.md](MATCHER_IMPROVEMENTS.md)

## 📋 文档维护

### 文档更新原则
1. **及时性**: 功能变更后立即更新相关文档
2. **准确性**: 确保文档内容与实际代码一致
3. **完整性**: 包含必要的示例和说明
4. **可读性**: 使用清晰的结构和语言

### 文档审查清单
- [ ] 标题和目录结构清晰
- [ ] 代码示例可运行
- [ ] 截图和图表最新
- [ ] 链接有效
- [ ] 语法和拼写正确
- [ ] 版本信息准确

### 贡献文档
欢迎贡献文档! 请遵循以下步骤:
1. Fork项目
2. 创建文档分支
3. 编写或更新文档
4. 提交Pull Request
5. 等待审查和合并

## 🆘 获取帮助

### 文档问题
- 如果文档有错误或不清楚,请提交Issue
- 标签: `documentation`

### 功能问题
- 查看对应的功能文档
- 搜索已有的Issues
- 提交新的Issue并详细描述问题

### 技术支持
- GitHub Issues: 报告bug和功能请求
- GitHub Discussions: 讨论想法和问题
- Email: [待添加]

## 📅 文档更新历史

### 2026-04-06
- ✅ 创建文档目录结构
- ✅ 整理现有文档到docs/目录
- ✅ 创建REMATCH_GUIDE.md
- ✅ 创建MATCHER_IMPROVEMENTS.md
- ✅ 创建ROADMAP.md
- ✅ 更新README.md文档索引

### 待办事项
- [ ] 创建API文档
- [ ] 创建架构文档
- [ ] 创建贡献指南
- [ ] 创建行为准则
- [ ] 添加更多示例和教程

## 📚 相关资源

### 技术栈文档
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [SQLAlchemy](https://www.sqlalchemy.org/)
- [sql.js](https://sql.js.org/)
- [Tailwind CSS](https://tailwindcss.com/)

### 工具和库
- [Vite](https://vitejs.dev/)
- [Essentia.js](https://mtg.github.io/essentia.js/)
- [Levenshtein](https://en.wikipedia.org/wiki/Levenshtein_distance)

---

**最后更新**: 2026-04-06
**维护者**: Rumi Team
**许可证**: [待添加]
