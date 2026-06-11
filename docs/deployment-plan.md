> **📝 关于本文档**
>
> 这份是 **Deployment Plan**,描述 AI News Curation 项目在公司现有 Dokploy infra 上的具体部署方案。
>
> 与已有文档的关系:
> - [`docs/hld.md`](./hld.md) 是**架构设计**(模块职责 / 数据流 / schema),回答"系统长什么样"
> - 本文档是**部署实施**,回答"在公司这套 Dokploy 上,具体怎么把它跑起来"
> - [`docs/internship-plan.md`](./internship-plan.md) 是**8 周培养计划**,回答"我每周学什么 / 做什么"
>
> **文档约定:**
> - 🟢 **已确认**: 基于 Dokploy 现有 service 截图 / compose 配置直接观察到
> - 🟡 **默认假设**: 等 mentor 回复前我采用的默认方案,回复后可能微调
> - ⏳ **待 mentor 确认**: 没有答案我不能动笔的卡点
>
> 当前状态:**第三轮调整 — GPT review 整合**(2026-06-11)。基于第二轮 (Authentik 模板填充) 后,GPT review 提出 10 条改进意见,本轮全部 address:DB 独占强化 / lifecycle hooks 部署具体化 / Flow 触发严格化 / role mapping MVP 简化 / 取消自动 schema apply / 取消自动 n8n import / 加跨 service 网络 smoke test / 澄清 WP draft vs publish / 补 idempotency 细节 / MVP scope 收敛。剩余开放项见 Section 11。

---

# AI News Curation 项目 — Deployment Plan

## 1. 概览

### 1.1 部署目标

把 HLD 设计的系统(Directus + n8n + Hermes Agent + Authentik 集成)部署到公司现有的 **Hetzner VPS + Dokploy + Traefik** 基础设施上,**遵循公司现有部署惯例**,接入现有的 Authentik SSO,最终发布目标是现有的 wp-seaeet (`www.epochtimesnw.com`)。

### 1.2 设计原则

1. **贴合公司现有惯例**:命名 / 部署方式 / Postgres 模式 / HTTPS 处理 全部跟现有 13 个 service 一致
2. **不破坏现有服务**:新增独立 service,不修改 authentik / wp-seaeet / n8n-with-postgres 等已存在配置
3. **SSO 优先,但接受例外**:能接 Authentik 的接(Directus 支持 OIDC),不能接的接受现状(n8n free 版无 OIDC)
4. **dev / prod 分离**:不混用,避免污染生产 WP
5. **🔴 Directus 独占业务 DB**:
   - Directus 拥有 `articles` / `categories` 等业务 schema 和 CRUD 权限
   - **Hermes Agent / n8n / 未来 NestJS 都不允许直连 Directus 的 Postgres**
   - 所有访问 articles / categories / users 的操作走 **Directus REST API**(读、写、改、查)
   - 这点跟 HLD 的 "PostgreSQL 只 Directus 直接管 schema / CRUD" 一致,**MVP 严格执行**

### 1.3 关键事实(调研结论)

| 事实 | 状态 | 说明 |
|---|---|---|
| 部署平台是 **OVH VPS + Dokploy** | 🟢 | 2026-06-11 SSH 进 `ovh-prod-eet` 确认(IP `51.81.203.38`,Ubuntu 24.04.4 LTS)。⚠️ CLAUDE.md 写的 Hetzner 5.78.203.102 已过时 |
| 反代是 Traefik(`dokploy-network`)| 🟢 | 现有 service compose 都引用此 network |
| HTTPS 由 Dokploy + Let's Encrypt 自动管理 | 🟢 | 现有 service 配置一致 |
| 域名 pattern: `<service>.epochtimesnw.com` | 🟢 | wiki/n8n/www/newsletter/newstts 都遵循 |
| 每个 service **自带一套 PG**(不是 shared) | 🟢 | authentik / outline / n8n / wp / notifuse 都自带 |
| 现有 service 用 Dokploy Compose 类型部署 | 🟢 | 13/13 都是 compose |
| Mentor 自己的 git repo 是 `Guitang0414/*` | 🟢 | News-scraper / news-gateway 都是 |
| 内部协议是 HTTP,Traefik 边缘做 HTTPS termination | 🟢 | n8n 用 `N8N_PROTOCOL=http` |
| 编辑团队用 Telegram 接通知 | 🟢 | HLD 一致,notifuse 是给读者的 newsletter,不冲突 |
| Authentik 已有 Outpost 能力 | 🟢 | worker 挂了 `docker.sock`,可起 Proxy Outpost(MVP 不用,Phase 2 给 n8n 选项)|
| Tailscale tailnet `axiuguitang@gmail.com` 是公司内网 | 🟢 | 加入后可 SSH 到 `ovh-prod-eet`|

⚠️ **HLD 跟实际不符的地方,本文档以实际为准:**
- HLD 写 "shared DB" → 实际是每个 service 自带 PG。**本 plan 按"自带"写**。
- 仍坚持 HLD 的 "Directus 独占业务 DB" 原则(见 1.2 设计原则 5):**Hermes Agent / n8n 不直连 Directus 的 PG**,全部走 Directus REST API。

---

## 2. 现状 / Discovery

### 2.1 新增服务前的 Dokploy 现状

13 个现有 service(2026-06 调研):

| Service | 角色 | 跟本项目关系 |
|---|---|---|
| `authentik` | SSO 身份本体 | 🔴 Directus 要接它做 OIDC 登录 |
| `wp-seaeet` (`www.epochtimesnw.com`) | 生产 WordPress | 🔴 本项目最终发布目标 |
| `n8n-with-postgres` | n8n 工作流引擎(无 OIDC) | 🟡 复用还是新建,⏳ 待 mentor |
| `News-scraper` | 现有抓取 → 直发 WP | ⏳ 跟本项目关系待 mentor 确认 |
| `news-gateway` | 现有 AI + OIDC + Zulip 服务 | ⏳ 跟本项目关系待 mentor 确认 |
| `outline` (`wiki.epochtimesnw.com`) | 内部 wiki | ⚪ 跟项目无直接关系,作为 OIDC 集成参考 |
| `notifuse` (`newsletter.epochtimesnw.com`) | 邮件营销平台 | ⚪ 跟项目无关(Phase 2 可能用于读者推送) |
| `zulip` / `twenty` / `plane` / `calendar` / `seattle-leads` / `uptime-kuma` | 内部工具 | ⚪ 跟项目无关 |

### 2.2 公司部署惯例(本 plan 沿用)

