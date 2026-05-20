> **📝 关于本文档**
>
> 这份是 **High-Level Design (HLD)**,从原 Google Doc 迁移到仓库管理。
>
> 与 [`HL-Intern-Project.md`](../HL-Intern-Project.md) 的关系:
> - `HL-Intern-Project.md` 偏 **spec**(已敲定的技术选型、schema、API、里程碑)
> - 本文档偏 **design**(模块责任拆解、设计思路、未决问题)
>
> 当前状态:**草稿,持续完善中**。Backend Module 已较完整;Frontend / Database / Distribution / DFD / Interface Design / Deployment 等章节待补。
>
> 文档中的标注:
> - `> 🚧 TODO`: 待填写或待细化
> - `> ❓ 思考`: 设计思考点(部分已答 ✓,部分待定)

---

# AI News Curation Agent & Publishing Pool — HLD

## Why?

目前新闻处理流程依赖人工完成,包括新闻的寻找、整理、改写和发布。这种方式存在以下问题:

- 流程耗时较长需要 1-2 小时,影响新闻发布的时效性
- 存在大量重复性工作,造成人力浪费
- 审核与发布流程缺乏统一机制
- 缺少有效的状态追踪与错误处理机制
- 内容深度有限,改写结果容易同质化,缺乏针对目标受众的实用信息与内容相关性

## What?

构建一个由 AI Agent 支持的新闻处理与发布系统,自动化新闻抓取和内容改写流程,并在人工审核与确认后,由系统统一完成多平台发布。同时,需要系统支持对内容及发布状态的追踪,方便后续问题定位与处理。

## How?

### System Architecture

> 🚧 **TODO**: 补充文字版架构描述(目前只有 excalidraw 链接,链接随时可能失效)

