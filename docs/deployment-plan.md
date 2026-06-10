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
> 当前状态:**mentor 回复后第一轮调整**(2026-06-10)。3 个核心问题已 close 2 个(Q1/Q2),Q3 续部分 close。剩余开放项见 Section 11 / 12。

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

### 1.3 关键事实(调研结论)

| 事实 | 状态 | 说明 |
|---|---|---|
| 部署平台是 Hetzner VPS + Dokploy | 🟢 | per CLAUDE.md + 现场观察 |
| 反代是 Traefik(`dokploy-network`)| 🟢 | 现有 service compose 都引用此 network |
| HTTPS 由 Dokploy + Let's Encrypt 自动管理 | 🟢 | 现有 service 配置一致 |
| 域名 pattern: `<service>.epochtimesnw.com` | 🟢 | wiki/n8n/www/newsletter/newstts 都遵循 |
| 每个 service **自带一套 PG**(不是 shared) | 🟢 | authentik / outline / n8n / wp / notifuse 都自带 |
| 现有 service 用 Dokploy Compose 类型部署 | 🟢 | 13/13 都是 compose |
| Mentor 自己的 git repo 是 `Guitang0414/*` | 🟢 | News-scraper / news-gateway 都是 |
| 内部协议是 HTTP,Traefik 边缘做 HTTPS termination | 🟢 | n8n 用 `N8N_PROTOCOL=http` |
| 编辑团队用 Telegram 接通知 | 🟢 | HLD 一致,notifuse 是给读者的 newsletter,不冲突 |
| Authentik 已有 Outpost 能力 | 🟢 | worker 挂了 `docker.sock`,可起 Proxy Outpost |

⚠️ **HLD 跟实际不符的地方,本文档以实际为准:**
- HLD 写 "shared DB" → 实际是每个 service 自带 PG。本 plan 按"自带"写。

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
      AUTH_AUTHENTIK_SCOPE: 'openid email profile groups'
      
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
| `OIDC_ISSUER_URL` | Authentik issuer URL | 形如 `https://<authentik-domain>/application/o/<app-slug>/` |
| `DIRECTUS_DEFAULT_ROLE_ID` | 首次登录用户的默认 role id | Directus 后台创建 `editor` role 后复制 id |

#### 4.1.6 Volumes

- `directus_uploads` — 用户上传的媒体文件
- `directus_extensions` — 自定义 extension(若有)
- `directus_pg_data` — PG 数据

🟡 **MVP 用 local volume**,跟现有 outline / wp / notifuse 等一致。Phase 2 视存储增长再考虑 S3 / R2。

---

### 4.2 Hermes Agent

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

🟢 **本项目不新部署 n8n service**。只:
- 在现有 n8n UI 里 import 我项目的 workflow JSON(从 git repo 导入)
- 在现有 n8n credentials store 里加我项目的 credentials

---

## 5. Authentik SSO 集成

🟢 **mentor 已确认(2026-06-10):Tiffany 用 Tailscale 已可访问 Authentik 后台**,看现有 OIDC Provider 配置作为模板。本节具体字段值待截图调研后补全(Tiffany 待办)。

### 5.1 集成范围

| Service | 集成方式 | 说明 |
|---|---|---|
| Directus | OIDC(原生支持)| 🟢 **主要集成** —— 编辑通过 Authentik SSO 登录 Data Studio |
| n8n (现有实例)| 不集成 | 🟢 mentor 维持现状,n8n 自带 email/password auth |
| Hermes Agent | 不集成 | service-to-service 用 Directus API token |
| WordPress | 不集成 | 跟现有 wp-seaeet 一致,n8n 用 `WP_APP_PASSWORD` 调 REST |

### 5.2 Authentik 配置步骤(给 Directus)

#### Step 1:创建 OIDC Provider

在 Authentik 后台:
- Provider 类型:**OAuth2 / OpenID Provider**
- 命名:🟡 默认 `directus-oidc`(跟 news-gateway 等命名风格对齐)
- Client type:**Confidential**(Directus 有 backend,可以保管 client_secret)
- Client ID / Client Secret:Authentik 自动生成(填到 Dokploy env)
- Redirect URIs:`https://cms.epochtimesnw.com/auth/login/authentik/callback`
- Signing Key:用默认 / 公司常用的那把
- Scopes:`openid email profile groups`

> ⏳ **redirect URI 路径以 Directus 11 实际 callback URL 为准**,实施时查 Directus 文档确认。

#### Step 2:创建 Application

- 命名:🟡 默认 `Directus CMS`
- Slug:`directus-cms`
- Provider:绑定上面创建的 OIDC Provider
- Launch URL:`https://cms.epochtimesnw.com`

#### Step 3:配置 Group / Role mapping

- 在 Authentik 创建 group:
  - 🟡 默认 `news-editor`
  - 🟡 默认 `news-admin`
- 在 Directus 创建对应 role(`editor` / `admin`)
- 用 Authentik **Property Mapping** 把 group → Directus role 映射:
  - `news-editor` group 成员 → Directus `editor` role
  - `news-admin` group 成员 → Directus `admin` role

> 📌 **Category 分配(`assigned_categories`)不从 Authentik 同步**,是 Directus 本地 admin 操作,per HLD 5 章节。

### 5.3 SSO 登录流程(走通后的样子)