| 维度 | 公司惯例 | 本项目沿用 |
|---|---|---|
| 部署方式 | Dokploy Compose | ✅ Compose |
| Image 版本 | 倾向 pin(outline/wp pin 了),少数 `:latest`(n8n / notifuse)| ✅ **全部 pin**,不用 `:latest` |
| Postgres 模式 | 每个 service 自带一套 | ✅ Directus 自带 PG |
| 域名 | `<service>.epochtimesnw.com` | ✅ 同 |
| HTTPS | Traefik + Let's Encrypt | ✅ 同 |
| 内部协议 | HTTP(Traefik 边缘 termination)| ✅ 同 |
| Network | `dokploy-network` external | ✅ 同 |
| Git 仓库 | `Guitang0414/*` | ⏳ 我项目仓库位置待确认 |
| Auth | 能接 Authentik 的接,n8n / WP 这类不支持的接受现状 | ✅ Directus 接,Agent 用 API token |
| 通知 | 内部 dev → Zulip;编辑团队 → Telegram | ✅ 我项目用 Telegram |

---

## 3. 新增服务清单

本项目需要在 Dokploy 上新增以下 services:

| 序号 | Service 名 | Image | 域名 | 对外暴露 | 备注 |
|---|---|---|---|---|---|
| 1 | `cms` (Directus) | `directus/directus:11.5.x` (pin)| `cms.epochtimesnw.com` | ✅ 编辑访问 | 内置 PG |
| 2 | `hermes-agent` | 自构建(Node 18 / 20) | — | ❌ 内部 worker | 无 PG |

**不新增的服务**(沿用现有):

| Service | 用现成的 | 说明 |
|---|---|---|
| n8n | `n8n-with-postgres` (`n8n.epochtimesnw.com`)| 🟢 mentor 确认复用,workflow 用命名 / tag 隔离(见 4.3) |
| WordPress | `wp-seaeet` (`www.epochtimesnw.com`)| 🟢 mentor 确认是生产目标 |
| Authentik | 现有 | 🟢 给 Directus 配 OIDC Provider 即可 |

> 🟡 **默认假设:Directus 用最新 stable major (11.x)**。实际版本在动手时再 pin,**不会用 `:latest`**(违反 HLD 推荐)。

---

## 4. 服务部署详细规格

### 4.1 Directus

#### 4.1.1 角色

- 内容存储(`articles` / `categories` collection)
- Admin UI(编辑直接在 Data Studio 操作,**MVP 不写自定义前端**)
- 用户权限(RBAC + item-level conditional permissions)
- 版本历史(Revisions 自动)
- Agent ingestion endpoint(`POST /items/articles`)
- Lifecycle hooks + Flows + Insights

#### 4.1.2 Image / 版本

- Image: `directus/directus:11.5.x`(具体 patch 版本 pin 时再定)
- 🟡 **默认 pin 11.5 主版本**,跟随 Directus 官方稳定 release

#### 4.1.3 Compose 草稿

```yaml
services:
  directus:
    image: directus/directus:11.5  # ⚠️ 实际 pin patch 版本
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      # --- Core ---
      KEY: ${DIRECTUS_KEY}                      # 唯一标识
      SECRET: ${DIRECTUS_SECRET}                # JWT signing
      PUBLIC_URL: https://cms.epochtimesnw.com
      
      # --- Database (self-contained PG) ---
      DB_CLIENT: pg
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: ${POSTGRES_DB}
      DB_USER: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      
      # --- Cache ---
      CACHE_ENABLED: 'true'
      CACHE_STORE: memory
      
      # --- Auth: Authentik OIDC ---
      AUTH_PROVIDERS: authentik
      AUTH_AUTHENTIK_DRIVER: openid
      AUTH_AUTHENTIK_CLIENT_ID: ${OIDC_CLIENT_ID}
      AUTH_AUTHENTIK_CLIENT_SECRET: ${OIDC_CLIENT_SECRET}
      AUTH_AUTHENTIK_ISSUER_URL: ${OIDC_ISSUER_URL}
      AUTH_AUTHENTIK_IDENTIFIER_KEY: email
      AUTH_AUTHENTIK_ALLOW_PUBLIC_REGISTRATION: 'false'
      AUTH_AUTHENTIK_DEFAULT_ROLE_ID: ${DIRECTUS_DEFAULT_ROLE_ID}
      AUTH_AUTHENTIK_SCOPE: 'openid profile email'  # ⏳ 是否加 groups 待 mentor,见 5.4
      
      # --- File Storage (local volume) ---
      STORAGE_LOCATIONS: local
      STORAGE_LOCAL_ROOT: ./uploads
      
      # --- Logging ---
      LOG_LEVEL: info
    volumes:
      - directus_uploads:/directus/uploads
      - directus_extensions:/directus/extensions
    expose:
      - "8055"
    networks:
      - default
      - dokploy-network

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - directus_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

volumes:
  directus_uploads:
  directus_extensions:
  directus_pg_data:

networks:
  dokploy-network:
    external: true
```

> ⚠️ **Authentik OIDC 字段名以 Directus 官方文档为准**(`AUTH_AUTHENTIK_*` 是 Directus 约定的 Provider 命名 pattern)。具体可调参数(scope / identifier_key / default_role_id)在实施时按 mentor 给的 Authentik Application 配置对齐。

#### 4.1.4 Domain

- 🟡 默认:`cms.epochtimesnw.com`
- Path: `/`
- Port: 8055
- HTTPS: Let's Encrypt 自动
- 跟现有 outline / n8n 等模式一致

#### 4.1.5 Env Vars(需要在 Dokploy Environment tab 配置)

| 变量 | 用途 | 来源 |
|---|---|---|
| `DIRECTUS_KEY` | Directus 实例唯一 ID | 生成 UUID |
| `DIRECTUS_SECRET` | JWT 签名 secret | 生成 random string |
| `POSTGRES_USER` | PG 用户 | 取 `directus` |
| `POSTGRES_PASSWORD` | PG 密码 | 生成 random string |
| `POSTGRES_DB` | PG 数据库名 | 取 `directus` |
| `OIDC_CLIENT_ID` | Authentik OIDC client id | Authentik 后台生成 |
| `OIDC_CLIENT_SECRET` | Authentik OIDC client secret | Authentik 后台生成 |
| `OIDC_ISSUER_URL` | Authentik issuer URL | `https://auth.epochtimesnw.com/application/o/directus-cms/` |
| `DIRECTUS_DEFAULT_ROLE_ID` | 首次登录用户的默认 role id | Directus 后台创建 `editor` role 后复制 id |

