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
# API actions
# Frontend behavior
