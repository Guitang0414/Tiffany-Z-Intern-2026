# AI News Curation Agent & Publishing Pool
**Internship Project Specification v2.0**

---

## 1. 项目概述 (Project Overview)

本项目旨在搭建一个自动化的新闻处理流水线，利用本地自主智能体 (OpenClaw) 替代传统网络爬虫。系统将实现从"新闻线索发掘 → AI 深度重写 → 人工集中审核 (Pool) → 多平台一键分发"的端到端自动化闭环，大幅提升内容运营团队的效率。

### 1.1 核心业务流程

1. **自动抓取与重写 (Agent Layer):** Hermes Agent 智能体定时唤醒，控制浏览器抓取目标新闻源，调用 Claude API 将核心事实改写为头条风格。
2. **状态汇聚与通知 (API & Notification Layer):** Agent 将改写后的数据通过 Webhook 推送至后端入库（状态：`PENDING`），并通过 Telegram Bot 向编辑群组发送通知。
3. **集中审核 (Frontend Pool):** 编辑登录前端工作台，查看待审列表，校对原文，修改 AI 生成的内容，并进行审批或驳回。
4. **一键分发 (Distribution Layer):** 审批通过后，后端自动调用 WordPress REST API 创建排版好的文章，并调用 Twitter API 发布带链接的简讯。

### 1.2 项目目标

| 目标 | 衡量标准 |
| :--- | :--- |
| 新闻产出效率提升 | 从人工采编 2h/篇 降至审核 10min/篇 |
| 端到端自动化 | Agent 抓取到 WP/Twitter 发布全程无需人工介入（审核环节除外） |
| 内容质量保障 | 所有 AI 生成内容必须经过编辑审核后才能发布 |
| 系统可用性 | Agent 定时任务成功率 ≥ 95%，API 平均响应时间 < 500ms |

### 1.3 战略价值：解决“不够快、不够深”的业务痛点 (Strategic Value)

系统不仅作为提效工具，更承载着针对西雅图华人群体的产能战略转型：
1. **解决“不够快”**：通过 Agent 自动化链路与全时不间断抓取，实现重大新闻或本地事件发布速度从滞后数小时跃升至与英文源头媒体同步首发。
2. **解决“不够深”**：
   - **AI 提供第一层深度**：利用 Prompt (`SOUL.md`) 强制注入视角，例如要求 Claude 在改写科技或房市新闻时加入西雅图本地相关影响；
   - **人类创造核心护城河**：将编辑从耗时的翻译改写中解放，将核心精力投入到本地原创与深度报道（如采访、探店等 AI 无法替代的高价值内容），重构内容生产力模型。

---

## 2. 技术选型 (Tech Stack)

| 模块 | 技术栈 | 选型理由 |
| :--- | :--- | :--- |
| **Agent 层** | Hermes Agent | 自主智能体替代传统爬虫，浏览器自动化反爬能力强 |
| **核心后端** | Python 3.12 + FastAPI | 异步高性能，生态丰富，Claude SDK 原生支持 |
| **ORM** | SQLAlchemy 2.0 + Alembic | 成熟稳定，Alembic 管理数据库迁移 |
| **数据库** | PostgreSQL 16 | 稳定可靠，支持 UUID、JSONB 等高级特性 |
| **前端** | React 18 + TypeScript + Vite | 组件生态丰富，Vite 构建极速 |
| **前端状态管理** | Zustand | 轻量，适合中小型内部工具 |
| **富文本编辑** | TipTap | 基于 ProseMirror，可定制性强 |
| **前端认证** | JWT (access + refresh token) | 简洁，适合内部系统 |
| **通讯** | Telegram Bot API | 编辑群组实时通知 |
| **分发** | WordPress REST API, Twitter API v2 | 官方 API，稳定可靠 |
| **部署** | Dokploy on Hetzner VPS (5.78.203.102) | 统一部署与 CI/CD 管理 |

---

## 3. 系统架构概览 (Architecture Overview)

> 详细架构图与数据流请参阅 → [docs/architecture.md](docs/architecture.md)

为保证系统安全性与稳定性，各层之间采用**物理隔离 + API 通信**的方式部署：

