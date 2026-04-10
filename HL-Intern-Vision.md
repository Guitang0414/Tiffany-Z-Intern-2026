# AI News Curation Agent & Publishing Pool
**Project Vision Draft**

---

## 现有平台

| 平台 | 状态 | 地址 |
| :--- | :--- | :--- |
| WordPress 网站 | 已上线 | [www.epochtimesnw.com](https://www.epochtimesnw.com) |
| Twitter / X 账号 | 待建立 | TBD |

---

## 我们要做什么

一句话：**用 AI Agent 替代人工采编，把"找新闻 → 写新闻 → 发新闻"这条链路自动化。**

目前内容团队的痛点是：每天人工浏览十几个新闻源，手动摘编改写，再逐个平台发布，一篇新闻从发现到上线要 1-2 小时。我们希望把这个过程压缩到**编辑只需要花 10 分钟审核和微调**，其余全部由 Agent 和系统自动完成。

---

## 核心流程

```
新闻源 (TechCrunch, The Verge, ...)
    ↓  Hermes Agent 自动抓取
    ↓  Claude API 改写为头条风格
    ↓  Webhook 推送入库 + Telegram 通知编辑
    ↓  编辑在 Web 工作台审核 / 修改 / 批准
    ↓  自动发布到 epochtimesnw.com (WordPress) + Twitter
```

整个系统分四层：

| 层 | 做什么 | 关键技术 |
| :--- | :--- | :--- |
| **Agent 层** | 抓取新闻、AI 改写 | Hermes Agent + Claude API |
| **后端** | 接收数据、管理状态、触发分发 | FastAPI + PostgreSQL |
| **前端工作台** | 编辑审核、修改、一键发布 | React + Vite |
| **分发层** | 多平台发布 | WordPress REST API, Twitter API v2 |

> 架构图详见 → [docs/architecture.md](docs/architecture.md)

---

## 为什么用 Hermes Agent 而不是传统爬虫

传统爬虫（Scrapy 等）的问题：
- 需要针对每个网站写解析规则，维护成本高
- 面对反爬（JS 渲染、登录墙）容易失效
- 只能提取数据，不能理解内容

Hermes Agent 是一个自主智能体，它可以：
- **像人一样操控浏览器**，天然绕过大部分反爬
- **自主决策**下一步做什么（点击、滚动、提取），不需要硬编码规则
- **与 Claude 集成**，抓取完直接改写，一步到位

参考实践见附录。

---

## 战略价值与护城河 (Strategic Value)

本项目不仅是一个提效工具，更是内容团队战略转型的**产能杠杆**，精准解决目前“不够快、不够深”的痛点，重点服务我们的核心受众（西雅图华人群体）：

### 1. 解决“不够快”：用自动化机器抢占时效
- **极致压缩产出时间**：将单篇新闻（找素材 → 翻译 → 改写 → 排版的搬运工作）的产出时间极大压缩至编辑 10 分钟审核。
- **与英文媒体同步首发**：通过机器盯盘与自动化链路，我们能在科技、财经或本地重大突发事件上，实现几乎与科技源头或各大英文媒体同步的首发速度。

### 2. 解决“不够深”：用 AI 提供视角，用人力打造深度
目前的改写容易同质化，本系统从两个维度建立护城河：
- **第一维：通过 Prompt (SOUL.md) 注入“本地化/华人视角”深度**。
  不仅仅是翻译改写，而是让 Claude 在改写时结合目标群体关切。例如，针对科技大厂裁员，AI 会补充对西雅图（South Lake Union、Bellevue 等地区）从业者和房市的影响；针对移民政策，AI 会深入解释对留学生和新移民的利弊。未来甚至可以让 Agent 提取本地政务通告（如 King County 官网），直接转化为西雅图华人极具实用价值的中文资讯。
- **第二维：人机分工，让人类回归“真正的本地原创”**。
  系统的战略价值在于将编辑从“翻译机器”的角色中解放出来。让 AI 负责全美通稿新闻的**广度**和**速度**，让编辑把省下来的精力投入到 AI 无法触及的**本地深度与原创**（如采访本地华人企业家、探店、学区房趋势分析等），这才是留住西雅图本地群体的核心竞争力。

---

## 关键设计决策

### Agent 必须隔离部署

Agent 本质上是在运行不受控的浏览器操作，安全风险较高。所以 Agent 层和核心后端**物理隔离**，Agent 只能通过 Webhook API 向后端推数据，不能直连数据库。所有服务部署在 Hetzner VPS (5.78.203.102)，使用 Dokploy 管理部署和 CI/CD。

### 人工审核不可省略

AI 改写的内容可能存在事实偏差或表述问题。所有内容在发布前**必须经过编辑审核**，这是内容质量的底线。前端工作台（Pool）的核心价值就在于此：提供原文对照、富文本编辑、一键审批的流畅体验。

### 分发渠道互相独立

WordPress 发布和 Twitter 发布是独立的。一个失败不影响另一个，失败的可以单独重试。后续如果要加新渠道（微信公众号、Medium 等），只需要新增一个分发适配器。

---

## 大致开发节奏

不是严格的 4 周计划，而是按依赖关系自然推进的几个阶段：

**Phase 1 — Agent 跑起来**
搭建 Hermes Agent 环境，让它能自动抓取目标网站、调用 Claude 改写、通过 Telegram 汇报结果。这一步验证 Agent 方案是否可行。

**Phase 2 — 后端和数据打通**
搭建 FastAPI + PostgreSQL，开发 Webhook 接口让 Agent 能把数据推进来。跑通 Agent → 数据库 的链路。

**Phase 3 — 编辑工作台**
搭建 React 前端，实现待审列表、原文对照编辑、审批/驳回流程。跑通内部审核闭环。

**Phase 4 — 分发上线**
集成 WordPress 和 Twitter API，跑通全链路端到端流程。

每个 Phase 完成后都应该有一个可以 demo 的产出物。

---

## 已知风险

- **Hermes Agent 成熟度** — 相对较新的工具，稳定性待验证。备选方案：降级为 Playwright 脚本 + cron 定时任务
- **反爬风险** — 目标新闻源可能升级反爬策略。缓解：准备多个备用新闻源
- **Claude API 成本** — 需要评估每日调用量和费用，考虑用 Haiku 模型降低成本
- **Twitter 账号与 API 权限** — 账号尚未建立，API 申请周期较长，应尽早推进。如果来不及，先只做 WordPress 分发

---

## 未来可能的扩展

这些不在第一版范围内，但设计时可以留个口子：

- 更多分发渠道（微信公众号、Telegram Channel、Medium）
- 多语言改写（同时输出中英文版本）
- AI 自动评估改写质量，低质量的自动标记
- 发布后数据追踪（阅读量、互动数据）

---

## 参考资料

| 链接 | 主题 |
| :--- | :--- |
| [@Will_Yang_](https://x.com/Will_Yang_/status/2041507883876233312) | Hermes Agent 参考 |
| [@0xkevinhe](https://x.com/0xkevinhe/status/2025781752971809010) | Agent 访问 Twitter |
| [@gkxspace](https://x.com/gkxspace/status/2025861476439695777) | Agent 访问 Web |

---

## 相关文档

| 文档 | 说明 |
| :--- | :--- |
| [HL-Intern-Project.md](HL-Intern-Project.md) | 详细版项目规格（数据库 Schema、API 设计、安全策略等） |
| [docs/architecture.md](docs/architecture.md) | 系统架构图（Mermaid） |
| [docs/api-spec.md](docs/api-spec.md) | API 接口规范 |
