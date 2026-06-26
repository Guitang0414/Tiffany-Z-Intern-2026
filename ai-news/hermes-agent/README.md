# Hermes Agent

自带 cron 的新闻抓取/改写 worker(deployment-plan §4.2)。
**RSS 发现 → 去重 → Jina 取材 → Claude(网关)改写 → POST Directus(PENDING)**,带 sqlite 防丢重试 + 每日 token 预算 + 限流。

## 架构(§4.2.1 / arch O2:Agent 自带 cron)

```
node-cron(高频 */10 → Lane B 热点 / 低频 每天 → Lane A 深度)
  └─ runLane:
       1. 重发上轮 pending_writeback(防丢)
       2. discover(RSS 源)→ 线索
       3. 每条:dedupe(Directus 查 source_url)→ Jina 取材 → Claude 改写 → 预算扣减 → POST Directus
       4. 失败:改写失败→manual_review;POST 失败→pending_writeback(下轮重发)
```

n8n 不参与发现/触发,只管下游 publish/retry/notify。

## 模块(低耦合)

| 文件 | 职责 |
|---|---|
| `config.ts` | 环境变量 + zod 校验 |
| `sources.ts` | RSS 源清单(9 个 Lane A + Reddit Lane B)+ 发现 |
| `fetcher.ts` | Jina Reader(key + 限流 + 退避) |
| `claude.ts` | 网关改写(合规 prompt:提取事实+原创+本地视角,不翻译) |
| `dedupe.ts` | source_url 查重 |
| `publisher.ts` | Directus POST(service token) |
| `retryStore.ts` | sqlite 防丢/重试/预算持久化 |
| `budget.ts` | 每日 token 上限 |
| `pipeline.ts` | 编排 |
| `scheduler.ts` | node-cron |
| `main.ts` | 入口 |

## 跑

```bash
npm install
cp .env.example .env     # 填 GATEWAY_API_KEY / JINA_API_KEY 等(见下)

npm run once             # 跑一轮(A+B)即退出,测试用
npm run once -- --lane=A # 只跑 Lane A
npm run dev              # 常驻 + 自带 cron(开机先跑一轮)
npm run build && npm start  # 编译后常驻
```

## 配置(`.env`,全部外置、禁止硬编码)

见 `.env.example`。关键:`DIRECTUS_TOKEN` 用 **service 账号 token**(禁用 admin);`GATEWAY_*` = Tailscale Claude 网关;`JINA_API_KEY` = 免费 key(500 RPM);`DAILY_TOKEN_BUDGET` = 每日上限。

## 合规(mentor 定)

提取事实 + 原创分析 + 本地视角**重写**(不翻译、不照搬原文);不抓图;不署名/不附原文链接(`source_url` 仅内部去重);付费墙跳过。

## 部署(Docker)

`Dockerfile`(多阶段:编译 TS + 原生 better-sqlite3)已就绪;`hermes-agent` 服务已加进 `ai-news/docker-compose.prod.yml`(内部 worker,不暴露端口)。

### ⚠️ Claude 网关在 Tailscale 上 —— 容器要能进 tailnet
容器默认不在 tailnet,连不到网关。两种解法:
1. **host 网络(prod 默认)**:OVH 主机已在 tailnet,`network_mode: host` 让容器共享主机 tailnet,`GATEWAY_BASE_URL` 用 **tailnet IP**(`http://100.97.116.16:8317/v1`)。代价:不在 compose 网络里 → Directus 走**公网域名**(`HERMES_DIRECTUS_URL`)。
2. **Tailscale sidecar**:加一个 tailscale 容器(需 `TS_AUTHKEY`),agent `network_mode: service:tailscale`。更干净但要 auth key。

### Dokploy 部署
1. 在 Dokploy Environment 填:`HERMES_DIRECTUS_URL` / `HERMES_DIRECTUS_TOKEN`(service token)/ `GATEWAY_BASE_URL`(tailnet IP)/ `GATEWAY_API_KEY` / `JINA_API_KEY`(见 `.env.prod.example`)。
2. Redeploy → 镜像构建 + agent 随 cron 启动。

### 本地开发
Mac 上的容器进不了 tailnet,所以**本地直接跑原生**(`npm run dev` / `npm run once`),不用 docker-compose 跑 agent。

## 待办

- **Twitter 源**(无 RSS,API 付费 / cookie 抓取,mentor 未定)
- **AI 分类**(taxonomy 未定,现按源默认分类占位)
- 单元测试(各模块 mock 外部依赖)
- 没现成 RSS 的源:KOMO / KIRO7 / seattle.gov / kingcounty.gov(PSBJ 付费墙跳过)