| 层级 | 部署位置 | 隔离策略 |
| :--- | :--- | :--- |
| Agent 层 | Hetzner VPS 隔离容器 | **严禁直连数据库**，仅通过 Webhook API 通信 |
| 核心后端 + DB | Hetzner VPS (Dokploy 管理) | 内部通信，外部仅暴露 API Gateway |
| 前端 | Hetzner VPS (Dokploy 管理) | 通过 HTTPS 调用后端 API |

---

## 4. 数据库设计 (Database Schema)

### 4.1 `news_articles` 表 — 核心新闻数据

| 字段名 | 数据类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PK, DEFAULT gen_random_uuid() | 主键 |
| `source_url` | VARCHAR(2048) | UNIQUE, NOT NULL | 原始新闻链接（唯一约束，用于去重） |
| `source_title` | VARCHAR(500) | | 原始新闻标题 |
| `source_content` | TEXT | | 原始新闻正文（供编辑对照） |
| `source_site` | VARCHAR(100) | | 来源站点名称（如 "TechCrunch"） |
| `ai_title` | VARCHAR(500) | NOT NULL | AI 生成的标题（编辑可修改） |
| `ai_content` | TEXT | NOT NULL | AI 生成的正文（编辑可修改） |
| `ai_summary` | VARCHAR(280) | | AI 生成的摘要（用于 Twitter，≤280 字符） |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'PENDING' | 见下方状态机 |
| `rejection_reason` | TEXT | | 驳回原因（status=REJECTED 时填写） |
| `reviewed_by` | UUID | FK → users.id | 审核人 |
| `published_at` | TIMESTAMP | | 发布时间 |
| `wp_post_id` | INTEGER | | WordPress 文章 ID（发布回执） |
| `tweet_id` | VARCHAR(50) | | Twitter 推文 ID（发布回执） |
| `created_at` | TIMESTAMP | DEFAULT NOW() | 入库时间 |
| `updated_at` | TIMESTAMP | DEFAULT NOW(), ON UPDATE | 最后修改时间 |

### 4.2 `users` 表 — 编辑用户

| 字段名 | 数据类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PK | 主键 |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL | 登录用户名 |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt 哈希后的密码 |
| `display_name` | VARCHAR(100) | | 显示名称 |
| `role` | VARCHAR(20) | DEFAULT 'editor' | 角色：`editor` / `admin` |
| `created_at` | TIMESTAMP | DEFAULT NOW() | 创建时间 |

### 4.3 状态机 (Article Status Machine)

```
PENDING → PUBLISHED    (编辑审批通过，触发分发)
PENDING → REJECTED     (编辑驳回，填写原因)
PENDING → PUBLISHING   (分发进行中)
PUBLISHING → PUBLISHED (分发成功)
PUBLISHING → FAILED    (分发失败，可重试)
FAILED → PUBLISHING    (重试分发)
REJECTED → PENDING     (重新提交审核，可选)
```

---

## 5. API 接口设计 (API Design)

> 完整的请求/响应 Schema 请参阅 → [docs/api-spec.md](docs/api-spec.md)

### 5.1 认证接口

| Method | Endpoint | 说明 |
| :--- | :--- | :--- |
| POST | `/api/v1/auth/login` | 编辑登录，返回 JWT token |
| POST | `/api/v1/auth/refresh` | 刷新 access token |

### 5.2 Webhook 接口（Agent 调用）