#### 4.1.6 Volumes

- `directus_uploads` — 用户上传的媒体文件
- `directus_extensions` — 自定义 extension(若有)
- `directus_pg_data` — PG 数据

🟡 **MVP 用 local volume**,跟现有 outline / wp / notifuse 等一致。Phase 2 视存储增长再考虑 S3 / R2。

#### 4.1.7 Lifecycle Hooks 部署 / 版本 / 测试

**HLD Section 5 列了一组关键 hooks,本节定具体怎么落地**。

##### Hooks 清单(per HLD)

| Hook | 职责 |
|---|---|
| `articles.beforeCreate` | (1) 规范化 `source_url`;(2) 初始化 `final_title = ai_title` / `final_content = ai_content` / `final_summary = ai_summary`(一次性 INSERT 不要 afterCreate) |
| `articles.beforeUpdate` | **仅当 `status` 字段本身变化时**(`if oldRecord.status !== newRecord.status`)跑下面这些校验:<br>(a) 状态转移合法性(只允许 HLD 状态机定义的 transition)<br>(b) `content_type` 非 NULL 当 `status` 转到 `PUBLISHING`(否则返 422)<br>(c) **仅当 editor 把 `PENDING → PUBLISHING`** 时写 `reviewed_by = currentUser.id`;n8n service account 后续 PATCH per-platform 字段时不要覆盖<br>(d) 阻止 `ai_*` 和 `source_*` 字段修改(field permission 兜底)|
| `articles.afterCreate` | 调 n8n `send-notification` webhook 通知 "新文章入库"(可选) |
| `articles.afterUpdate` | 如果 status 转到 `REJECTED` / `PUBLISHED` / `FAILED`,调 n8n `send-notification`(可选,或者用 Directus Flow 替代,见 4.1.8)|

##### 打包 / 版本控制

```
ai-news-cms/   ← git repo
├── docker-compose.yml
├── extensions/                ← Directus extensions(本项目用 hooks 类型)
│   └── hooks/
│       └── articles-hooks/
│           ├── package.json
│           ├── src/
│           │   ├── before-create.ts
│           │   ├── before-update.ts
│           │   └── after-events.ts
│           └── dist/          ← build 后产物
└── snapshots/                 ← Directus schema 快照(见 6.3)
    └── 20260610-init.yaml
```

- Hook 代码用 **TypeScript** 写(Directus 标准),提交进 git,**build 产物也提交**(简化 Dokploy build)
- Compose 里挂 `extensions/` 到 `/directus/extensions/`(已在 4.1.3 草稿里有)
- Directus 启动时自动扫描 `/directus/extensions/` 加载

##### 测试策略(MVP)

| 测试 | 方式 |
|---|---|
| **Unit test (hook 逻辑)** | Jest / Vitest 测纯函数(如"`source_url` 规范化"、"状态转移合法性判定")|
| **Integration test (Directus runtime)** | dev 环境跑端到端:Agent POST → 看 Directus 里 `final_*` 是否被正确填充;手动改 status 看 hook 是否拒绝非法转移 |
| **Hook 报错处理** | Hook 抛错会阻止当前 CRUD 操作。**MVP 用 try/catch + log,不做 retry**(per HLD)。严重错误用 Directus Activity Log + Telegram 告警 |

#### 4.1.8 Flow 触发器(严格条件)

**关键 Flow:`publish-article`**

| 字段 | 值 |
|---|---|
| Trigger | `articles.status` 字段变化 |
| Condition Filter | `old.status != "PUBLISHING" AND new.status == "PUBLISHING"` |
| Action | POST webhook 到 n8n `/webhook/news/publish` |

🔴 **为什么 condition 这么严格**:n8n 在 publish 过程中会回 PATCH `wp_status` / `tweet_status` / `status` 等字段。**如果 Flow trigger 只看 "status 是否 PUBLISHING",n8n 把 status 再写一遍 PUBLISHING(即使没真变化)会误触发**。加 `old.status != "PUBLISHING"` 确保**只在状态首次进入 PUBLISHING** 时触发,后续 n8n 回写不会重复触发 publish。

**其他 Flow**(可选,Phase 2):
- `articles.status → REJECTED` → 触发 send-notification webhook
- `articles 新创建` → 触发 send-notification webhook(也可以放 afterCreate hook 里,二选一)

---

### 4.2 Hermes Agent

> 🔴 **重要约束**:Hermes Agent **不允许直连 Directus 的 Postgres**。所有 articles / categories 操作走 Directus REST API。

#### 4.2.1 角色

- 定时(由 n8n cron 触发)抓取新闻源
- AI 分类(关键词 + Claude 语义匹配)
- 调 Claude API 改写
- POST 到 Directus `/items/articles` 入库

#### 4.2.2 Image

- 自构建:Node 18 LTS + TypeScript(per HLD `Hermes Agent` 是 Node 服务)
- 🟡 Dockerfile 在 Hermes Agent 仓库里

#### 4.2.3 Compose 草稿

```yaml
services:
  hermes-agent:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      # --- Claude API ---
      ANTHROPIC_API_KEY: ${CLAUDE_API_KEY}
      CLAUDE_MODEL: claude-haiku-4-5-20251001  # 默认 Haiku, 改写任务足够
      
      # --- Directus ingestion ---
      DIRECTUS_URL: https://cms.epochtimesnw.com
      DIRECTUS_API_TOKEN: ${DIRECTUS_AGENT_TOKEN}  # 在 Directus 后台为 Agent 创建的 API token
      
      # --- Misc ---
      LOG_LEVEL: info
      NODE_ENV: production
      TZ: America/Los_Angeles
    expose:
      - "8090"   # 内部 trigger endpoint, 给 n8n cron 调用
    networks:
      - default
      - dokploy-network

networks:
  dokploy-network:
    external: true
```

#### 4.2.4 Domain

❌ **不对外暴露 domain**(跟 News-scraper 一致),只在 `dokploy-network` 内由 n8n 调用 `http://hermes-agent:8090/trigger`。

#### 4.2.5 Env Vars

| 变量 | 用途 | 来源 |
|---|---|---|
| `CLAUDE_API_KEY` | Claude API key | ⏳ mentor 提供(待确认是否公司账号 + cost cap)|
| `CLAUDE_MODEL` | 用哪个 Claude model | 🟡 默认 Haiku 4.5,后续可调 Sonnet |
| `DIRECTUS_URL` | Directus 入口 URL | `https://cms.epochtimesnw.com` |
| `DIRECTUS_AGENT_TOKEN` | Directus API token | Directus 后台为 Agent 创建一个 service account |

