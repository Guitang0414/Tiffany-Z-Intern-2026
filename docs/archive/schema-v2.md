> **📦 ARCHIVED — 2026-05-19**
>
> 这份是初版 **6 表 schema 设计稿**,在与 mentor 讨论后决定**暂不采用**。
>
> **当前项目 schema 以 `HL-Intern-Project.md §4` 的 2 表方案为准。**
>
> 本文档作为 **Phase 2 演进参考** 保留,以下设计可能在 MVP 之后重新引入:
> - `article_versions` — 版本历史(NestJS 生态无成熟自动版本化库,手写表是主流做法)
> - `publish_logs` — 发布尝试记录(解决 WP 成功 / Twitter 失败时重试无法去重的问题)
> - `categories` + `user_categories` — 编辑分组(MVP 阶段改用 `articles.source_site` 字段直接筛选)
>
> ⚠️ **请不要基于这份文档开始写代码或 migration。**
>
> 原文档位置:`permission-flow.md` 的 "Database relationship" 章节(已抽出)。

---

# Database relationship (Archived 6-table draft)

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

Stores category assignments for users, mainly used to control which article categories each editor can access.

| Field Name | Type | Constraints | Description |
|---|---|---|---|
| user_id | UUID | NOT NULL | Reference to users.id |
| category_id | UUID | NOT NULL | Reference to categories.id |

Primary Key (user_id, category_id)

Foreign Keys:
- user_id -> users.id
- category_id -> categories.id


Purpose:
```text
Support many-to-many relationship between users and categories
Allow admins to assign editors to specific categories
Control which articles each editor can view and claim
```

## 3. Categories

| Field Name | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | NOT NULL | Unique category ID |
| name | VARCHAR(50) | NOT NULL, UNIQUE | Category name assigned to articles and editors |
| description | TEXT | | Optional description of the category |
| is_active | Boolean | NOT NULL, Default True | Decides whether the category is active or archived |
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

Purpose:
- Store article category metadata
- Organize articles by category
- Control editor category access
- Support category management in admin dashboard
- Provide UI display information for category tags

## 4. Articles

| Field Name | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | NOT NULL | Unique article ID |
| category_id | UUID | NOT NULL | the category that the article belongs to. Reference to categories.id |
| source_url | TEXT | NOT NULL, UNIQUE | Original source url, have to be unique and can be used to remove duplicate |
| status | ENUM | NOT NULL, Default `PENDING` | Current Workflow status of the article. Allowed values: `PENDING`, `REJECTED`, `PUBLISHING`, `PUBLISHED`, `FAILED`  |
| content_type | ENUM | NOT NULL, Default `ARTICLE` | Content type of the article, deciding the publishing pathway. Allowed values: `ARTICLE`, `SHORT`  |
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

Claim Rule:
An article can only be claimed by one editor at a time. Once claimed, other editors cannot edit the same article unless the article is released or reassigned.

Purpose:
- Store article workflow state
- Manage article ownership and editor assignment
- Track article rejection status
- Link article to its content version history

## 5. article_versions

Stores article content history and tracks different stages of article editing workflow.

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
```text
(article_id, version_num)
```

Foreign Keys:
```text
article_id → articles.id
```

Purpose:
```text
- Store article content history
- Track AI rewritten versions
- Support editor draft workflow
- Preserve final published version
- Allow rollback or version comparison
```

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