| Method | Endpoint | 认证方式 | 说明 |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/webhook/incoming-news` | API Key (Header: `X-Agent-Key`) | Agent 推送新闻数据 |

### 5.3 新闻管理接口（前端调用）

| Method | Endpoint | 权限 | 说明 |
| :--- | :--- | :--- | :--- |
| GET | `/api/v1/news` | editor | 获取新闻列表，支持 `?status=` 筛选和分页 |
| GET | `/api/v1/news/{id}` | editor | 获取单条新闻详情（含原文对照） |
| PUT | `/api/v1/news/{id}` | editor | 保存编辑修改 |
| POST | `/api/v1/news/{id}/publish` | editor | 审批通过并触发分发 |
| POST | `/api/v1/news/{id}/reject` | editor | 驳回并填写原因 |
| POST | `/api/v1/news/{id}/retry` | admin | 重试失败的分发 |

### 5.4 统计接口

| Method | Endpoint | 权限 | 说明 |
| :--- | :--- | :--- | :--- |
| GET | `/api/v1/stats/overview` | admin | 获取各状态新闻数量、今日发布数等概览数据 |

---

## 6. 安全设计 (Security)

### 6.1 认证与鉴权

- **前端用户认证：** JWT (access token 有效期 30min + refresh token 有效期 7d)
- **Agent Webhook 认证：** 固定 API Key，通过 `X-Agent-Key` Header 传递，后端校验
- **角色权限控制：** `editor` 可审核/编辑，`admin` 额外拥有重试分发、查看统计等权限

### 6.2 Webhook 安全

- API Key 通过环境变量注入，不硬编码
- 后端对 Webhook 请求做 **速率限制**（10 req/min），防止异常刷入
- `source_url` 唯一约束防止重复入库，冲突时返回 `409 Conflict`

### 6.3 Agent 沙盒隔离

- Agent 运行在 Hetzner VPS 的隔离环境中，仅允许出站 HTTP/HTTPS 流量
- 严禁 Agent 直连数据库或访问内部服务
- Agent 的凭证（API Key、Claude API Key）通过环境变量注入

### 6.4 通用安全措施

- 所有 API 强制 HTTPS
- 密码使用 bcrypt 哈希（cost factor ≥ 12）
- SQL 注入防护：全程使用 ORM 参数化查询
- XSS 防护：前端使用 React 自动转义 + TipTap 输出 sanitize
- CORS 白名单：仅允许前端域名访问后端 API

---

## 7. 错误处理与可靠性 (Error Handling & Reliability)

### 7.1 Webhook 入库

| 场景 | 处理策略 |
| :--- | :--- |
| `source_url` 重复 | 返回 `409 Conflict`，Agent 静默忽略 |
| 请求体格式错误 | 返回 `422 Unprocessable Entity`，记录日志 |
| 数据库写入失败 | 返回 `500`，Agent 应做最多 3 次指数退避重试 |

### 7.2 分发失败

| 场景 | 处理策略 |
| :--- | :--- |
| WordPress API 超时/报错 | 状态置为 `FAILED`，记录错误详情，前端可手动重试 |
| Twitter API 超时/报错 | 同上，WP 和 Twitter 独立分发，互不阻塞 |
| 部分成功 | 如 WP 成功但 Twitter 失败，记录各自状态，允许单独重试 |

### 7.3 Agent 异常

| 场景 | 处理策略 |
| :--- | :--- |
| 目标网站结构变更 | Agent 发送 Telegram 告警，人工介入调整 |
| Claude API 调用失败 | 指数退避重试 3 次，仍失败则跳过并记录 |
| Agent 进程崩溃 | Dokploy 自动重启策略 |

---

## 8. 开发里程碑 (4-Week Sprint)

### Week 1: 驾驭智能体 (Agent 层建设)

| Task | 描述 | Definition of Done |
| :--- | :--- | :--- |
| 1.1 | 搭建 Hermes Agent 运行环境 | Agent 能启动并成功打开目标网站 |
| 1.2 | 编写采编提示词与定时巡视逻辑 | Agent 能自主发现至少 1 个目标源的最新新闻并完成 AI 改写 |
| 1.3 | 配置 Telegram Bot，跑通基础循环 | Agent 完成"发现新闻 → Claude 改写 → Telegram 群发送结构化消息"，至少成功执行 3 次 |

### Week 2: 搭建中枢神经 (后端 API 与 DB)

| Task | 描述 | Definition of Done |
| :--- | :--- | :--- |
| 2.1 | 初始化 FastAPI 项目，配置 PostgreSQL + SQLAlchemy + Alembic | `alembic upgrade head` 能成功创建所有表，API 健康检查 `/health` 返回 200 |
| 2.2 | 开发 Webhook 接口 + JWT 认证 + 用户管理 | Webhook 接口能接收 JSON 并入库；重复 `source_url` 返回 409；无效 API Key 返回 401 |
| 2.3 | 对接 Agent → 后端 | Agent 改写完成后自动 POST 到 FastAPI，数据正确入库且状态为 `PENDING` |

### Week 3: 打造操作台 (前端 Pool 开发)

| Task | 描述 | Definition of Done |
| :--- | :--- | :--- |
| 3.1 | 初始化 React + Vite 工程，实现登录页 + JWT 认证流 | 编辑能登录/登出，token 过期自动刷新 |
| 3.2 | 开发 Dashboard：待审列表页 + 富文本校对详情页 | 列表页能分页展示 PENDING 新闻；详情页左右分栏显示原文对照和 TipTap 编辑器 |
| 3.3 | 联调审核流程 | 跑通"数据入库 → 前端展示 → 编辑修改保存 → 审批/驳回"完整内部闭环 |

### Week 4: 打通分发与全量部署 (Distribution & Launch)

| Task | 描述 | Definition of Done |
| :--- | :--- | :--- |
| 4.1 | 集成 WordPress REST API | 审批通过后自动在 WP 创建文章，包含标题、正文和来源标注，`wp_post_id` 回写数据库 |
| 4.2 | 集成 Twitter API v2 | WP 文章发布后自动发推（标题 + 链接），`tweet_id` 回写数据库 |
| 4.3 | 全链路测试 + 部署 | 全链路（Agent → Pool → WP/Twitter）至少完成 5 条新闻的端到端测试；Dokploy 一键部署所有服务 |

---

## 9. 非功能性需求 (Non-Functional Requirements)

| 维度 | 要求 |
| :--- | :--- |
| **性能** | API 平均响应时间 < 500ms；前端首屏加载 < 3s |
| **可用性** | Agent 定时任务成功率 ≥ 95%；后端 API 可用性 ≥ 99% |
| **可观测性** | 后端接入结构化日志（JSON 格式），关键操作（入库、分发、失败）必须有日志 |
| **数据安全** | 密码 bcrypt 哈希；API Key 环境变量注入；HTTPS 全覆盖 |
| **可维护性** | 代码 lint (Ruff for Python, ESLint for TS)；核心模块单元测试覆盖率 ≥ 60% |

---

## 10. 风险与依赖 (Risks & Dependencies)

| 风险 | 影响 | 缓解措施 |
| :--- | :--- | :--- |
| Hermes Agent 稳定性未知 | Agent 层不可用 | Week 1 充分测试；备选方案：降级为 Playwright 脚本 + cron |
| 目标新闻源反爬升级 | 抓取失败率上升 | Hermes Agent 模拟真实浏览器行为；设置多个备用新闻源 |
| Claude API rate limit / 成本 | 改写延迟或超出预算 | 设置每日调用上限；缓存已改写内容；评估使用 Haiku 降低成本 |
| Twitter API 审核周期 | Week 4 可能拿不到 API 权限 | Week 1 提前申请；备选：先支持 WP，Twitter 作为 P1 后续迭代 |
| WordPress 插件/主题兼容性 | 文章排版异常 | 使用 WP REST API 标准字段；提前在测试站验证 |

### 10.1 依赖

| 依赖 | 说明 |
| :--- | :--- |
| Hetzner VPS | 服务器 IP: 5.78.203.102 |
| Dokploy | 部署与 CI/CD 管理平台 |

---

## 11. 未来扩展 (Future Extensions)

以下功能不在 4 周 MVP 范围内，但架构设计时应预留扩展空间：

- **更多分发渠道：** 微信公众号、Medium、Telegram Channel 等 — 后端分发层采用策略模式，新增渠道只需实现接口
- **多语言支持：** AI 改写时同时生成英文/中文版本
- **AI 质量评分：** 入库时自动评估改写质量，低分自动标记
- **编辑协作：** 多人同时编辑同一篇文章，支持锁定机制
- **数据分析面板：** 发布后追踪 WP 阅读量、Twitter 互动数据

---

## 附录 A：参考资料 (References)

| # | 链接 | 主题 | 说明 |
| :--- | :--- | :--- | :--- |
| 1 | [@Will_Yang_](https://x.com/Will_Yang_/status/2041507883876233312) | Hermes Agent 参考 | Hermes Agent 使用参考 |
| 2 | [@0xkevinhe](https://x.com/0xkevinhe/status/2025781752971809010) | Agent 访问 Twitter | Agent 通过自主操控浏览器访问 Twitter 获取内容的实践参考 |
| 3 | [@gkxspace](https://x.com/gkxspace/status/2025861476439695777) | Agent 访问 Web | Agent 自主浏览网页、提取信息的技术方案参考 |

---

## 附录 B：项目文档索引

| 文档 | 路径 | 说明 |
| :--- | :--- | :--- |
| 系统架构文档 | [docs/architecture.md](docs/architecture.md) | 详细架构图、数据流、部署拓扑 |
| API 接口规范 | [docs/api-spec.md](docs/api-spec.md) | 完整的请求/响应 Schema 和错误码 |