#### 4.2.6 Volumes

- 无持久化(stateless worker,跟 News-scraper 一致)

---

### 4.3 n8n(复用现有 `n8n-with-postgres`)

🟢 **mentor 已确认(2026-06-10):复用现有 `n8n-with-postgres`(`n8n.epochtimesnw.com`),不另起实例**。本项目所有 workflow 加进现有 n8n,用命名 / tag 规范隔离。

> 🔴 **重要约束**:n8n workflow **不允许直连 Directus 的 Postgres**(包括 articles / categories 等业务表)。所有读写走 **Directus REST API**(`https://cms.epochtimesnw.com/items/articles`),用 Directus API token 鉴权。n8n 自己内部的 workflow execution data 用现有 `n8n-with-postgres` 的 PG(那是 n8n 自己的存储,跟业务无关)。

#### 4.3.1 职责(per HLD)

- `publish-article` workflow(收 Directus Flow webhook → 发 WP / Twitter)
- `retry-publish` workflow
- `send-notification` workflow(发 Telegram)
- cron 触发 Hermes Agent

#### 4.3.2 Workflow 组织规范(避免跟现有项目冲突)

| 维度 | 规范 | 例 |
|---|---|---|
| **Workflow 命名** | 全部以 `news/` 前缀 | `news/publish-article` / `news/send-notification` |
| **Tag** | 所有 workflow 加 tag `news-curation` | n8n UI 可一键 filter 看本项目所有 workflow |
| **Credentials** | 本项目用独立 credentials,命名带 `news/` 前缀 | `news/directus-api-token` / `news/wp-app-password` / `news/telegram-bot` / `news/claude-api` |
| **Webhook paths** | 本项目 webhook 路径以 `/news/` 开头 | `https://n8n.epochtimesnw.com/webhook/news/publish` |
| **Static data** | 不污染全局 static data,workflow-scoped | — |

#### 4.3.3 Auth 处理(n8n 自身,不是 SSO)

🟢 mentor 默认不接 Authentik(没选 Outpost forward-auth):
- n8n 维持现有 **email / password auth**(跟现状一致)
- 编辑**不直接访问 n8n**(他们用 Directus Data Studio)
- workflow 自动跑,无人值守
- 调试时 admin 用现有 n8n 账号登录(管理员账号 mentor 提供)
- 📌 **接受"n8n 是 SSO 体系外的例外"** —— 跟 WordPress 一致

#### 4.3.4 共享实例的风险与缓解

| 风险 | 缓解 |
|---|---|
| 我项目 workflow 误改 / 删除其他项目 workflow | 命名前缀 + tag 让范围明确;admin 操作前先 filter by tag |
| credentials 列表混乱 | credentials 也加 `news/` 前缀,跟其他项目 visually 区分 |
| n8n 资源用尽(执行队列 / DB)| n8n 共享实例的固有限制,Phase 2 视情况评估单独部署 |
| 版本升级影响本项目 | 升级时跟 mentor 协调,跑回归测试 |

#### 4.3.5 Compose / 部署

🟢 **本项目不新部署 n8n service**。MVP 工作:
- 在现有 n8n UI **手动创建 / 编辑** 我项目的 workflow(`news/publish-article` 等)
- 在现有 n8n credentials store 里**手动添加**我项目的 credentials(`news/directus-api-token` 等)
- 创建完每个 workflow,**export JSON 提交进 git** 作为备份 + 文档(`ai-news-n8n-workflows/workflows/*.json`)
- ⚠️ **MVP 不做自动 import**:从 JSON 自动 import 到现有 n8n 涉及 credentials 重新绑定 / 跨实例引用问题,工作量大,容易踩坑。**Phase 2 再做自动化**

#### 4.3.6 Publish workflow Idempotency(per HLD)

n8n 调外站 API 前,**必须先查 Directus 当前文章状态**,避免重复发布:

```
publish-article workflow 入口:
  GET https://cms.epochtimesnw.com/items/articles/{id}
       ↓
  读 wp_status / tweet_status / content_type
       ↓
  按下面规则跳过 / 重发:
    if wp_status == 'PUBLISHED':  跳过 WP(避免重复发文章到 WP)
    if tweet_status == 'PUBLISHED': 跳过 Twitter(避免重复推文)
    if content_type == 'SHORT': 跳过 WP(SHORT 不发 WP)
    其他:正常发
```

retry-publish workflow 同样规则:**只重试 FAILED 的平台,PUBLISHED 的跳过**。

**实现要点**:
- workflow 第一个 node 调 Directus GET 拿当前状态
- 用 If / Switch node 按状态决定走 ARTICLE / SHORT / skip 分支
- 永远不假定"PUBLISHING 一定要走完所有发布步骤" —— 因为 retry 时一些步骤已经成功

📌 严格防止 **WordPress 重复发同一篇 + Twitter 重复推同一条**。

---

## 5. Authentik SSO 集成

🟢 **2026-06-11:通过 SSH 进入生产服务器(`ovh-prod-eet`),从现有 outline 服务的 container env 中读到了真实 OIDC 配置作为模板**。本节基于这些真实值给 Directus 集成定方案。

### 5.0 公司 Authentik 集成 pattern(从 outline 反推)

| 维度 | 实际值 |
|---|---|
| Authentik 公网 URL | `https://auth.epochtimesnw.com` |
| OIDC issuer base | `https://auth.epochtimesnw.com/application/o/` |
| 每个 application 的 issuer | `https://auth.epochtimesnw.com/application/o/<slug>/` (例: outline 的是 `.../o/outline/`) |
| Tenant-global endpoints | `/application/o/authorize/` / `/token/` / `/userinfo/` |
| Per-app endpoint | `/application/o/<slug>/end-session/` |
| outline 实际申请 scopes | `openid profile email` ⚠️ **没申请 `groups`** |
| Username claim | `email` |
| Display name (SSO 按钮) | `Authentik` |
| Client ID 格式 | 40 字符随机串(Authentik 自动生成)|

### 5.1 集成范围

| Service | 集成方式 | 说明 |
|---|---|---|
| Directus | OIDC(原生支持)| 🟢 **主要集成** —— 编辑通过 Authentik SSO 登录 Data Studio |
| n8n (现有实例)| 不集成 | 🟢 mentor 维持现状,n8n 自带 email/password auth |
| Hermes Agent | 不集成 | service-to-service 用 Directus API token |
| WordPress | 不集成 | 跟现有 wp-seaeet 一致,n8n 用 `WP_APP_PASSWORD` 调 REST |

