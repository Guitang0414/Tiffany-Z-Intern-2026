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
# Interaction flows
    
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
## 1. Users
| Field Name | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | NOT NULL | Unique user ID |
| username | VARCHAR(50) | NOT NULL | User display name shown in the dashboard after login |
| email | VARCHAR(255) | NOT NULL, UNIQUE | User email address used for login. Must be unique |
| password_hash | TEXT | NOT NULL | Hashed user password. Plain passwords are never stored |
| role | ENUM | NOT NULL | Allowed values: `ADMIN`, `EDITOR`. Controls user permissions in the system |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Time when the user account was created |
| updated_at | TIMESTAMPTZ |  | Time when the user account was last updated |

Primary Key:
(id)

## 2. User_Categories

| Field Name | Type | Constraints | Description |
|---|---|---|---|
| user_id | UUID | NOT NULL | Reference to users.id |
| category_id | UUID | NOT NULL | Reference to categories.id |

Primary Key (user_id, category_id)

Foreign Keys:
- user_id -> users.id
- category_id -> categories.id

## 3. Categories

| Field Name | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | NOT NULL | Unique category ID |
| name | VARCHAR(50) | NOT NULL, UNIQUE | Category name assigned to articles and editors |
| description | TEXT | | Optional description of the category |
| is_active | Boolean | NOT NULL, Default True | Decides whether the category is active or archieved |
| color | VARCHAR(20) |  | Color used for category tags in the dashboard UI |
| created_by | UUID | NOT NULL | Admin user ID that created the category |
| updated_by | UUID |  | Admin user ID that last updated the category |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Time when the category was created |
| updated_at | TIMESTAMPTZ |  | Time when the category was last updated |

Primary Key:
(id)

Foreign Keys:
- created_by → users.id
- updated_by → users.id

## 4. Articles

| Field Name | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | NOT NULL | Unique article ID |
| category_id | UUID | NOT NULL | the category that the article belongs to. Reference to categories.id |
| source_url | TEXT | NOT NULL, UNIQUE | Original source url, have to be unique and can be used to remove duplicate |
| status | ENUM | NOT NULL, Default `PENDING` | Current Workflow status of the article. Allowed values: `PENDING`, `REJECTED`, `PUBLISHING`, `PUBLISHED`, `FAILED`  |
| claimed_by | UUID |  | Editor who claimed the article. Reference to users.id |
| claimed_at | TIMESTAMPTZ |  | Time when editor claimed the article |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Time when the article was crawled by agent |
| rejection_reason | TEXT | | Reason why editor rejected this article |
| rejected_by | UUID | | Editor who rejected this article. Reference to users.id |
| rejected_at | TIMESTAMPTZ | | Time when editor rejected this article |

Primary Key:
(id)

Foreign Keys:
- category_id → categories.id
- claimed_by → users.id
- rejected_by → users.id

Article Status Rules:
- `PENDING`: Article is waiting for editor action or still being edited. Draft saves do not change this status
- `REJECTED`: Article was rejected by an editor
- `PUBLISHING`: Article is being published to external platforms
- `PUBLISHED`: Article was successfully published on external platforms
- `FAILED`: Publishing failed on one or more external platforms

Article Creation Rule:
When an article is created, the backend must create the article row and the initial `SOURCE` version with `version_num = 0` in the same database transaction. If the initial version creation fails, the article creation should be rolled back.

## 5. article_versions

| Field Name | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PRIMARY KEY, NOT NULL | Unique article version ID |
| article_id | UUID | NOT NULL | Reference to articles.id |
| version_num | INTEGER | NOT NULL | Article version number |
| title | TEXT | NOT NULL | News title of this version |
| content | TEXT | NOT NULL | News content of this version |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Time when this article version was created |
| version_type | ENUM | NOT NULL, DEFAULT `SOURCE` | Allowed values: `SOURCE`, `AI_REWRITE`, `DRAFT`, `FINAL` |

Unique Constraints:
- (article_id, version_num)

Foreign Keys:
- article_id → articles.id

## 6. Publish Logs

Stores publishing attempt history and external platform publishing results.

| Field Name | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | NOT NULL | Unique publish log ID |
| article_id | UUID | NOT NULL | Reference to articles.id |
| platform | ENUM | NOT NULL | Target publishing platform (`WORDPRESS`, `TWITTER`) |
| status | ENUM | NOT NULL | Publishing result (`SUCCESS`, `FAILED`) |
| external_url | TEXT |  | Published article/post URL if successful |
| error_message | TEXT |  | Failure reason returned by external platform |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Time of the publishing attempt |

Primary Key:
```text
(id)
```

Foreign Keys:
```text
article_id → articles.id
```

Purpose:
- Track publishing history
- Store publishing failure reasons
- Support retry workflow
- Record external published URLs

# API actions
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
