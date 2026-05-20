# 📌 状态说明

本文档已部分迁移 / 归档,**仍然有效**的章节(可继续参考):
- User Roles
- Agent Processing Flow
- Editor Interaction Flow(MVP 阶段不实现 claim,改用 optimistic concurrency)

**已迁移到其他文档**:
- `Database relationship` → [`docs/archive/schema-v2.md`](docs/archive/schema-v2.md)(早期 6 表设计稿存档;**MVP 当前 schema 见 [`docs/hld.md`](docs/hld.md) 的 Database Module 章节,4 表方案**)
- `Frontend behavior`(全部页面规格) → [`docs/hld.md`](docs/hld.md) 的 Frontend Module 章节

**已废弃**(依赖已归档的 6 表 schema):
- Article Versioning and Publishing Workflow
- retry flow

---

# User Roles
* Admin:

  * Create/Manage Categories
 
  * Assign Editors to Categories
 
  * Manage Editor Permissions and Roles
 
  * Manually modify Article Categories and reassign Articles
 
  * Unlock claimed articles
 
  * View all articles across categories

* Editor:

  * View
 
    * View available articles from assigned categories
   
    * View article details
    
  * Claim an article for editing 
 
  * Edit Article Contents
      
  * Save Draft Changes
 
  * Choose Content Type
 
  * Publish Articles
 
  * Reject Articles
 
  * Retry failed publishing tasks
 
* Hermes Agent:
  
### Responsibilities

- Crawl articles from configured news sources
- Apply keyword / semantic filtering
- Call Claude API for article rewriting
- Submit structured article data to Backend webhook

### Security

- Include API key or request signature in webhook requests

### Reliability

- Retry temporary crawl / parsing / AI API / webhook failures
- Log failed tasks
- Skip unrecoverable articles after retry limit

    
# Interaction flows
## System Interaction flow  

## Agent Processing Flow

```text
 Scheduler
     ↓ Trigger crawl task
 Hermes Agent
     ↓ Crawl configured news sources
 News Websites
     ↓ Raw article data
 Hermes Agent
     ↓ Filter by keywords / semantic relevance
 Hermes Agent
     ↓ API request
 Claude API
     ↓ AI rewritten title/content
 Hermes Agent
     ↓ Secured Webhook POST /agent/articles
 Backend API
```

## Publishing Flow


## Editor Interaction flow
  ```text
 Editor logs in
         ↓
 System redirects editor to dashboard
         ↓
 Dashboard displays available articles from assigned categories
         ↓
 [Optional] Editor previews an article
         ↓
 Editor claims an article for editing
         ↓
 System locks the article and opens the editing workspace
         ↓
 Editor edits article content
         ↓
 Editor selects content type
         ↓
 [Optional] Editor saves draft changes
         ↓
 Editor publishes the article
         ↓
 Backend updates article status and triggers distribution workflow
  ```
## Article Versioning and Publishing Workflow

> ⚠️ **已废弃 (2026-05-19)** — 此流程依赖已归档的 `article_versions` 表(`SOURCE` / `AI_REWRITE` / `DRAFT` / `FINAL` 四类版本)。当前 2 表方案不维护版本历史,编辑修改直接覆盖 `ai_title` / `ai_content`。详见 [`docs/archive/schema-v2.md`](docs/archive/schema-v2.md)。

  ```text
 Agent crawls article
         ↓
 Backend creates article row
         ↓
 Backend creates version 0 (`SOURCE`)
         ↓
 AI rewrites source content
         ↓
 Backend creates version 1 (`AI_REWRITE`)
         ↓
 Article status = `PENDING`
         ↓
 Editor claims article
         ↓
 Editor edits content based on latest version
         ↓
 [Optional] Editor saves draft
         ↓
 [Optional] Backend creates new `DRAFT` version
         ↓
 Editor clicks Publish
         ↓
 Backend creates new `FINAL` version
         ↓
 Article status = `PUBLISHING`
         ↓
 Backend publishes FINAL version to external platforms
         ↓
 Success → Article status = `PUBLISHED`
 Failure → Article status = `FAILED` 
  ```
## retry flow

> ⚠️ **已废弃 (2026-05-19)** — 此流程依赖已归档的 `publish_logs` 表(每次重试新建一行)。当前 2 表方案在 `news_articles` 上做状态翻转(`FAILED → PUBLISHING`),不保留重试历史。详见 [`docs/archive/schema-v2.md`](docs/archive/schema-v2.md)。

  ```text
 Publish attempt
 ↓
 Create publish_logs row
 ↓
 If failed
 ↓
 Frontend shows FAILED
 ↓
 Editor/Admin clicks retry
 ↓
 Create another publish_logs row
  ```
# Database relationship

> 📦 **已归档 (2026-05-19)** — 完整的 6 表 schema 设计稿(users / user_categories / categories / articles / article_versions / publish_logs)已迁移到 [`docs/archive/schema-v2.md`](docs/archive/schema-v2.md)。
>
> 当前 schema 以 [`HL-Intern-Project.md §4`](HL-Intern-Project.md) 的 2 表方案为准(`news_articles` + `users`)。
>
> Phase 2 演进时,可能重新引入 `article_versions` 和 `publish_logs`。

# API Interface Overview
# Frontend behavior

> 📦 **已迁移 (2026-05-19)** — 完整的 Frontend behavior 页面规格(Sidebar / Dashboard / Available Articles / Article Preview / Article Editing / Validation Rules / My Drafts / Published / Failed Publishing)已迁移到 [`docs/hld.md`](docs/hld.md) 的 Frontend Module 章节。本文档不再维护此部分。