### 5.2 Authentik 配置步骤(给 Directus)

#### Step 1:创建 OIDC Provider

在 Authentik 后台(`https://auth.epochtimesnw.com/if/admin/`):
- Provider 类型:**OAuth2 / OpenID Provider**
- 命名:🟡 默认 `directus-cms-oidc`
- Client type:**Confidential**(Directus 有 backend,可以保管 client_secret)
- Client ID / Client Secret:Authentik 自动生成(填到 Dokploy env)
- **Redirect URIs**:`https://cms.epochtimesnw.com/auth/login/authentik/callback`
  > ⚠️ 实际路径以 Directus 11 的 OIDC callback 为准,实施时查 Directus 文档确认。Directus 一般是 `/auth/login/<provider-name>/callback`,跟 outline 用的 `<URL>/auth/oidc.callback` 不同。
- Signing Key:用现有 service(outline)同款 key,跟公司惯例对齐
- **Scopes**:`openid profile email`(跟 outline 一致)+ ⏳ **是否加 `groups`?见 5.4**

#### Step 2:创建 Application

- 命名:🟡 默认 `Directus CMS`
- **Slug:`directus-cms`** —— 决定 issuer URL = `https://auth.epochtimesnw.com/application/o/directus-cms/`
- Provider:绑定上面创建的 OIDC Provider
- Launch URL:`https://cms.epochtimesnw.com`

#### Step 3:Directus 端的 env vars

填入 Dokploy → cms service → Environment tab:

```
OIDC_CLIENT_ID         = <Authentik Step 1 自动生成的 client_id>
OIDC_CLIENT_SECRET     = <Authentik Step 1 自动生成的 client_secret>
OIDC_ISSUER_URL        = https://auth.epochtimesnw.com/application/o/directus-cms/
DIRECTUS_DEFAULT_ROLE_ID = <Directus 后台创建 editor role 后的 id>
```

💡 **用 issuer URL 而不是逐个 endpoint URL**:Directus 支持 OIDC discovery,只要给 issuer URL,会自动从 `<issuer>/.well-known/openid-configuration` 拿到所有 endpoint。比 outline 用的"每个 endpoint 一个 env"省事得多。

### 5.3 Group / Role mapping

#### 🟢 MVP 方案(简化,不依赖 `groups` scope)

**已观察**:outline 实际只申请 `openid profile email`,**没用 `groups`**。这暗示公司 Authentik 可能还没标配 group claim mapping。MVP **不依赖 groups,避免实施阻塞**:

1. **所有 Authentik SSO 登录的用户,Directus role 默认 = `editor`**
   - 通过 `AUTH_AUTHENTIK_DEFAULT_ROLE_ID` env 实现
2. **`admin` role 在 Directus 后台手动指派**
   - mentor 或现有 admin 进 Data Studio → Users → 把某用户 role 改成 `admin`
   - 频率很低(只有少数 admin),不构成负担
3. Directus env `OIDC_SCOPES = openid profile email`(跟 outline 一致,**不改公司默认配置**)

**为什么这样设计**:
- 不需要 mentor 在 Authentik 后台加 group Property Mapping → **避免改公司共用配置**
- 跟现有 service(outline)风格一致 → 降低集成风险
- 实施零阻塞,**Q4 的答案不影响 MVP 推进**

#### 🟡 Phase 2:升级到 group-based 自动 mapping

当满足下列任一时考虑升级:
- mentor 在 Authentik 后台加了 group Property Mapping(可能为别的项目)
- 编辑人数增长,手动指派 admin 变烦
- 引入第二种角色需要细粒度权限

升级动作(per HLD 原设计):
- 在 Authentik 创建 group:`news-editor` / `news-admin`
- Directus env 改 `OIDC_SCOPES = openid profile email groups`
- 配 Directus OIDC role mapping:某 group → 某 role

### 5.4 ⏳ Phase 2 跟 mentor 确认:groups scope 可行性(不阻塞 MVP)

MVP 已用 5.3 方案绕开 `groups`,**这条不阻塞**。但 Phase 2 升级时想知道:

- (a) Authentik 后台是否有现成的 group Property Mapping?(outline 没用,可能只是没用,不代表不能用)
- (b) 如果没有,Phase 2 时加一个的工作量大约多少?

mentor 方便时答一下,**不答也没关系**。

📌 **Category 分配(`assigned_categories`)不从 Authentik 同步**,是 Directus 本地 admin 操作,per HLD 5 章节。

### 5.5 SSO 登录流程(走通后的样子)

```
编辑在浏览器访问 https://cms.epochtimesnw.com
   ↓ Directus 检测未登录
   ↓ 跳转到 https://auth.epochtimesnw.com/application/o/authorize/?client_id=<id>&...
编辑输入 Authentik 账号 + MFA
   ↓ Authentik 验证通过
   ↓ 跳回 https://cms.epochtimesnw.com/auth/login/authentik/callback?code=xxx
Directus 后端拿 code POST 到 https://auth.epochtimesnw.com/application/o/token/
   ↓ 拿到 access_token + id_token
Directus GET https://auth.epochtimesnw.com/application/o/userinfo/  
   ↓ 拿到 email / profile / (groups 待确认) 等 claims
   ↓ 首次登录时按 email/group 创建 directus_users 记录, 写入对应 role
   ↓ 设置 Directus session cookie
编辑进入 Data Studio, 看自己 category 下的 PENDING 文章

(登出时浏览器调 https://auth.epochtimesnw.com/application/o/directus-cms/end-session/)
```

---

## 6. CI/CD

### 6.1 流程(沿用公司惯例)

```
开发推 git push 到 main
   ↓
Dokploy 监听 git webhook (Autodeploy: ON)
   ↓
Dokploy 拉代码 → docker compose up -d --build → 替换 container
```

### 6.2 各 service 的 CI/CD

| Service | 部署源 | Autodeploy 触发 | 备注 |
|---|---|---|---|
| `cms` (Directus) | git repo 含 `docker-compose.yml` + `extensions/`(已 build 的 hooks)| push 到 main | content type / flow 配置变化需手动 sync(见 6.3)|
| `hermes-agent` | git repo 含 Dockerfile + 源码 | push 到 main | Dokploy 自动 build image |
| n8n workflows | git repo 含 `workflows/*.json` 作**备份和文档** | ❌ **不**自动 import | MVP 手动在 n8n UI 创建,见 4.3.5 |

