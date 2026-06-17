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

- [x] `✅ 单测+真机` 清洗 `source_url` 的 5 条规则(lowercase host / 强制 https / 去 fragment / 去 utm_·fbclid·gclid·ref_·aff_ / 去尾斜杠)— deployment-plan §4.3.6 C2 — *真机:带 utm 的同篇 url 被去重拦下(Value has to be unique)*
  - 验:`npm test`(normalize-url.test.ts)+ 真机塞带 `?utm_source=x` 的同一篇,应只进一篇
- [x] `✅ 已验` 进库时 `final_* = ai_*`(beforeCreate 一次性写入)— HLD §Lifecycle Hooks
  - 验:真机 POST 一篇,`final_title` 自动 = `ai_title`(AI改写标题)✓
- [ ] `🟡 待真机` 状态守卫**仅在 `status` 字段真的变化时**才触发 — deployment-plan §4.1.7
  - 验:用 service token PATCH 只改 `wp_status`(不动 status)应不报错;非法 status 跳转应报错
- [x] `✅ 单测+真机` actor-aware 合法转移表 == deployment-plan §4.1.7(editor / admin / service 各自能做的转移)
  - 验:`npm test` + 真机 admin 试 PENDING→PUBLISHED 被拒(422, ARTICLE_VALIDATION_FAILED)。editor/service 身份待 #1 角色后补验
- [x] `✅ 已验(422)` 转 `PUBLISHING` 前 `content_type` 必须非空,缺失返 422 — HLD + §4.1.7(a)
  - 验:真机不选 content_type 直接发布 → 返 **422**(修复前是 500,review 抓出并已修)
- [ ] `🟡 待真机` `reviewed_by` 仅人工审核(PENDING→PUBLISHING)时写;service account PATCH 携带 `reviewed_by` 被 strip — §4.1.7(b)(c)
  - 验:真机:编辑审核通过后 `reviewed_by` = 该编辑;之后 n8n(service)PATCH 不应改动它
- [ ] `⭐ 待拍板` `reviewed_by` 是否也记 **admin** 审核(文档字面只写 editor,我扩到了 admin)
  - 见 `state-machine.ts` 里的注释 —— 你定:editor-only 还是 editor+admin

---

## 行为测试("故意搞坏",起本地实例后做)

这些是 🟡 条目的真机验法,拦住=对,没拦=抓到 bug:

1. [x] `PENDING` 直接改 `PUBLISHED` → **被拒**(422)✓ *(以 admin 验;editor 身份待 #1 角色)*
2. [x] 不选 `content_type` 改 `PUBLISHING` → **返 422**(content_type required)✓
3. [x] 同一 `source_url`(带/不带 `utm_source`)→ **被去重拦**(Value has to be unique)✓
4. [x] 用 **service** token 从 `PENDING` 改 `PUBLISHING` → **被拒**(422, actor "service")✓
5. [x] 新建文章后 `final_*` **自动 = `ai_*`** ✓

---

## D. 角色 + 字段权限(§4.1.9)— `permissions.mjs`

> snapshot **不含**权限;`permissions.mjs` 是权限的 source of truth(详见 bootstrap/README)。

- [x] `✅ 已验` **immutable**:editor 改 `ai_title` → **403**;改 `final_title` → 200
- [x] `✅ 已验` **service actor**:service token 做 `PENDING→PUBLISHING` → **422**(机器不能审核);service 建文章(source/ai)→ 200
- [x] `✅ 已配` `ARTICLES_SERVICE_ROLE_IDS` = service role id(否则 hook 把机器当 editor)
- [ ] `🟡 待 UI 验` editor 登录 Data Studio:`ai_*`/`source_*` 只读、只看到自己 category 的文章
- [ ] `🟡 待验` `reviewed_by`:editor 审核通过(PENDING→PUBLISHING)后 = 该 editor;之后 service 回写不覆盖

---

## 谁验哪部分(避免"自己改卷")

- `✅` 逻辑层:跑 `npm test` 自己确认绿
- `🟡` 真机层:**你**起本地 Directus 亲手验(我不能替你宣布达标 —— 我写的我说对,等于自评)
- `⭐` 决策层:**你 / mentor** 拍板

---

## ⭐ 待 mentor 确认的决策(开放项)

- [ ] **`reviewed_by` 是否也记 admin 审核**(代码现扩到了 admin,文档字面只写 editor)
- [ ] **两个补充字段** `articles.manual_intervention_required` / `categories.wp_category_id`(deploy §4.3.6 加的,HLD ER 图没有)是否保留
- [ ] **正式分类 taxonomy** —— 现在 `categories` 里只有一条**测试数据 `Politics`**(description 已标注"测试数据,待确认")。正式要哪些分类(Politics / Medical / Finance / AI …?)+ 各自 keywords,待 mentor 确认后重建。**注意:分类是数据、不进 snapshot**,确认后需手动录入。
