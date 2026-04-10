# 实习培养计划：AI News Curation Agent & Publishing Pool

**时长：** 8 周（2 个月）
**节奏：** 半全职（每周 3-4 天）
**Mentor Check-in：** 每周 1-2 次
**教学风格：** 以交付为导向，边做边学——知识点在需要时才教，不提前囤课
**最终目标：** 完整系统上线 epochtimesnw.com，全链路投产运行

---

## 阶段总览

```
Week 1-2  🔧 基础设施阶段    开发环境 + Git + 服务器 + 部署初体验
Week 3-4  ⚙️ 后端阶段        FastAPI + PostgreSQL + 全部 API
Week 5-6  🖥️ 前端 + Agent    React 审核工作台 + Hermes Agent 搭建
Week 7-8  🚀 集成 + 上线      分发层 + 全链路联调 + 生产部署
```

每周结束时都应有一个**可展示的产出物 (Demo)**。每个阶段结束时有一次**正式 Milestone Review**。

---

## Week 1：开发环境 + Git 工作流

> **目标：** 能独立使用 Git 协作开发，理解项目全貌

### 要学的知识点

| 知识点 | 为什么现在要学 |
| :--- | :--- |
| Terminal 基础命令 | 后续所有操作的基础（`cd`, `ls`, `mkdir`, `cat`, `which` 等） |
| Git 核心概念 | 整个项目的协作方式：`clone`, `add`, `commit`, `push`, `pull` |
| Git 分支与 PR | 真实开发流程：`branch`, `checkout`, `merge`，GitHub Pull Request |
| Markdown | 项目文档全部是 Markdown 格式 |
| Python 虚拟环境 | 后端开发需要隔离依赖：`venv`, `pip` |
| Node.js + npm | 前端开发的运行环境 |

### 每日任务拆解

**Day 1 — 环境搭建 + 项目认知**
- 安装开发工具：VS Code、Git、Python 3.12、Node.js 20
- Clone 项目仓库到本地
- 通读 `HL-Intern-Vision.md`，理解项目要解决什么问题
- 通读 `HL-Intern-Project.md`，理解技术选型和系统架构
- 产出：用自己的话写一段 200 字的"项目理解"提交到仓库

**Day 2 — Git 工作流实战**
- 学习 Git 基础：`init`, `add`, `commit`, `log`, `diff`, `status`
- 学习分支操作：`branch`, `checkout -b`, `merge`
- 在 GitHub 上创建第一个 Pull Request
- 学习 `.gitignore` 的作用
- 产出：完成至少 3 次有意义的 commit，1 个合并的 PR

**Day 3 — 项目结构与本地环境**
- 创建 Python 虚拟环境 (`python -m venv .venv`)
- 安装 FastAPI + Uvicorn，写一个返回 `{"hello": "world"}` 的接口
- 用浏览器和 `curl` 分别访问，理解 HTTP 请求/响应
- 安装 Node.js，用 `npm create vite@latest` 创建一个 React 空项目并运行
- 产出：本地能同时跑起一个 FastAPI 和一个 React 项目

### 本周 Demo
> 向 mentor 展示：本地 FastAPI + React 两个项目都能跑起来，能通过 Git 提交代码和创建 PR。

---

## Week 2：服务器 + Docker + Dokploy 初体验

> **目标：** 能通过 SSH 操作服务器，理解 Docker，能用 Dokploy 部署一个简单应用

### 要学的知识点

| 知识点 | 为什么现在要学 |
| :--- | :--- |
| SSH | 连接远程服务器的唯一方式 |
| Linux 基础命令 | 服务器是 Linux 系统，需要基本操作能力 |
| Docker 核心概念 | 所有服务都容器化部署：镜像、容器、Dockerfile、docker-compose |
| Dokploy | 我们的部署和 CI/CD 平台，管理所有服务 |
| 环境变量 | 生产环境配置（密钥、数据库连接等）的标准做法 |