### 6.3 Directus 配置同步(MVP 手动 apply)

Directus 的 content type / flow 配置不是代码,是 schema(存在 Directus 自己的 DB 里)。MVP 同步策略:

```bash
# dev 端改了 schema 之后, 本地命令:
npx directus schema snapshot ./snapshots/$(date +%Y%m%d-<desc>).yaml

# commit 进 git
git add snapshots/
git commit -m "schema: <描述变更>"
git push

# ⚠️ prod 端: 不自动 apply, mentor / 你手动操作
ssh ubuntu@ovh-prod-eet
sudo docker exec production-cms-xxx-directus-1 \
     npx directus schema apply ./snapshots/<latest>.yaml --yes
```

🔴 **MVP 不自动 apply 到 prod**:
- 每次 git push 自动 apply 风险大(schema migration 可能 break 生产数据)
- 改为**人工触发**:开发改 schema → 出 snapshot 入 git → 手动 SSH 上 prod 跑 apply
- 流程稳定后(Phase 2)再考虑自动化

🟡 **dev 端可以自动 apply**(Dokploy entrypoint 加一行 `directus schema apply`),因为 dev 数据可弃。

### 6.4 n8n workflow 同步(MVP 手动管理)

🔴 **MVP 不做自动 import**。流程:

```
1. 开发在现有 n8n UI 里手动创建 / 改 workflow
2. workflow 改完, n8n UI 点 Export → 下载 JSON
3. 把 JSON commit 进 git repo (ai-news-n8n-workflows/workflows/*.json)
   - 作用: 备份 + 文档 + 版本历史, 不用于自动部署
4. 出问题 / 误删时, 用 git 里的 JSON 在 n8n UI 手动 Import 恢复
```

**为什么不自动 import**:
- n8n CLI 的 `import:workflow` 涉及 credentials 重新绑定(每次 import 后 credentials 引用会变),容易踩坑
- 现有 n8n 是共享实例,自动覆盖其他项目 workflow 风险大
- Phase 2 可以视稳定性引入自动 import + credentials provider 解耦

🟡 同上,提交 JSON 入 git。

### 6.5 Git 仓库

⏳ **代码仓库位置待 mentor 确认**(Q10,目前已撤回,默认按下面写):

🟡 **默认假设:每个 service 一个独立 repo,放 `Guitang0414/ai-news-*` 命名空间**:
- `Guitang0414/ai-news-cms`(Directus compose + schema snapshots)
- `Guitang0414/ai-news-agent`(Hermes Agent 源码)
- `Guitang0414/ai-news-n8n`(n8n compose + workflows JSON)

mentor 如有别的 org / 命名约定,实施时改。

---

## 7. 环境分离(dev / prod)

### 7.1 环境策略

🟡 **MVP 默认两套环境:dev + prod**(per HLD 11 章节)

| 环境 | 部署在 | 域名 | 用途 |
|---|---|---|---|
| dev | Dokploy 同 VPS,但独立 service + 独立 PG | `cms-dev.epochtimesnw.com` | 联调 + 测试 schema 改动 |
| prod | Dokploy | `cms.epochtimesnw.com` | 正式使用 |

⚠️ **禁止 dev 和 prod 共享数据库**。

### 7.2 dev/prod WP 测试策略

🟢 **mentor 确认(2026-06-10):"wp 就部署在 wp-seaeet 这个 service 里(在 dokploy 里有)域名是 www.epochtimesnw.com"** → 生产目标 = wp-seaeet。

🟡 **mentor 没明确说 dev / 测试用什么 WP**。`HL-Intern-Project.md` 风险表提到"提前在测试站验证",暗示可能有测试 WP,但 Dokploy 里没看到。**先按下面默认推进,后续如发现需要 staging 再问 mentor**:

| 阶段 | WP 目标 |
|---|---|
| 本地开发 | 本地起独立 WP container 自测 |
| dev 联调(部署在 Dokploy 上) | 同上 —— dev 环境带一个 `wp-dev` 服务 |
| Phase 2 真发布测试 | 切到 wp-seaeet,**测试文章以 draft 状态**留 WP 后台,人工清理 |
| Phase 3 prod | wp-seaeet 直接发布 |

**dev / 本地 WP compose 草稿**:

```yaml
services:
  wp-dev:
    image: wordpress:6.9-php8.3-apache  # 跟生产同版本
    # ... (类似 wp-seaeet 的配置, 但独立 DB + 独立 domain)
```

### 7.3 环境变量分离

- dev 一套 env(Dokploy 配置)
- prod 另一套 env
- 两套环境的 `OIDC_CLIENT_ID` / `CLIENT_SECRET` 在 Authentik 创建**两个不同的 OIDC Provider + Application**(`directus-cms-dev` + `directus-cms-prod`)

---

## 8. Secrets 管理

### 8.1 存储

🟡 **MVP 用 Dokploy Environment tab 直接存**(跟现有 13 个 service 一致)。

| Secret 类别 | 存放位置 | 谁有权限 |
|---|---|---|
| Directus `KEY` / `SECRET` | Dokploy env | admin |
| Postgres password | Dokploy env | admin |
| Authentik client_secret | Dokploy env | admin |
| Claude API key | Dokploy env | admin |
| WP_APP_PASSWORD | Dokploy env(给 n8n 用)| admin |
| Telegram bot token | Dokploy env(给 n8n 用)| admin |
| Directus API token(给 Agent)| Dokploy env(给 Hermes 用)| admin |

### 8.2 Rotation 策略

🟡 默认:暂无定期 rotation,出问题(泄露 / 离职)再换。Phase 2 可加。

### 8.3 不进 git 的清单

- 任何 `*_SECRET` / `*_PASSWORD` / `*_TOKEN` / `*_KEY` 都**不能 commit**
- `.env.example` 进 git(只放变量名,不放值)
- 实际 `.env` 在 `.gitignore`

---

## 9. Rollout 计划

### 9.0 MVP scope vs Phase 2(明确边界,避免 plan 膨胀)

#### 🟢 MVP 必须做(证明 chain 跑通的最小集)

> 目标:**Agent → Directus → n8n → WP(live 或 draft) → Telegram 通知** 完整跑通

