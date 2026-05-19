# 📌 状态说明(2026-05-19)

本文档的 **Database relationship 章节已归档** 到 [`docs/archive/schema-v2.md`](docs/archive/schema-v2.md)。
当前 schema 以 mentor 的 [`HL-Intern-Project.md §4`](HL-Intern-Project.md) 的 2 表方案为准。

**仍然有效**(可继续参考):
- User Roles
- Agent Processing Flow
- Editor Interaction Flow(claim 步骤需调整,因为 2 表方案暂无 claim 机制)
- Frontend behavior(全部章节)

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

## Sidebar Navigation

The editor dashboard contains a left sidebar navigation for quick access to different article workflows and states.

Navigation items:
- Dashboard
- Available Articles
- My Drafts
- Published
- Failed

---

## Dashboard Overview Page

The dashboard overview page provides editors with a quick summary of their workload and recent activity.

The dashboard acts as an overview hub instead of a full article management page.

The overview page may include:
- Recent available articles
- Recently edited drafts
- Quick statistics

Each section may display only a small number of recent items with a "View All" action that redirects to the corresponding full page.

---

## Available Articles Page

The Available Articles page displays the full list of unclaimed articles from categories assigned to the current editor.

This page may support:
- Pagination
- Search
- Filtering
- Sorting

Each article row may display:
- Article title
- Category tag
- Preview button
- Claim/Edit button

Category should be displayed as a colored tag/label for quick identification.

Editors can:
- Preview article details before claiming
- Claim an article for editing

---

## Article Preview Page

The preview page allows editors to review the full article information before claiming it for editing.

The preview page may include:
- Article title
- Original source name
- Original URL
- Original published time, if available
- Crawled time
- Original article content
- AI rewritten title/content
- Current category
- Detected category
- Related metadata from the agent

Available actions:
- Back to Available Articles
- Claim and Edit
- Reject article

---

## Article Editing Page

After an editor claims an article, the system opens the editing workspace.

The editing page may include:
- Editable article title
- Editable article content
- Content type dropdown selection
- Save Draft button
- Publish button
- Reject button

---

## Frontend Validation Rules

- Editors must select a category before publishing an article.
- The Publish button should remain disabled until a category is selected.
- Editors may save drafts without selecting a final category.
- Only one editor can claim an article at a time.

---

## My Drafts Page

The My Drafts page displays articles that the current editor has claimed or saved but has not published yet.

Editors can:
- Continue editing drafts
- Update content type
- Publish drafts
- Reject drafts

---

## Published Page

The Published page displays articles successfully published by the editor.

Editors can:
- View published article records
- Check final category and content type
- Open the published article link if available

---

## Failed Publishing Page

The Failed page displays articles that encountered publishing or distribution failures.

Editors may:
- View publishing error messages
- Retry failed publishing tasks
- Re-edit articles before retrying publishing
