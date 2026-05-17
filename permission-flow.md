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
    
# Editor Interaction flow
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
# Database relationship
## 1. Users
| Field Name | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | Primary key | Unique user ID. |
| username | VARCHAR(50) | NOT NULL | User display name shown in the dashboard after login. |
| email | VARCHAR(255) | NOT NULL, UNIQUE | User email address used for login. Must be unique. |
| password_hash | TEXT | NOT NULL | Hashed user password. Plain passwords are never stored. |
| role | ENUM | NOT NULL | Allowed values: `ADMIN`, `EDITOR`. Controls user permissions in the system. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Time when the user account was created. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Time when the user account was last updated. |
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
