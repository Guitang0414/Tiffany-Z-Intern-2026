# Schema bootstrap

`schema.mjs` creates the `articles` + `categories` collections, their fields, and the two
simple relations against a running Directus instance, via the REST API. It is **idempotent**
— re-running skips anything that already exists.

## Run

```bash
# from ai-news/, with the dev stack up (docker compose up -d):
cd bootstrap
DIRECTUS_URL=http://localhost:8055 \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD='<your dev admin password>' \
node schema.mjs
```

Node 18+ (uses built-in `fetch`). No npm install needed.

## What it creates

- `categories`: `name` (unique), `description`, `keywords` (json), `wp_category_id` (int), timestamps
- `articles`: full `source_* / ai_* / final_*` field families, `status`, `content_type`,
  `reviewed_by`, `published_at`, `manual_intervention_required`, per-platform `wp_*` / `tweet_*`,
  `category_id`, timestamps
- relations: `articles.category_id → categories`, `articles.reviewed_by → directus_users`

## Done in Data Studio afterwards (not scripted)

Directus 11 ties these to roles/policies and they're safer to verify in the UI:

1. **`directus_users.assigned_categories`** — M2M field → `categories`. Admin drags the
   categories each editor owns. Item-level permission uses this to scope what editors see.
2. **Roles + field permissions** per deployment-plan §4.1.9:
   - `editor` role: write `final_*` / `content_type` / `rejection_reason`; read-only `source_*` / `ai_*` / `wp_*` / `tweet_*` / `reviewed_by`; conditional `status`.
   - `service` role (Agent + n8n token): write `source_*` / `ai_*` / `category_id` / `wp_*` / `tweet_*`; **after** creating it, put its role id into `ARTICLES_SERVICE_ROLE_IDS` so the hooks treat it as a machine actor.
3. **Disable** Directus' built-in draft/published archive on `articles` (we use the custom `status`).

## Schema snapshot (recommended, per deployment-plan §6.3)

Once the schema looks right in dev, capture a versioned snapshot to commit:

```bash
npx directus schema snapshot ./snapshots/$(date +%Y%m%d)-init.yaml
```