### 每日任务拆解

**Day 1 — SSH + 服务器探索**
- 学习 SSH 密钥对概念，生成自己的密钥 (`ssh-keygen`)
- 用 SSH 连接 Hetzner VPS (`ssh user@5.78.203.102`)
- 熟悉服务器环境：`uname`, `df -h`, `free -m`, `top`, `ps aux`
- 理解文件权限：`chmod`, `chown`，`ls -la` 读懂权限位
- 产出：能独立 SSH 登录服务器并执行基本命令

**Day 2 — Docker 基础**
- 学习 Docker 核心概念：镜像 vs 容器、Dockerfile 指令
- 在本地安装 Docker Desktop
- 为 Week 1 的 FastAPI 项目写一个 `Dockerfile`
- 学习 `docker build`, `docker run`, `docker ps`, `docker logs`
- 学习 `docker-compose.yml`：多容器编排（FastAPI + PostgreSQL）
- 产出：本地能用 `docker-compose up` 启动 FastAPI + PostgreSQL

**Day 3 — Dokploy + 第一次部署**
- 访问 Dokploy 管理面板 (http://5.78.203.102:3000)
- 理解 Dokploy 的概念：Project、Service、Domain、Environment Variables
- 将 Week 1 的 Hello World FastAPI 应用通过 Dokploy 部署到 VPS
- 配置 GitHub 仓库连接，理解 push → 自动部署的 CI/CD 流程
- 产出：Hello World 应用跑在 VPS 上，能通过公网 IP 访问

### Milestone Review #1
> **检查项：** 
> - [ ] 能独立 SSH 登录服务器
> - [ ] 理解 Docker 镜像/容器的区别
> - [ ] 能写 Dockerfile 和 docker-compose.yml
> - [ ] 能通过 Dokploy 部署应用
> - [ ] 理解 push 代码 → 自动部署的完整流程

---

## Week 3：后端 Phase 1 — 数据库 + 项目骨架

> **目标：** 搭建 FastAPI 项目骨架，完成数据库设计和基础 API

### 要学的知识点

| 知识点 | 为什么现在要学 |
| :--- | :--- |
| PostgreSQL 基础 | 项目的核心数据存储：建表、查询、`psql` 客户端 |
| SQLAlchemy ORM | Python 操作数据库的方式，不直接写 SQL |
| Alembic 迁移 | 数据库 schema 变更的版本控制 |
| FastAPI 项目结构 | 路由、依赖注入、Pydantic schema、中间件 |
| HTTP 状态码 | API 开发必须理解：200, 201, 400, 401, 404, 409, 422, 500 |

### 每日任务拆解

**Day 1 — PostgreSQL + SQLAlchemy**
- 用 Docker 启动本地 PostgreSQL，学习 `psql` 基本操作
- 手动创建 `news_articles` 和 `users` 表，练习 INSERT/SELECT/UPDATE
- 学习 SQLAlchemy 2.0：定义 Model 映射到数据库表
- 配置 Alembic，生成第一个 migration 并执行 `alembic upgrade head`
- 产出：本地数据库有完整的表结构，通过 Alembic 管理

**Day 2 — FastAPI 项目结构搭建**
- 按以下结构初始化项目：
  ```
  backend/
  ├── app/
  │   ├── main.py          # FastAPI 应用入口
  │   ├── config.py         # 配置（环境变量读取）
  │   ├── database.py       # 数据库连接
  │   ├── models/           # SQLAlchemy 模型
  │   ├── schemas/          # Pydantic 请求/响应 schema
  │   ├── routers/          # API 路由
  │   └── services/         # 业务逻辑
  ├── alembic/
  ├── Dockerfile
  ├── docker-compose.yml
  └── requirements.txt
  ```
- 实现 `GET /health` 健康检查接口（含数据库连通性检查）
- 产出：项目结构清晰，`/health` 返回 200 且显示数据库状态

**Day 3 — Webhook + 基础 CRUD**
- 实现 `POST /api/v1/webhook/incoming-news`：
  - API Key 校验（`X-Agent-Key` header）
  - 数据校验（Pydantic schema）
  - 入库（status 默认 `PENDING`）
  - `source_url` 重复返回 409
- 实现 `GET /api/v1/news`（列表 + 分页 + 状态筛选）
- 实现 `GET /api/v1/news/{id}`（详情）
- 用 `curl` 或 Postman/Bruno 手动测试每个接口
- 产出：Webhook 能正确入库，列表和详情接口可用

**Day 4 — 本地测试入门**
- 学习 `pytest` 基础：test function、fixture、assert
- 为 Webhook 接口写测试：正常入库、重复 URL、缺少必填字段、无效 API Key
- 为列表接口写测试：分页、状态筛选
- 学习 FastAPI 的 `TestClient`
- 产出：至少 8 个测试用例全部通过

### 本周 Demo
> 用 curl 演示：推送一条新闻 → 入库 → 查列表能看到 → 查详情能看到全文。

---

## Week 4：后端 Phase 2 — 认证 + 业务流程

> **目标：** 完成 JWT 认证和全部业务 API，后端功能完整

### 要学的知识点

| 知识点 | 为什么现在要学 |
| :--- | :--- |
| JWT 认证 | 前端登录和 API 权限控制的基础 |
| 密码哈希 (bcrypt) | 安全存储用户密码 |
| 角色权限控制 | editor vs admin 不同权限 |
| 异步任务 | 分发到 WordPress/Twitter 是异步操作 |
| 状态机 | 文章的生命周期管理 |

### 每日任务拆解

**Day 1 — JWT 认证系统**
- 学习 JWT 原理：header.payload.signature，access token vs refresh token
- 实现 `POST /api/v1/auth/login`：验证用户名密码，返回 token pair
- 实现 `POST /api/v1/auth/refresh`：用 refresh token 换新 access token
- 实现 JWT 中间件：校验 token、提取用户信息、角色判断
- 创建初始 admin 用户的 seed 脚本
- 产出：登录拿 token → 带 token 访问受保护接口 → 过期后刷新

**Day 2 — 审核业务 API**
- 实现 `PUT /api/v1/news/{id}`：编辑修改标题/正文/摘要（仅 PENDING 状态允许）
- 实现 `POST /api/v1/news/{id}/publish`：审批通过，状态 → PUBLISHING
- 实现 `POST /api/v1/news/{id}/reject`：驳回，记录原因
- 实现 `POST /api/v1/news/{id}/retry`：重试失败分发（仅 admin）
- 实现 `GET /api/v1/stats/overview`：统计各状态数量（仅 admin）
- 产出：全部 API 端点可用，状态流转正确

**Day 3 — 测试 + 部署后端**
- 为认证和审核流程补充测试用例
- 更新 Dockerfile 和 docker-compose.yml（加入 PostgreSQL 持久化卷）
- 通过 Dokploy 将后端部署到 VPS
- 配置环境变量：数据库连接、JWT 密钥、Agent API Key
- 用 `curl` 对线上 API 做冒烟测试
- 产出：后端 API 跑在 VPS 上，外网可访问

### Milestone Review #2
> **检查项：**
> - [ ] 所有 API 端点实现完毕（参照 `docs/api-spec.md` 逐项对照）
> - [ ] JWT 认证流程完整（登录 → 访问 → 刷新 → 过期拒绝）
> - [ ] 状态机流转正确（PENDING → PUBLISHING → PUBLISHED / FAILED）
> - [ ] 后端已部署到 VPS，公网可访问
> - [ ] 核心接口有测试覆盖

---

## Week 5：前端审核工作台

> **目标：** 搭建 React 前端，实现完整的编辑审核流程

### 要学的知识点

| 知识点 | 为什么现在要学 |
| :--- | :--- |
| React 基础 | 组件、props、state、useEffect、事件处理 |
| TypeScript 基础 | 类型安全，项目要求使用 TS |
| Vite | 前端构建工具，开发体验极快 |
| Zustand | 轻量状态管理（存 token、用户信息等全局状态） |
| TipTap | 富文本编辑器，编辑修改 AI 生成内容的核心组件 |
| Fetch / Axios | 前端调用后端 API |

### 每日任务拆解

**Day 1 — React 项目初始化 + 登录页**
- 用 Vite 创建 React + TypeScript 项目
- 配置项目结构：
  ```
  frontend/
  ├── src/
  │   ├── components/     # 通用组件
  │   ├── pages/          # 页面组件
  │   ├── stores/         # Zustand 状态
  │   ├── services/       # API 调用封装
  │   ├── types/          # TypeScript 类型定义
  │   └── App.tsx
  ├── Dockerfile
  └── package.json
  ```
- 实现登录页：用户名 + 密码表单 → 调用 `/auth/login` → 存储 token
- 用 Zustand 管理认证状态（token、用户信息）
- 实现路由守卫：未登录跳转登录页
- 产出：能登录并跳转到主页

**Day 2 — 新闻列表页 + 详情页**
- 实现待审新闻列表页：
  - 调用 `GET /api/v1/news?status=PENDING`
  - 表格展示：标题、来源、时间、状态
  - 分页控件
  - 状态筛选标签（PENDING / PUBLISHED / REJECTED / FAILED）
- 实现新闻详情页：
  - 左栏：原文（source_title + source_content），只读
  - 右栏：AI 改写内容（ai_title + ai_content），用 TipTap 可编辑
  - 底部：摘要编辑（ai_summary）
  - 操作按钮：保存、审批通过、驳回
- 产出：能浏览列表、进入详情、看到原文对照

**Day 3 — 审核流程联调 + Token 刷新**
- 实现审批通过流程：点击"通过" → `POST /news/{id}/publish` → 状态更新
- 实现驳回流程：弹窗输入原因 → `POST /news/{id}/reject`
- 实现保存修改：`PUT /news/{id}` → 更新标题/正文
- 实现 token 自动刷新：access token 过期前自动调用 `/auth/refresh`
- 处理 API 错误：401 跳登录、网络错误提示
- 产出：完整审核流程可用——登录 → 看列表 → 编辑 → 审批/驳回

### 本周 Demo
> 完整演示：登录 → 查看待审列表 → 打开详情 → 对照原文修改 AI 内容 → 审批通过（或驳回）。

---

## Week 6：Hermes Agent 搭建

> **目标：** Agent 能自动抓取新闻、AI 改写、推送到后端

### 要学的知识点

| 知识点 | 为什么现在要学 |
| :--- | :--- |
| Hermes Agent | 项目的核心自动化组件，自主浏览器智能体 |
| Claude API | AI 内容改写的引擎 |
| Prompt Engineering | 改写质量取决于 Prompt 设计 |
| Webhook 调用 | Agent 向后端推送数据 |
| Telegram Bot API | 发送通知到编辑群 |
| 定时任务 | Agent 需要定期自动运行 |

### 每日任务拆解

**Day 1 — Hermes Agent 环境 + 第一次抓取**
- 阅读 Hermes Agent 文档和参考资料（[@Will_Yang_](https://x.com/Will_Yang_/status/2041507883876233312)）
- 搭建 Hermes Agent 运行环境
- 编写第一个任务：打开 TechCrunch 首页，提取最新 3 篇文章的标题和链接
- 验证 Agent 能稳定执行抓取
- 产出：Agent 能自动打开新闻网站并提取文章列表

**Day 2 — Claude API 改写 + Webhook 推送**
- 学习 Claude API / Anthropic SDK 的基本用法
- 设计改写 Prompt：
  - 输入：英文原文标题 + 正文
  - 输出：中文标题（头条风格）+ 中文正文（华人视角）+ 280 字内摘要
  - 注入西雅图本地视角（参照项目 Vision 中的策略）
- Agent 抓取 → Claude 改写 → `POST /webhook/incoming-news` 推送后端
- 验证数据正确入库（状态为 PENDING）
- 产出：Agent 全自动完成"抓取 → 改写 → 入库"链路

**Day 3 — Telegram 通知 + 定时运行**
- 创建 Telegram Bot（通过 @BotFather）
- 实现入库成功后发送 Telegram 通知：文章标题 + 来源 + 状态
- 配置定时任务：每隔 N 小时自动执行一轮抓取
- 异常处理：抓取失败、改写失败、推送失败时发 Telegram 告警
- 产出：Agent 定时运行，有新文章时编辑群收到通知

### Milestone Review #3
> **检查项：**
> - [ ] 前端审核工作台功能完整，能登录、浏览、编辑、审批、驳回
> - [ ] Hermes Agent 能自动抓取至少 2 个新闻源
> - [ ] Claude 改写质量可接受（标题吸引、正文通顺、有本地视角）
> - [ ] Agent → 后端 → 前端 的内部闭环已跑通
> - [ ] Telegram 通知正常工作

---

## Week 7：分发层 + 全链路联调

> **目标：** 审批通过后自动发布到 WordPress 和 Twitter，全链路端到端跑通

### 要学的知识点

| 知识点 | 为什么现在要学 |
| :--- | :--- |
| WordPress REST API | 自动创建文章到 epochtimesnw.com |
| Twitter API v2 | 自动发推文 |
| OAuth / Application Password | WP 和 Twitter 的认证方式 |
| 异步任务处理 | 分发是异步的，不能阻塞 API 响应 |
| 错误处理与重试 | 分发失败的容错机制 |

### 每日任务拆解

**Day 1 — WordPress REST API 集成**
- 在 epochtimesnw.com 后台创建 Application Password
- 学习 WP REST API：`POST /wp-json/wp/v2/posts` 创建文章
- 实现后端分发服务：审批通过 → 创建 WP 文章（标题、正文、分类、来源标注）
- 将 `wp_post_id` 回写数据库
- 在测试环境验证文章排版正确
- 产出：审批通过后文章自动出现在 WordPress

**Day 2 — Twitter API 集成**
- 申请/配置 Twitter API v2 权限（如已有）
- 学习 Twitter API：`POST /2/tweets` 发推
- 实现：WP 文章发布后，自动发推（AI 摘要 + 文章链接）
- 将 `tweet_id` 回写数据库
- 如果 Twitter API 未到位：标记为 P1 后续迭代，先确保 WP 链路完整
- 产出：审批通过后自动发推（或标记为待集成）

**Day 3 — 全链路联调**
- 端到端测试完整流程：
  1. Hermes Agent 抓取一篇真实新闻
  2. Claude 改写 → Webhook 推送入库
  3. Telegram 通知编辑
  4. 编辑在前端工作台审核、修改、审批通过
  5. 自动发布到 WordPress（+ Twitter）
  6. 验证线上文章内容和排版
- 记录并修复联调中发现的所有问题
- 产出：至少 3 篇新闻完成全链路端到端测试

### 本周 Demo
> 真实演示全流程：从 Agent 抓取到文章出现在 epochtimesnw.com。

---

## Week 8：生产部署 + 收尾

> **目标：** 所有服务部署到 VPS，系统正式投产

### 要学的知识点

| 知识点 | 为什么现在要学 |
| :--- | :--- |
| CI/CD 流水线 | GitHub push → 自动构建 → 自动部署 |
| HTTPS / 域名 | 生产环境安全要求 |
| 日志与监控 | 线上问题排查能力 |
| 环境变量管理 | 生产环境密钥配置 |

### 每日任务拆解

**Day 1 — 全服务部署**
- 通过 Dokploy 部署所有服务到 VPS：
  - PostgreSQL 数据库
  - FastAPI 后端
  - React 前端
  - Hermes Agent
- 配置所有生产环境变量（数据库、JWT 密钥、API Keys）
- 配置域名和 HTTPS（如有域名）
- 产出：所有服务在 VPS 上运行

**Day 2 — CI/CD + 监控**
- 配置 GitHub → Dokploy 自动部署流水线：
  - push 到 `main` 分支 → 自动构建 → 自动部署
  - 测试整个流程：改一行代码 → push → 验证线上更新
- 配置结构化日志输出（JSON 格式）
- 在 Dokploy 中查看服务日志、资源使用
- 设置基本告警：服务挂掉时 Telegram 通知
- 产出：CI/CD 流水线正常工作，能看到线上日志

**Day 3 — 生产验收 + 文档收尾**
- 生产环境全链路测试：至少跑通 5 篇新闻的完整流程
- 验收检查清单：
  - [ ] Agent 定时抓取正常
  - [ ] 新闻入库 + Telegram 通知正常
  - [ ] 前端登录/审核/发布流程正常
  - [ ] WordPress 文章内容和排版正确
  - [ ] Twitter 发推正常（如已集成）
  - [ ] CI/CD 自动部署正常
  - [ ] 日志可查、告警可收
- 补充项目文档：部署手册、运维手册、已知问题
- 产出：系统正式投产运行

### Milestone Review #4（最终评审）
> **检查项：**
> - [ ] 全链路端到端正常运行
> - [ ] 至少 5 篇新闻通过系统完整发布
> - [ ] CI/CD 流水线正常
> - [ ] 生产环境稳定，无 P0 问题
> - [ ] 项目文档完整

---

## 风险与应对

| 风险 | 影响 | 应对策略 |
| :--- | :--- | :--- |
| 实习生在某个知识点卡住超过 1 天 | 进度延误 | 及时 escalate 给 mentor，不要独自卡超过 2 小时 |
| Hermes Agent 不稳定 | Agent 层阻塞 | 备选方案：降级为 Playwright 脚本 + cron 定时任务 |
| Twitter API 权限未到位 | Week 7 无法集成 | 先只做 WordPress 分发，Twitter 作为后续迭代 |
| 前端 TipTap 集成复杂度超预期 | Week 5 延误 | 先用简单 textarea，TipTap 作为增强项 |
| 全链路联调问题多 | Week 7-8 时间紧 | 每完成一个模块就和已有模块做集成测试，不要全留到最后 |

---

## Mentor Check-in 模板

每周 check-in 时建议覆盖以下内容：

```
1. 本周完成了什么？（对照计划中的任务）
2. 遇到了什么卡点？怎么解决的？
3. 下周计划做什么？
4. 有什么需要 mentor 帮助的？
```

---

## 附录：推荐学习资源

| 主题 | 资源 | 说明 |
| :--- | :--- | :--- |
| Git | [Learn Git Branching](https://learngitbranching.js.org/) | 交互式 Git 学习，可视化理解分支 |
| Docker | [Docker Getting Started](https://docs.docker.com/get-started/) | Docker 官方入门教程 |
| FastAPI | [FastAPI Tutorial](https://fastapi.tiangolo.com/tutorial/) | 官方教程，质量极高 |
| React | [React 官方教程](https://react.dev/learn) | 最新 React 18 教程 |
| TypeScript | [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/) | 官方手册 |
| PostgreSQL | [PostgreSQL Tutorial](https://www.postgresqltutorial.com/) | 面向初学者的 PG 教程 |
| Hermes Agent | [@Will_Yang_](https://x.com/Will_Yang_/status/2041507883876233312) | Hermes Agent 参考实践 |
| Claude API | [Anthropic Docs](https://docs.anthropic.com/) | Claude API 官方文档 |
