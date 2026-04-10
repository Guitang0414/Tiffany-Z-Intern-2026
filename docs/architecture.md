# 系统架构文档 (System Architecture)

> 本文档为 [HL-Intern-Project.md](../HL-Intern-Project.md) 的配套架构文档，使用 Mermaid 图表描述系统各层的关系与数据流。

---

## 1. 系统架构总览

```mermaid
graph TB
    subgraph sandbox["🔒 Agent Sandbox (Hetzner VPS 隔离容器)"]
        OC["Hermes Agent"]
        Claude["Claude API"]
    end

    subgraph core["☁️ Core Backend (Hetzner VPS / Dokploy)"]
        API["FastAPI Server"]
        Auth["JWT Auth<br/>Middleware"]
        Dist["Distribution<br/>Service"]
    end

    subgraph db["💾 Database (PostgreSQL)"]
        PG[("PostgreSQL")]
    end

    subgraph frontend["🖥️ Frontend (Dokploy)"]
        UI["React + Vite<br/>Dashboard"]
    end

    subgraph external["🌐 External Services"]
        TG["Telegram Bot"]
        WP["WordPress"]
        TW["Twitter / X"]
    end

    subgraph sources["📰 News Sources"]
        NS1["TechCrunch"]
        NS2["The Verge"]
        NS3["..."]
    end

    %% Agent 层数据流
    NS1 & NS2 & NS3 -->|"抓取"| OC
    OC -->|"改写请求"| Claude
    Claude -->|"改写结果"| OC
    OC -->|"Webhook POST<br/>(X-Agent-Key)"| API
    OC -->|"通知"| TG

    %% 后端内部
    API --> Auth
    API --> PG
    API --> Dist

    %% 前端交互
    UI -->|"REST API<br/>(JWT)"| API

    %% 分发
    Dist -->|"REST API"| WP
    Dist -->|"API v2"| TW
    Dist -->|"通知"| TG

    %% 样式
    style sandbox fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style core fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    style db fill:#f3e5f5,stroke:#6a1b9a,stroke-width:2px
    style frontend fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    style external fill:#fce4ec,stroke:#c62828,stroke-width:2px
    style sources fill:#f5f5f5,stroke:#616161,stroke-width:1px
```

### 架构要点

1. **Agent 层物理隔离：** Agent 运行在 Hetzner VPS 的隔离容器中，仅通过 HTTP Webhook 与核心后端通信，无法直连数据库
2. **核心后端集中处理：** FastAPI 作为唯一的数据入口和出口，统一管理认证、业务逻辑和第三方分发
3. **前端部署：** React SPA 通过 Dokploy 部署，通过 HTTPS 调用 API
4. **分发层解耦：** WordPress 和 Twitter 的分发相互独立，单个失败不影响另一个

---

## 2. 核心数据流：新闻从抓取到发布

```mermaid
sequenceDiagram
    participant NS as 📰 新闻源
    participant Agent as 🤖 Hermes Agent
    participant Claude as 🧠 Claude API
    participant TG as 💬 Telegram
    participant API as ⚙️ FastAPI
    participant DB as 💾 PostgreSQL
    participant UI as 🖥️ 编辑工作台
    participant WP as 📝 WordPress
    participant TW as 🐦 Twitter

    Note over Agent: 定时唤醒 (HEARTBEAT)

    rect rgb(255, 243, 224)
        Note right of NS: Phase 1: 抓取与改写
        Agent->>NS: Playwright 抓取页面
        NS-->>Agent: HTML 内容
        Agent->>Claude: 发送原文 + 改写 Prompt
        Claude-->>Agent: 返回改写后的标题/正文/摘要
    end

    rect rgb(227, 242, 253)
        Note right of Agent: Phase 2: 入库与通知
        Agent->>API: POST /webhook/incoming-news<br/>(X-Agent-Key 认证)
        API->>API: 校验 API Key
        API->>DB: INSERT news_articles (status=PENDING)
        DB-->>API: 201 Created
        API-->>Agent: 201 + article_id
        Agent->>TG: 发送通知「新线索入库」
    end

    rect rgb(232, 245, 233)
        Note right of UI: Phase 3: 人工审核
        UI->>API: GET /news?status=PENDING (JWT)
        API->>DB: SELECT WHERE status=PENDING
        DB-->>API: 返回待审列表
        API-->>UI: JSON 列表
        UI->>UI: 编辑查看原文对照，修改 AI 内容
        UI->>API: PUT /news/{id} (保存修改)
        API->>DB: UPDATE ai_title, ai_content
        UI->>API: POST /news/{id}/publish (审批通过)
        API->>DB: UPDATE status=PUBLISHING
    end

    rect rgb(252, 228, 236)
        Note right of API: Phase 4: 自动分发
        API->>WP: POST /wp-json/wp/v2/posts
        WP-->>API: 200 + wp_post_id
        API->>DB: UPDATE wp_post_id
        API->>TW: POST /2/tweets (标题+链接)
        TW-->>API: 200 + tweet_id
        API->>DB: UPDATE tweet_id, status=PUBLISHED
        API->>TG: 发送通知「文章已发布」
    end
```

---

## 3. 状态机详解

