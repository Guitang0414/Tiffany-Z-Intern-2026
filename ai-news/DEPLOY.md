# Dokploy 部署 runbook — Directus 数据层

把 `ai-news` 的 Directus 数据层部署到公司 **OVH VPS + Dokploy + Traefik**。
依据 `docs/deployment-plan.md`。**Phase 1 用本地 admin 账号登录,Phase 2 再接 Authentik OIDC。**

## 0. 先决条件(找 mentor 要)

- [ ] **Dokploy 访问权限**(能登录 Dokploy 面板、创建 service)
- [ ] **域名** —— 给 Directus 用,如 `cms.epochtimesnw.com`(或一个 dev 子域名)
- [ ] 生成的 secrets(`openssl rand -base64 32`):`DIRECTUS_KEY`、`DIRECTUS_SECRET`、`POSTGRES_PASSWORD`、`ADMIN_PASSWORD`
- [ ] (Phase 2,可后补)Authentik 里建一个 OIDC application + client id/secret

## 1. 在 Dokploy 创建 Compose service

- Project:`ai-news`(若无则新建)
- 类型:**Compose**
- Source:本仓库 git,分支 `dev`(或 release 分支)
- **Compose Path**:`ai-news/docker-compose.prod.yml`
- Build:Dokploy 会按 `ai-news/Dockerfile` 构建(自动把 hooks 扩展编译进镜像)

## 2. 配环境变量(Dokploy → Environment)

照 `.env.prod.example` 填。**`ARTICLES_SERVICE_ROLE_IDS` 先留空**(第 6 步再填):

```
DIRECTUS_KEY=...           DIRECTUS_SECRET=...      PUBLIC_URL=https://cms.epochtimesnw.com
POSTGRES_USER=directus     POSTGRES_PASSWORD=...    POSTGRES_DB=directus
ADMIN_EMAIL=...            ADMIN_PASSWORD=...        ARTICLES_SERVICE_ROLE_IDS=
```

## 3. 配域名(Dokploy → Domains)

- Host:`cms.epochtimesnw.com`
- Container Port:**8055**
- HTTPS:开(Let's Encrypt 自动)—— 跟现有 outline/n8n 一致

## 4. 部署

点 **Deploy**。Dokploy 会:构建镜像 → 起 postgres(等 healthy)→ 起 directus。
看日志出现 `Server started` + `Extensions loaded` 即成功。

## 5. 首次登录

浏览器开 `https://cms.epochtimesnw.com`,用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 登录。

## 6. 套用 schema + 权限(关键)

新实例是空的,要把 schema 和权限灌进去。在**能访问该实例**的机器上(本地连公网 URL,或 Dokploy 的 service terminal)跑:

```bash
# A) schema:用快照套用(推荐,§6.3)
#    把 snapshots/20260615-schema.yaml 传进 directus 容器后:
docker exec <directus-container> npx directus schema apply --yes /path/snapshot.yaml
#    或者直接跑脚本:
DIRECTUS_URL=https://cms.epochtimesnw.com ADMIN_EMAIL=... ADMIN_PASSWORD=... node bootstrap/schema.mjs

# B) M2M + 权限
DIRECTUS_URL=https://cms.epochtimesnw.com ADMIN_EMAIL=... ADMIN_PASSWORD=... node bootstrap/add-m2m.mjs
DIRECTUS_URL=https://cms.epochtimesnw.com ADMIN_EMAIL=... ADMIN_PASSWORD=... node bootstrap/permissions.mjs
#    ^ 末尾会打印 SERVICE ROLE ID
```

> ⚠️ `permissions.mjs` 里建的 dev 测试用户(editor@example.com / agent 静态 token)**生产别用** ——
> 真账号 Phase 2 走 Authentik;Agent/n8n 的 token 用真 secret,别用 `svc-static-token-123`。
> 生产可把脚本末尾建测试用户那段删掉再跑。

**拿到 SERVICE ROLE ID 后** → 回 Dokploy Environment 把 `ARTICLES_SERVICE_ROLE_IDS` 填上 → **重新 Deploy**(让 hook 认出机器身份)。

## 7. 验收

对线上实例跑 `ACCEPTANCE.md` 的行为测试(状态机、immutable、去重)。至少确认:
- 非法状态跳转返 422
- editor 改 `ai_*` 被拒
- 同 source_url 去重

## 8. Phase 2:接 Authentik OIDC(mentor 给 app 之后)

1. `docker-compose.prod.yml` 取消注释 `AUTH_AUTHENTIK_*` 那段
2. Dokploy Environment 填 `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_ISSUER_URL` / `DIRECTUS_DEFAULT_ROLE_ID`
3. 重新 Deploy → 编辑用 Authentik 账号 SSO 登录(详见 deployment-plan §5)

---

## 备注

- **prod 与 dev 的区别**:prod 不暴露端口、扩展打进镜像、走 dokploy-network、secret 走 Dokploy。dev 那套(`docker-compose.yml`)只本地用。
- **schema vs 权限的 source of truth**:schema = snapshot;权限 = `bootstrap/permissions.mjs`(快照不含权限)。改了要分别更新。
- **Directus 独占业务 DB**:Hermes Agent / n8n 一律走 Directus REST API,不直连这个 Postgres(§1.2)。
