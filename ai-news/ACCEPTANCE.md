# 验收清单 — Directus 数据层

这是 `ai-news/` 这部分(本地 dev 实例 + schema + articles hooks)的验收标准(goal)。
review / 部署到 Dokploy 前对着勾;每条要求都注明**出处**(来自 HLD / deployment-plan)和**怎么验**。

> 要求来自 `docs/hld.md` + `docs/deployment-plan.md`(权威设计)。本清单只是把文档翻译成可勾选的条目。
> 如果某条跟文档对不上,以文档为准 —— 那说明代码要改,或这条要改。

**状态图例**
- `✅ 单测` — 已被单元测试覆盖,跑 `npm test` 即确认
- `🟡 待真机` — 逻辑已写,**必须起本地 Directus 跑起来才能确认**(这部分该你亲手验)
- `⏳ 未跑` — 还没在你机器上执行过
- `⭐ 待拍板` — 设计决策,不是对错题,需要你/mentor 决定

---

## A. 本地 dev compose (`docker-compose.yml`)

- [ ] `⏳ 未跑` `docker compose up -d` 后两个容器都 running/healthy,浏览器进 `http://localhost:8055` 能看到登录页
  - 验:`docker compose ps` + 打开浏览器
- [ ] `✅ 对账` 内容符合 deployment-plan §4.1.3 的 **dev 意图** + §1.2 原则5「Directus 独占业务 DB」
  - 验:对照文档。注意这是 **dev 版**(暴露端口/明文密码/挂源码),Dokploy 生产版另出,差异是故意的

## B. Schema(`articles` + `categories` 两个 collection)

- [ ] `🟡 待真机` `articles` 每个字段(名 / 类型 / 可空 / 唯一 / 长度)逐项 == **HLD `articles` collection 表**
  - 验:在 Data Studio 手动建字段时逐条对照 HLD 那张表(手动建 = 同时练 mentor 要的手动配置 + review 字段对不对)
- [ ] `✅ 对账` 三字段族 `source_* / ai_* / final_*` + per-platform `wp_* / tweet_*` 全部存在
  - 验:对照 HLD §字段族
- [ ] `⭐ 待拍板` 补充字段 `articles.manual_intervention_required` 和 `categories.wp_category_id`(deployment-plan §4.3.6)
  - 验:对照 §4.3.6 —— **确认这两个字段确实该加**(HLD ER 图里没有,deploy 才加的)
- [ ] `🟡 待真机` 关系正确:`articles.category_id → categories`、`articles.reviewed_by → directus_users`
  - 验:Data Studio 里看 relation 配置
- [ ] `✅ 对账` `status` 默认值 `PENDING`,枚举 5 值(PENDING/PUBLISHING/PUBLISHED/FAILED/REJECTED,无 DRAFT)
  - 验:对照 HLD §状态机
- [ ] `🟡 待真机` `source_url` 有 UNIQUE 约束(去重靠它)
  - 验:同一 `source_url` 塞两次,第二次应被拒(422)

## C. Hooks(`articles.beforeCreate` / `beforeUpdate`)

- [ ] `✅ 单测` 清洗 `source_url` 的 5 条规则(lowercase host / 强制 https / 去 fragment / 去 utm_·fbclid·gclid·ref_·aff_ / 去尾斜杠)— deployment-plan §4.3.6 C2
  - 验:`npm test`(normalize-url.test.ts)+ 真机塞带 `?utm_source=x` 的同一篇,应只进一篇
- [ ] `🟡 待真机` 进库时 `final_* = ai_*`(beforeCreate 一次性写入)— HLD §Lifecycle Hooks
  - 验:真机 POST 一篇,看 `final_title/final_content/final_summary` 是否自动 = `ai_*`
- [ ] `🟡 待真机` 状态守卫**仅在 `status` 字段真的变化时**才触发 — deployment-plan §4.1.7
  - 验:用 service token PATCH 只改 `wp_status`(不动 status)应不报错;非法 status 跳转应报错
- [ ] `✅ 单测` actor-aware 合法转移表 == deployment-plan §4.1.7(editor / admin / service 各自能做的转移)
  - 验:`npm test`(state-machine.test.ts)
- [ ] `🟡 待真机` 转 `PUBLISHING` 前 `content_type` 必须非空,缺失返 422 — HLD + §4.1.7(a)
  - 验:真机不选 content_type 直接发布,应被拒
- [ ] `🟡 待真机` `reviewed_by` 仅人工审核(PENDING→PUBLISHING)时写;service account PATCH 携带 `reviewed_by` 被 strip — §4.1.7(b)(c)
  - 验:真机:编辑审核通过后 `reviewed_by` = 该编辑;之后 n8n(service)PATCH 不应改动它
- [ ] `⭐ 待拍板` `reviewed_by` 是否也记 **admin** 审核(文档字面只写 editor,我扩到了 admin)
  - 见 `state-machine.ts` 里的注释 —— 你定:editor-only 还是 editor+admin

---

## 行为测试("故意搞坏",起本地实例后做)

这些是 🟡 条目的真机验法,拦住=对,没拦=抓到 bug:

1. 用 **editor** 身份把文章从 `PENDING` 直接改成 `PUBLISHED` → **应被拒**(必经 PUBLISHING)
2. 不选 `content_type` 就把文章改成 `PUBLISHING` → **应返 422**
3. 同一 `source_url`(一个带 `?utm_source=x` 一个不带)塞两次 → **应只进一篇**
4. 用 **service** token 把文章从 `PENDING` 改 `PUBLISHING`(机器不能审核)→ **应被拒**
5. 新建一篇文章后查 `final_*` → **应自动等于 `ai_*`**

---

## 谁验哪部分(避免"自己改卷")

- `✅` 逻辑层:跑 `npm test` 自己确认绿
- `🟡` 真机层:**你**起本地 Directus 亲手验(我不能替你宣布达标 —— 我写的我说对,等于自评)
- `⭐` 决策层:**你 / mentor** 拍板