```
编辑在浏览器访问 https://cms.epochtimesnw.com
   ↓ Directus 检测未登录
   ↓ 跳转到 https://<authentik-domain>/.../o/authorize/?client_id=...
编辑输入 Authentik 账号 + MFA
   ↓ Authentik 验证通过
   ↓ 跳回 cms.epochtimesnw.com/auth/login/authentik/callback?code=xxx
Directus 后端拿 code POST 到 Authentik /token endpoint
   ↓ 拿到 access_token + id_token
Directus 解析 id_token 拿 email / groups 等 claims
   ↓ 首次登录时按 group 创建 directus_users 记录, 写入对应 role
   ↓ 设置 Directus session cookie
编辑进入 Data Studio, 看自己 category 下的 PENDING 文章
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
| `cms` (Directus) | git repo 含 `docker-compose.yml`(只有 compose,不 build 代码)| push 到 main | content type / hooks / flows 改了要重新 sync |
| `hermes-agent` | git repo 含 Dockerfile + 源码 | push 到 main | Dokploy 自动 build image |
| n8n workflows | git repo 含 `workflows/*.json`(workflow 导出)| 部署时 import 到现有 n8n | 不部署 n8n service,只 import workflow JSON |

### 6.3 Directus 配置同步

Directus 的 content type / lifecycle hook / flow 配置不是代码,是 Directus 自己存数据库里的 schema。同步策略:

```bash
# dev 改了 schema 之后
npx directus schema snapshot ./snapshots/$(date +%Y%m%d).yaml

# git commit + push,Dokploy 重新部署时 entrypoint 跑:
npx directus schema apply ./snapshots/latest.yaml
```

🟡 **默认方案**:每个 release 一个 snapshot,提交进 git。Phase 2 可考虑用 Directus 官方的 `extensions` migration 机制。

### 6.4 n8n workflow 同步

```bash
# n8n UI 里改完 workflow 后, export JSON
# commit 到 git repo 的 workflows/ 目录
# Dokploy 部署时 import (n8n CLI: n8n import:workflow --input=workflows/)
```

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

### 9.1 阶段划分(跟 internship-plan.md Week 7-8 对齐)

```
Phase 1: dev 部署 + 联调  (Week 7 上半)
  - Directus dev 起来
  - Authentik dev OIDC 接通
  - Hermes Agent dev 跑通 1 篇文章入库
  - 现有 n8n 跑通 `news/publish-article` workflow (发 dev WP)

Phase 2: prod 部署 + 真发布测试  (Week 7 下半)
  - prod Directus + n8n + Agent 全起来
  - Authentik prod OIDC 接通
  - 用 1 篇真新闻走完全链路,发 prod WP draft 状态人工审

Phase 3: 切量上线  (Week 8)
  - 编辑账号在 Authentik 创建 + group 配置
  - category 初始化 + 编辑 assignment
  - Agent cron 真启动 (n8n 触发, 每 10 min 抓一次)
  - 监控 + 告警接通 Telegram
```

### 9.2 News-scraper / news-gateway 处置

🟢 **mentor 已确认(2026-06-10):"这俩和我们目前的项目都没关系,你不用理的"**。

→ 本项目按 HLD 独立部署,**不需要处理 News-scraper 和 news-gateway**(不下线、不复用、不承接)。先前关于"替代 / 平行 / 复用"的猜测全部撤销。

---

## 10. 验证 / Smoke Test

每个 phase 结束时跑下面这些验证:

### 10.1 Phase 1 验收

- [ ] `https://cms-dev.epochtimesnw.com` 能打开 Directus Data Studio
- [ ] 点 Login 跳转到 Authentik,登录后跳回 Directus 且能进 admin UI
- [ ] Authentik 里 `news-editor` group 成员登录后,role 是 `editor`
- [ ] Hermes Agent 容器内 curl Directus `/items/categories` 200 返回
- [ ] Agent 跑一轮:抓 1 篇文章 → 调 Claude 改写 → POST 到 Directus → 在 Data Studio 看见
- [ ] 现有 n8n 收到 Directus Flow webhook(`/webhook/news/publish`)时触发 `news/publish-article` workflow
- [ ] workflow 发 dev WP 成功,Directus 里 `wp_status=PUBLISHED`

### 10.2 Phase 2 验收

- 同上,但所有都对 prod 端点
- 测试文章在 wp-seaeet 上以 draft 状态出现,人工删除

### 10.3 Phase 3 验收

- editor 真审过 1 篇文章,正常发布到 prod
- 发布失败(模拟 Twitter 故障)时,Telegram 收到告警
- retry 能成功重发失败的平台

---

## 11. Open Questions / mentor 确认追踪

| # | 问题 | 影响 plan 什么 | 状态 |
|---|---|---|---|
| Q1 | News-scraper / news-gateway 跟项目什么关系 | 9.2 处置方案 | ✅ mentor 答(2026-06-10):**无关,忽略** |
| Q2 | n8n 复用还是新建 + 接入方式 | 4.3 n8n 部署方案 | ✅ mentor 答(2026-06-10):**复用现有 n8n,不接 SSO** |
| Q3 续 | dev / staging WP 怎么办 | 7.2 dev WP 方案 | 🟡 mentor 部分答(确认 prod=wp-seaeet),dev 用本地 container 默认推进 |
| — | Authentik 后台访问权限 | 5 Authentik 集成细节 | ✅ mentor 确认(2026-06-10):Tailscale 已可看,Tiffany 调研中 |
| — | Twitter 账号(Vision 写"待建立")| Twitter 分发部分可能推迟到 Phase 2 | 🟡 待 mentor 确认是否 MVP 先只做 WP |

---

## 12. 待补全(后续迭代)

mentor 答完核心 3 个问题后,剩下要做的:

- [ ] **Section 5 — Authentik OIDC Provider 配置具体字段值**(Tiffany 看 Authentik 后台截图后,Claude 补全 redirect URI / scope / property mapping / signing key 等具体值)
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