**Sequence Diagram**: [Excalidraw 链接](https://excalidraw.com/#json=A4dfJt48xCP9XuqaDKnkv,BQp-6IJr4c3_Oz71EpIp8Q)

**User 角色**: editor

> ❓ **思考**: Admin 让不同编辑看到不同偏好?
> _类编辑只能看到_类文章,article 属于哪些栏目(一对多),编辑和栏目是一对多。

---

### Modules and Components

#### Agent Module

**Responsibility**:
Agent 模块负责从外部的新闻源抓取新闻并且调用 AI 改写,将处理后的新闻数据通过 Webhook 推送到后端。

> ❓ **思考**: 不同栏目对应不同 keyword(例如医疗),做关键词匹配 filter + 语义匹配(意思相关度高就会被筛选到),用 AI prompt 实现。

**Input**:
- source 名称
- seed URLs
- frequency

**Processing**:

Agent 根据抓取频率通过 scheduler 定时触发抓取任务。
- 高频新闻源每 10 分钟轮询一次
- 中频新闻源每天轮询一次

抓取过程中对每个新闻源应用基本的 rate limiting,以避免目标网站的访问限制。

Agent 在抓取和改写过程中会处理以下异常情况:
- 网络请求失败
- 页面解析失败
- AI API 调用失败

对于临时性错误,Agent 会进行(三?)次数重试;如果仍然失败,则记录错误并跳过该任务。

> 🚧 **TODO**: 确认重试次数(目前写的"三?")

Agent 抓取新闻源页面后,提取有效信息,包括:
- 原始标题
- 正文
- 文章链接
- 来源站点
- 发布时间

随后调用 AI API 对标题和正文进行改写,生成给编辑审核的草稿。

> ❓ **思考**: 文章类的用什么类型的数据库存? → **PostgreSQL** ✓

**Output**:

Agent 输出结构化新闻数据,包括:
- 原始新闻链接(`source_url`)
- 原始标题
- 原始正文
- 来源信息(`source_site`)
- 原新闻发布时间(`published_at`)
- AI 改写后的标题
- AI 改写后的正文
- AI 生成的摘要

---

#### Backend Module

**Responsibility**:

Backend 主要负责系统的核心业务逻辑,包括:
- Webhook 的安全接入(鉴权、限流)
- 新闻数据的去重、标准化处理和存储
- 新闻的状态管理和角色权限控制

> ❓ **思考**: 后端用什么框架比较好? → **NestJS** ✓

所有数据统一通过 Backend API 进行读写,**不允许其他模块直接操作数据库**。

Backend 同时为前端提供接口,支持编辑查看新闻、修改内容、标记内容类型,并把修改后的数据存入数据库,同时记录编辑历史和版本信息,方便后续回溯。

在分发方面,Backend 会根据新闻的内容类型,将处理后的内容发送到 WordPress 或 Twitter,并负责和 Telegram 进行通知交互。发布完成后,会把发布结果(比如链接、状态或者失败原因)写回数据库。

对于外部服务调用失败的情况,Backend 会进行重试,同时记录错误日志,方便排查问题,保证整个流程是可追踪、可恢复的。

**Input**:

- **From Agent/webhook**: 抓取到的新闻数据、webhook 鉴权信息
- **From Frontend**: 编辑修改后的 news 信息、`content_type`、editor action、用户权限信息
- **From External Services**: WordPress / Twitter 的 response、Telegram 的 response

**Processing**:

##### Webhook processing

Backend 接受 webhook 请求之后会先验证请求中的认证信息(如 API key 或签名),并进行速率限制控制,增强系统安全性。

> ❓ **思考**: webhook 好还是用 API 好? → **Agent 里用 webhook 合适** ✓

Backend 接收 webhook 传来的数据后,会先对原始新闻数据进行**标准化处理**,包括:
- 清洗文本内容
- 统一字段格式(如标题、来源、时间)
- 规范化 `source_url`

之后根据标准化后的 `source_url` 在数据库中查询该新闻是否已存在:
- **不存在**:创建一条新的 `news_articles` record,并将状态设置为 `PENDING`
- **已存在**:跳过创建,避免重复入库

##### Frontend editing processing

> 🚧 **TODO**: module 之间 interface 怎么交互的?API 长成什么样?主要的 API 列出来。

后端收到前端的 API 请求,解析出用户的身份信息(JWT TOKEN),并根据用户角色进行权限校验,选择这个用户是(editor/admin)。Backend 会根据不同 endpoint 执行对应处理。

**如果用户是 editor**:

1. **获取新闻**:编辑从前端发出获取新闻请求,后端从 DB 读出对应的新闻并发给前端

2. **保存草稿(save)**:如果只是保存草稿,就向 DB 写入修改后的内容和版本号,更新成 `DRAFT` 状态,这步不会触发发布流程

3. **发布(publish)**:
   - 请求中带上最新版本的 edited news 和 `content_type`
   - Backend 收到请求后,会先检查 `content_type` 是否存在,并从用户身份信息中获取 `user_id`
   - 如果 `content_type` 缺失,则返回错误
   - 校验通过后,Backend 会先将 edited news、`content_type` 和 `user_id` 保存到数据库,并更新版本记录,同时把新闻状态更新为 `PUBLISHING`
   - 随后 Backend 根据 `content_type` 选择发布路径:
     - **ARTICLE**: 先发布到 WordPress,成功后保存 WordPress 返回的 `article_url` 和 `post_id`,再将该链接发布到 Twitter
     - **SHORT**: 直接发布到 Twitter
   - 每次外部发布的结果都会写入发布记录表,包括平台、状态、外部 `post_id`、链接或错误原因
   - 最后 Backend 根据发布结果更新新闻的最终状态(`PUBLISHED` 或 `FAILED`)

4. **驳回(reject)**:Backend 更新状态为 `REJECTED`,并记录 rejection reason 到 `news_articles`

> 🚧 **TODO**: User 怎么和 interface 交互?admin / editor 通过前端交互,不同权限和前端有哪些功能交互。Agent 算是一个特殊的 user。

##### Publishing processing

在发布过程中,如果 WordPress 或 Twitter API 调用失败,Backend 会根据 retry 策略进行有限次数重试。每次尝试都会记录到 `publish_logs` 表中,包括平台、状态、错误信息和尝试时间。如果重试后仍然失败,Backend 会将新闻状态更新为 `FAILED`,并保留错误日志,供 admin 后续手动 retry。

##### Notifying processing

Backend 会在以下事件发生时发送 Telegram 通知:
- 新新闻进入系统
- 新闻被拒绝
- 发布成功
- 发布失败

通知内容由 Backend 根据事件类型生成,并通过 Telegram Bot API 发送。发送结果和错误信息会被记录,方便后续排查。

##### Logging

系统记录完整的日志信息,包括抓取处理和发布过程中的状态变化,以便问题排查和系统监控。

**Output**:

- 返回给前端的新闻数据、编辑结果和发布状态
- Webhook 请求的响应
- 发送到 WordPress 和 Twitter 的发布内容
- 发送到 Telegram 的通知消息

---

#### Frontend Module

> 🚧 **TODO**: 待填写。可参考 `permission-flow.md` 中的 Frontend behavior 章节(Sidebar / Dashboard / Available Articles / Article Preview / Article Editing / My Drafts / Published / Failed Publishing 等页面规格)。

---

#### Database Module

**选型**:PostgreSQL 16

**表方案**:采用原版 `HL-Intern-Project.md §4` 的 2 表方案(`news_articles` + `users`),在此基础上补充几个**不引入新功能、纯属补充**的字段(`source_published_at` / `wp_url` / `email` / `updated_at`)以及一个**已沟通确认**的业务字段(`content_type`)。

> 📦 **备注**:早期 6 表设计稿已归档到 [`docs/archive/schema-v2.md`](archive/schema-v2.md),作为 Phase 2 演进参考。`article_versions` / `publish_logs` / `categories` 等扩展暂不引入。

---

##### `news_articles` 表

| 字段名 | 数据类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PK, DEFAULT gen_random_uuid() | 主键 |
| `source_url` | VARCHAR(2048) | UNIQUE, NOT NULL | 原始新闻链接(唯一约束,用于去重) |
| `source_title` | VARCHAR(500) | | 原始新闻标题 |
| `source_content` | TEXT | | 原始新闻正文(供编辑对照) |
| `source_site` | VARCHAR(100) | | 来源站点名称(如 "TechCrunch") |
| ➕ `source_published_at` | TIMESTAMPTZ | | 原文在源站点的发布时间(与 `published_at` 区分) |
| `ai_title` | VARCHAR(500) | NOT NULL | AI 生成的标题(编辑可修改) |
| `ai_content` | TEXT | NOT NULL | AI 生成的正文(编辑可修改) |
| `ai_summary` | VARCHAR(280) | | AI 生成的摘要(用于 Twitter,≤280 字符) |
| ➕ `content_type` | VARCHAR(20) | NOT NULL, DEFAULT 'ARTICLE' | 分发路由:`ARTICLE` 走 WordPress+Twitter,`SHORT` 直发 Twitter(已确认) |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'PENDING' | 见下方"状态机"小节 |
| `rejection_reason` | TEXT | | 驳回原因(`status=REJECTED` 时填写) |
| `reviewed_by` | UUID | FK → users.id | 审核人 |
| `published_at` | TIMESTAMP | | 我们系统发布到外站的时间 |
| `wp_post_id` | INTEGER | | WordPress 文章 ID(发布回执) |
| ➕ `wp_url` | TEXT | | WordPress 完整 URL(前端展示用,光有 ID 不能直接点开) |
| `tweet_id` | VARCHAR(50) | | Twitter 推文 ID(发布回执) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | 入库时间 |
| `updated_at` | TIMESTAMP | DEFAULT NOW(), ON UPDATE | 最后修改时间 |

`➕` 标记的为相对原版**新增**的字段。

---

##### `users` 表

| 字段名 | 数据类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PK | 主键 |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL | 登录用户名 |
| ➕ `email` | VARCHAR(255) | UNIQUE, NOT NULL | 邮箱(密码重置 / 唯一标识) |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt 哈希后的密码 |
| `display_name` | VARCHAR(100) | | 显示名称(UI 展示用,不直接暴露登录名) |
| `role` | VARCHAR(20) | DEFAULT 'editor' | 角色:`editor` / `admin` |
| `created_at` | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| ➕ `updated_at` | TIMESTAMP | DEFAULT NOW(), ON UPDATE | 最后修改时间(标准审计字段) |

---

##### 内容类型分发规则 (`content_type`)

```
content_type = 'ARTICLE':
  → 1. 发布到 WordPress,拿 wp_post_id + wp_url
  → 2. 用 wp_url 发推到 Twitter
  → status: PUBLISHING → PUBLISHED (两者都成功)
  → 失败: PUBLISHING → FAILED

content_type = 'SHORT':
  → 1. 直接发推到 Twitter(用 ai_summary 内容)
  → status: PUBLISHING → PUBLISHED
  → wp_post_id / wp_url 字段保持 NULL
```

---

##### 设计决策


**为什么加 `content_type`?**
MVP 必须支持两种发布类型:正式文章(ARTICLE,走 WP+Twitter)和短讯(SHORT,直发 Twitter)。已确认。

**为什么加 `source_published_at`?**
要区分"原文何时发布"和"我们何时转发布"。同一个字段表达不了两个语义。

**为什么加 `wp_url`?**
前端列表 / 通知里要能直接点开 WordPress 文章,光有 `wp_post_id` 还要拼接 URL。

**为什么加 `email`?**
现代 user 表标配 —— 密码重置、唯一标识、对接外部系统都需要 email。

**为什么加 `users.updated_at`?**
标准审计字段,原版未包含,补上。

---

##### 索引(建议)

```
news_articles:
  - UNIQUE (source_url)        -- 去重
  - INDEX (status)             -- 列表筛选高频
  - INDEX (source_site)        -- 按来源筛选
  - INDEX (content_type)       -- 按类型筛选
  - INDEX (created_at DESC)    -- 最新优先排序

users:
  - UNIQUE (username)
  - UNIQUE (email)
```

> 🚧 **TODO**: 索引清单是初步建议,实际跑起来根据查询模式调整。

---

##### 状态机

> 🚧 **TODO**: 状态机需基于原版 `HL-Intern-Project.md §4.3` 进一步梳理后定稿。**本节暂不下结论。**

---

##### 亟待决定的问题 (Open Schema Decisions)

下面这些是 **schema 层**还没定的问题(只涉及"加什么字段 / 字段类型 / 约束 / 表结构",不涉及 API 或业务逻辑)。按优先级排序:

| # | 问题 | 选项 | 影响 | 优先级 |
|---|---|---|---|---|
| 1 | **状态机的枚举值与流转**:`status` 字段的合法值和合法流转路径 | 需基于原版 `HL-Intern-Project.md §4.3` 进一步梳理后定稿 | 影响后端 publish 流程的状态写入逻辑 | 🔴 高(blocking) |
| 2 | **per-platform 状态字段**:是否在 `news_articles` 加 `wp_status` / `tweet_status` / `wp_error` / `tweet_error` 等列 | A. 不加,只用单一 `status` / B. 加,精确追踪每平台 | "WP 成功 Twitter 失败"场景下,重试时能否避免重复发 WP | 🟡 中 |
| 3 | **并发编辑保护字段**:是否在 `news_articles` 加 `claimed_by` / `claimed_at` 列 | A. 不加(MVP 不做并发保护)/ B. 加,做悲观锁 | 数据竞争风险 vs 表字段数 | 🟡 中 |
| 4 | **`ai_summary` 长度约束**:`VARCHAR(280)` 对中文是否够 | Twitter 限 280 字符,中文按字算 + t.co 链接 23 字符 → 实际安全 ≤ 250 中文字符,可能要改 `VARCHAR(250)` | 列约束 + Twitter 发布失败率 | 🟢 低 |
| 5 | **软删字段**:是否加 `deleted_at` 列 | A. 硬删,不加 / B. 软删,在两张表都加 `deleted_at TIMESTAMPTZ` | 历史数据保留、审计 | 🟢 低(MVP 阶段可后议) |
| 6 | **`updated_by` 字段**:是否在 `news_articles` 加 `updated_by UUID FK→users.id` | A. 不加(`reviewed_by` 够了)/ B. 加,记录最后编辑人 | 审计完整性 | 🟢 低 |

> 💡 **建议处理顺序**:#1(状态机)是 blocking,必须先定;#2-3 本周内决定;#4-6 可以等开始写代码时再决定。

---

#### Distribution Module

> 🚧 **TODO**: 待填写。需说明:
> - WordPress 发布路径(endpoint、认证、字段映射、回执)
> - Twitter 发布路径
> - 按 `content_type` 的分发策略
> - 失败处理与重试

---

### Data Flow Diagrams (DFDs)

> 🚧 **TODO**: 待填写。可参考 [`docs/architecture.md`](architecture.md) 的 Mermaid 图,或继续在 excalidraw 上画。

---

### Interface Design

> 🚧 **TODO**: 待填写。可链接到 [`docs/api-spec.md`](api-spec.md)(已有完整 API 请求/响应 schema),本节只需要列 endpoint 清单 + 简短说明。

---

### Deployment Architecture

> 🚧 **TODO**: 待填写。需说明:
> - Hetzner VPS + Dokploy
> - dev / prod 两套环境
> - 服务拓扑(frontend / backend / db / agent 容器)
> - 环境变量与 secrets 管理
> - HTTPS(Dokploy 自动 Let's Encrypt)
> - CI/CD pipeline

---

## Design Goals

- 将新闻从抓取、改写、审核到发布的整体流程从约 1–2 小时缩短到约 10 分钟,提高时效性
- 支持不同新闻类型(如文章与 breaking news)的差异化处理
- 在 AI 辅助生成内容的基础上保留人工审核机制,确保发布前经过编辑确认
- 建立统一的审核与发布流程,让每条新闻具有清晰状态,方便追踪
- 系统需要满足基本的可用性和性能要求:
  - Agent 定时抓取任务成功率目标为 **≥ 95%**
  - 后端 API 平均响应时间应控制在 **500ms 以内**

---

## Implementation Roadmap

按依赖顺序推进:

1. **ER 图 + 数据库的表** — 确定 schema
2. **设计 API** — 操纵数据的接口
3. **User 表** — 用户与权限交互
4. **设计 frontend** — 编辑工作台
5. **写测试** — 单元测试 + 集成测试

**阶段性目标**:

```
表确定了
  ↓
API 确定了 + migration
  ↓
写一些 code + 部署到 repo
  ↓
CI/CD
  ↓
服务器上了(研究 Dokploy dev/prod)
  ↓
Goal: API 可以调用了(测试可以跑通)
  ↓
Agent: 可以自己调用 API,n tasks frequency,prompt,调用 API → 数据库里有数据了
  ↓
Frontend: user interaction, CRUD, publish
  ↓
Goal: WordPress + Twitter 发布
  ↓
DONE!
```

---

## Version Bump

> 🚧 **TODO**: 此节标题原文是 "Version pump"(疑似 "Version bump"),内容待补 —— 是讲版本管理策略?还是发布 / semver?