| 项 | MVP 状态 |
|---|---|
| Directus 部署 + Authentik SSO(默认 editor + 手动 admin) | ✅ |
| Hermes Agent 部署 + Claude 改写 + POST 到 Directus | ✅ |
| n8n 复用现有实例 + 3 个核心 workflow(publish / retry / notify) | ✅ |
| WordPress 发布到 wp-seaeet(live 默认,draft 仅冒烟测试用) | ✅ |
| Telegram 通知 | ✅ |
| Directus lifecycle hooks(beforeCreate / beforeUpdate)| ✅ |
| Directus Flow 触发 publish workflow(condition 严格 see 4.1.8)| ✅ |
| n8n idempotency(按 wp_status/tweet_status 跳过已 PUBLISHED 平台,see 4.3.6)| ✅ |
| dev WP 用本地 container,prod WP 用 wp-seaeet | ✅ |
| 手动 import n8n workflow / 手动 apply Directus schema 到 prod | ✅ |

#### 🟡 Phase 2 改进(MVP 之后再做)

| 项 | 推到 Phase 2 的原因 |
|---|---|
| **Authentik `groups` scope + 自动 role mapping** | outline 没用,公司 Authentik 可能没配,实施风险大;MVP 用"默认 editor + 手动 admin"绕开 |
| **自动 `directus schema apply` 到 prod** | schema migration 风险大,先人工 apply 稳定流程 |
| **自动 import n8n workflow JSON** | credentials 重新绑定问题复杂,先手动管理 |
| **专用 staging WP**(如果开发中发现需要)| MVP 用本地 container 自测够用,需求出现再扩 |
| **Twitter 集成**(如果 Vision 的 "待建立" 状态延续)| 账号未建则推迟,只做 WordPress |
| **Monitoring / Logging dashboard(uptime-kuma 接入)** | 可观测性强化 |
| **定时自动 retry FAILED 文章 / 完整 retry 历史表** | per HLD 也是 Phase 2 |
| **Categories 多对多 + Agent 自动分类多 category** | MVP 一对一 |
| **`groups` scope 升级路径 + Outpost forward-auth 给 n8n** | MVP n8n 维持现状 |
| **Backup / Restore 策略** | MVP 跟现有 service 一致 |

### 9.1 阶段划分(跟 internship-plan.md Week 7-8 对齐)

```
Phase 1: dev 部署 + 联调  (Week 7 上半)
  - Directus dev 起来 + Authentik OIDC 接通
  - Hermes Agent dev 跑通 1 篇文章入库
  - 现有 n8n 跑通 `news/publish-article` workflow (发本地 dev WP)
  - lifecycle hooks 验证
  - 跨 service 网络连通验证 (见 10.0)

Phase 2: prod 部署 + 冒烟测试  (Week 7 下半)
  - prod 端 Directus + Agent 部署
  - 跑 1 篇真新闻全链路, workflow 临时切到 WP draft 避免污染生产
  - 测完恢复 workflow 默认 live publish
  - schema apply 到 prod (手动 SSH 上去跑)

Phase 3: 切量上线  (Week 8)
  - 编辑账号:Authentik 已有就直接登; 没账号的 mentor 给开
  - 首批编辑首登后, 手动指派一名 admin
  - category 初始化 + 给编辑分 assigned_categories
  - Agent cron 真启动 (n8n 触发, 频率按需配)
  - 监控 + 告警接通 Telegram
```

### 9.2 News-scraper / news-gateway 处置

🟢 **mentor 已确认(2026-06-10):"这俩和我们目前的项目都没关系,你不用理的"**。

→ 本项目按 HLD 独立部署,**不需要处理 News-scraper 和 news-gateway**(不下线、不复用、不承接)。先前关于"替代 / 平行 / 复用"的猜测全部撤销。

---

## 10. 验证 / Smoke Test

每个 phase 结束时跑下面这些验证。

### 10.0 部署前必跑:跨 service 网络连通

🔴 **重要前提**:Hermes Agent 在自己的 compose project,n8n 在另一个 compose project(`production-n8nwithpostgres-*`),它们能不能通过 service 名互相找到,取决于 Dokploy 的 `dokploy-network` 行为。**MVP 部署前必须验证**:

```bash
# 在 ovh-prod-eet 上:

# (a) 找现有 n8n 容器
sudo docker ps --filter "name=n8n" --format "{{.Names}}"

# (b) 进去测试能不能 ping / curl Hermes Agent (假设 Hermes 已部署)
sudo docker exec <n8n-container> sh -c "curl -sS http://hermes-agent:8090/health"

# 预期: 返回 200 / OK
# 如果 connection refused / could not resolve:
#   → 跨 project 在 dokploy-network 上不能解析 service 名
#   → 需要给 Hermes Agent compose 加 network alias:
#         services:
#           hermes-agent:
#             networks:
#               dokploy-network:
#                 aliases:
#                   - hermes-agent
#   → 或用 Hermes Agent container 的内部 IP(查 `docker inspect`)
#   → 或暴露一个内网 domain(通过 Traefik 但不开公网)
```

📌 **如果验证失败**,plan 里 Section 4.2 / 4.3 关于 n8n → Hermes Agent 的访问方式需要调整。

### 10.1 Phase 1 验收(dev 环境联调)

**部署验证**:
- [ ] `https://cms-dev.epochtimesnw.com` 能打开 Directus Data Studio
- [ ] 点 Login 跳转到 Authentik,登录后跳回 Directus 且能进 Data Studio
- [ ] **新 SSO 用户首次登录后,Directus 里 role 默认是 `editor`**(per MVP 默认方案 5.3)
- [ ] **manual 升级 admin**:在 Directus 后台手动把某用户 role 改成 `admin`,该用户重新登录后能看到 admin 工具栏

**Agent → Directus**:
- [ ] Hermes Agent 容器内 `curl -H "Authorization: Bearer <token>" cms-dev.epochtimesnw.com/items/categories` 200 返回
- [ ] Agent 跑一轮:抓 1 篇文章 → 调 Claude 改写 → POST 到 Directus → 在 Data Studio 看见
- [ ] 文章 `final_*` 字段已被 `beforeCreate` hook 初始化(等于 `ai_*`)

**n8n → Directus / WP**:
- [ ] Directus Flow 在 `status: PENDING → PUBLISHING` 时触发(改成别的字段不触发)
- [ ] 现有 n8n 收到 `/webhook/news/publish` 时触发 `news/publish-article` workflow
- [ ] workflow 先 GET Directus 查 wp_status/tweet_status 后才发(idempotency,见 4.3.6)
- [ ] **workflow 发 dev WP 成功,WP 文章状态 = `publish`**(MVP 默认 live publish,不是 draft)
- [ ] Directus 里 `wp_status=PUBLISHED, wp_post_id, wp_url, wp_published_at` 全部回写