```mermaid
stateDiagram-v2
    [*] --> PENDING: Agent 推送入库

    PENDING --> PUBLISHING: 编辑审批通过
    PENDING --> REJECTED: 编辑驳回

    PUBLISHING --> PUBLISHED: 全部分发成功
    PUBLISHING --> FAILED: 任一分发失败

    FAILED --> PUBLISHING: 管理员手动重试

    REJECTED --> PENDING: 重新提交 (可选)

    PUBLISHED --> [*]

    note right of PENDING
        编辑可在此状态下
        修改标题和正文
    end note

    note right of FAILED
        记录具体失败原因
        (WP 失败 / Twitter 失败)
    end note
```

### 状态说明

| 状态 | 含义 | 允许的操作 |
| :--- | :--- | :--- |
| `PENDING` | 待审核 | 编辑修改、审批、驳回 |
| `PUBLISHING` | 分发中 | 等待（后端自动处理） |
| `PUBLISHED` | 已发布 | 只读 |
| `FAILED` | 分发失败 | 管理员重试 |
| `REJECTED` | 已驳回 | 可重新提交至 PENDING |

---

## 4. ER 数据模型

```mermaid
erDiagram
    users {
        uuid id PK
        varchar username UK "登录用户名"
        varchar password_hash "bcrypt 哈希"
        varchar display_name "显示名称"
        varchar role "editor / admin"
        timestamp created_at
    }

    news_articles {
        uuid id PK
        varchar source_url UK "原始链接 (去重)"
        varchar source_title "原始标题"
        text source_content "原始正文"
        varchar source_site "来源站点"
        varchar ai_title "AI 标题"
        text ai_content "AI 正文"
        varchar ai_summary "AI 摘要 (≤280字符)"
        varchar status "PENDING/PUBLISHING/PUBLISHED/FAILED/REJECTED"
        text rejection_reason "驳回原因"
        uuid reviewed_by FK "审核人"
        timestamp published_at "发布时间"
        integer wp_post_id "WordPress 回执"
        varchar tweet_id "Twitter 回执"
        timestamp created_at
        timestamp updated_at
    }

    users ||--o{ news_articles : "审核"
```

---

## 5. 部署拓扑

```mermaid
graph LR
    subgraph internet["🌐 Internet"]
        Editor["编辑 (浏览器)"]
        NewsWeb["新闻网站"]
    end

    subgraph hetzner["☁️ Hetzner VPS (5.78.203.102) — Dokploy"]
        subgraph frontend_deploy["Frontend"]
            ReactSPA["React SPA"]
        end
        subgraph backend_deploy["Backend"]
            FastAPI["FastAPI<br/>Container"]
        end
        subgraph db_deploy["Database"]
            PG[("PostgreSQL")]
        end
        subgraph agent_deploy["🔒 Agent (隔离容器)"]
            Agent["Hermes Agent"]
        end
        FastAPI -->|"内部连接"| PG
    end

    Editor -->|"HTTPS"| ReactSPA
    ReactSPA -->|"API calls"| FastAPI
    Agent -->|"Webhook HTTPS"| FastAPI
    Agent -->|"HTTP/HTTPS"| NewsWeb

    style hetzner fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    style agent_deploy fill:#fff3e0,stroke:#e65100,stroke-width:2px
```

### 部署细节

| 组件 | 平台 | 配置 |
| :--- | :--- | :--- |
| FastAPI | Hetzner VPS (Dokploy) | 容器化部署 |
| PostgreSQL | Hetzner VPS (Dokploy) | 本地数据库实例 |
| React Frontend | Hetzner VPS (Dokploy) | 自动 CI/CD，绑定 GitHub 仓库 |
| Hermes Agent | Hetzner VPS (Dokploy 隔离容器) | 受限环境运行 |

---

## 6. 安全边界

```mermaid
graph TB
    subgraph trust_none["❌ Zero Trust Zone"]
        Agent["Hermes Agent"]
    end

    subgraph trust_low["⚠️ Low Trust Zone"]
        Frontend["React Frontend"]
    end

    subgraph trust_high["✅ High Trust Zone"]
        API["FastAPI"]
        DB[("PostgreSQL")]
    end

    subgraph external["🌐 External"]
        WP["WordPress"]
        TW["Twitter"]
        TG["Telegram"]
    end

    Agent -->|"API Key<br/>Rate Limited"| API
    Frontend -->|"JWT<br/>CORS 白名单"| API
    API -->|"内网直连<br/>参数化查询"| DB
    API -->|"API Credentials<br/>(env vars)"| WP & TW & TG

    style trust_none fill:#ffebee,stroke:#c62828,stroke-width:2px
    style trust_low fill:#fff8e1,stroke:#f57f17,stroke-width:2px
    style trust_high fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
```

### 信任边界说明

- **Zero Trust (Agent):** Agent 被视为不可信组件，所有来自 Agent 的数据均需校验。API Key 可随时轮换。
- **Low Trust (Frontend):** 前端用户已通过 JWT 认证，但仍需后端做权限校验和输入清洗。
- **High Trust (API ↔ DB):** 内网通信，使用 ORM 参数化查询，信任度最高。
- **External Services:** 使用各平台官方 API，凭证通过环境变量管理，不硬编码。