**Lifecycle hooks**:
- [ ] beforeCreate hook 跑过(看 Directus log 有"final_* initialized from ai_*"记录)
- [ ] beforeUpdate hook 拒绝非法状态转移(如 `PENDING → PUBLISHED` 直跳应该返 422)
- [ ] reviewed_by 字段只在 editor 改 `PENDING → PUBLISHING` 那次被写

### 10.2 Phase 2 验收(prod 环境冒烟测试)

**重要约束**:这一步在生产 wp-seaeet 上测,需要确保**不污染生产**。

- [ ] 跑 1 篇真新闻全链路,但 workflow 临时改成发 **WP draft** 状态(不是 publish)—— 见下方说明
- [ ] 测试文章在 wp-seaeet 后台以 draft 出现,**编辑 / mentor 确认后手动删**
- [ ] 整个链路(Agent → Directus → n8n → WP draft → Telegram)所有日志正常
- [ ] 切回 workflow 默认行为(`status: publish`),准备 Phase 3

📌 **关于 WP draft vs publish**(澄清 HLD 跟本节的差别):
- **HLD 生产 workflow 默认**:`WORDPRESS publish` API 调用时 `status=publish`(文章立即上线)
- **本 phase 2 冒烟测试**:**临时**改 workflow 用 `status=draft`,**只为了不污染生产**,测完恢复
- 如果 mentor 想长期用 "AI 生成 → 编辑 Directus 审 → 发 WP 也先 draft → 再人工 publish" 的双重审核流程,**这是 HLD 没明确说的产品决定,要专门讨论**,不是 plan 默认

### 10.3 Phase 3 验收(真实上线)

- [ ] editor 真审过 1 篇文章,流程: 在 Directus 审核 → 点 Publish → 文章 live 出现在 epochtimesnw.com
- [ ] 发布失败(模拟 Twitter 故障 / WP API down)时,Directus 里 status=FAILED + `*_error` 写入 + Telegram 收到告警
- [ ] retry workflow 能跳过已 PUBLISHED 的平台,只重发 FAILED 的(idempotency 验证)
- [ ] 重复入库:Agent 抓到同一 source_url 第二次,Directus 返 422 conflict,Agent 静默跳过

---

## 11. Open Questions / mentor 确认追踪

| # | 问题 | 影响 plan 什么 | 状态 |
|---|---|---|---|
| Q1 | News-scraper / news-gateway 跟项目什么关系 | 9.2 处置方案 | ✅ mentor 答(2026-06-10):**无关,忽略** |
| Q2 | n8n 复用还是新建 + 接入方式 | 4.3 n8n 部署方案 | ✅ mentor 答(2026-06-10):**复用现有 n8n,不接 SSO** |
| Q3 续 | dev / staging WP 怎么办 | 7.2 dev WP 方案 | 🟡 mentor 部分答(确认 prod=wp-seaeet),dev 用本地 container 默认推进 |
| — | Authentik 后台访问权限 | 5 Authentik 集成细节 | 🟡 web admin 因 "external user" 进不去,**已通过 SSH + docker exec 拿到现有配置作模板**(2026-06-11)。仍待 mentor 升 internal 方便后续维护 |
| Q4 | Authentik `groups` scope + Property Mapping 是否可用 | 5.3 / 5.4 role 映射方案 | 🟢 **不再阻塞**:MVP 改用"默认 editor + 手动 admin"方案(per GPT review 建议),groups 推到 Phase 2;mentor 方便时再确认 Phase 2 可行性 |
| — | Twitter 账号(Vision 写"待建立")| Twitter 分发部分可能推迟到 Phase 2 | 🟡 待 mentor 确认是否 MVP 先只做 WP |

---

## 12. 待补全(后续迭代)

mentor 答完核心 3 个问题 + SSH 调研之后,剩下要做的:

- [x] ~~Section 5 — Authentik OIDC pattern~~(2026-06-11 通过 SSH 拿到 outline 实际 OIDC 配置,推断 Directus 集成方案,见 5.0-5.5)
- [ ] **Section 5.4 — 跟 mentor 确认 `groups` scope 是否可用**(决定 role 映射走 group 还是 fallback)
- [ ] **Section 4.3 — n8n workflow 实际命名 list**(动手时填入具体 workflow 名 / tag / credential 名)
- [x] ~~Section 9.2 — News-scraper 处置~~(已 close:无关)
- [x] ~~Section 4.3 — n8n 复用/新建~~(已 close:复用)
- [ ] **Section 7.2 — 如果开发中发现需要 staging WP,再回头问 mentor**
- [ ] **Twitter 集成范围确认**(MVP 是否包含,还是推迟到 Phase 2)
- [ ] Monitoring / Logging 策略(Phase 2 考虑接 uptime-kuma)
- [ ] Backup 策略(运维层面,本 plan 不展开,跟现有 service 一致)

---

## 附录 A:命名汇总

为避免命名冲突,本项目使用的命名:

| 类型 | 命名 |
|---|---|
| Dokploy service | `cms`(Directus)/ `hermes-agent`(n8n 沿用现有,不新增)|
| Domain | `cms.epochtimesnw.com` / `cms-dev.epochtimesnw.com` |
| Authentik OIDC Provider | `directus-cms` / `directus-cms-dev` |
| Authentik Application | `Directus CMS` / `Directus CMS Dev` |
| Authentik group | `news-editor` / `news-admin` |
| Directus role | `editor` / `admin` |
| n8n workflow | `news/publish-article` / `news/retry-publish` / `news/send-notification` |
| n8n tag | `news-curation`(本项目所有 workflow 加这个 tag)|
| n8n credentials | `news/directus-api-token` / `news/wp-app-password` / `news/telegram-bot` / `news/claude-api` |
| n8n webhook paths | `/news/publish` / `/news/retry` / `/news/notify`(避免跟现有 workflow 冲突)|
| Git repo(默认)| `Guitang0414/ai-news-cms`(Directus 配置)/ `ai-news-agent`(Hermes Agent)/ `ai-news-n8n-workflows`(workflow JSON)|

## 附录 B:参考文档

- [`docs/hld.md`](./hld.md) — 系统架构设计
- [`docs/api-spec.md`](./api-spec.md) — API 详细 schema
- [`docs/internship-plan.md`](./internship-plan.md) — 8 周培养计划
- [Dokploy docs](https://docs.dokploy.com/) — 部署平台
- [Authentik docs](https://docs.goauthentik.io/) — SSO 配置
- [Directus docs](https://docs.directus.io/) — 尤其是 SSO Configuration
- [n8n docs](https://docs.n8n.io/) — 工作流
