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

## The other two bootstrap scripts (run after schema.mjs)

```bash
node add-m2m.mjs       # directus_users.assigned_categories M2M -> categories
node permissions.mjs   # editor/service roles + field/item permissions (§4.1.9)
                       # prints the SERVICE role id -> put it in ARTICLES_SERVICE_ROLE_IDS, then recreate directus
```

- `add-m2m.mjs` — adds the M2M so editors can be assigned categories.
- `permissions.mjs` — creates:
  - `editor` role: write `final_*` / `content_type` / `rejection_reason`; **read-only** `source_*` / `ai_*` / `wp_*` / `tweet_*` / `reviewed_by` (this is what makes them immutable); item-level read/update scoped to `category ∈ assigned_categories`.
  - `service` role (Agent + n8n): create `source_*` / `ai_*` / `category_id`; write back `wp_*` / `tweet_*` / `status`.
  - DEV-ONLY test users: `editor@example.com` / `editor123` (assigned Politics) and `agent@example.com` (static token `svc-static-token-123`).
  - **After running, set `ARTICLES_SERVICE_ROLE_IDS` = the printed service role id and recreate directus**, else the hooks treat the Agent/n8n token as an editor and block its writebacks.

> ⚠️ **`directus schema snapshot` does NOT capture roles / policies / permissions / users** — those live in `directus_*` data tables, not the schema. So **`permissions.mjs` is the source of truth for access control** (re-run it on a fresh instance), the same way the snapshot is for the schema. On a fresh instance: `schema apply` (snapshot) → `add-m2m.mjs` → `permissions.mjs`.

## Schema snapshot (recommended, per deployment-plan §6.3)

Once the schema looks right in dev, capture a versioned snapshot to commit:

```bash
# Export the full live schema (incl. Data Studio changes like interfaces) from the container:
docker exec ai-news-directus-1 npx directus schema snapshot --yes /tmp/snapshot.yaml
docker cp ai-news-directus-1:/tmp/snapshot.yaml ../snapshots/$(date +%Y%m%d)-schema.yaml
```

### ⚠️ Source of truth: snapshot, not this script

`schema.mjs` is a **one-shot bootstrap** that creates collections/fields if missing — it is
idempotent by *existence*, so it will NOT re-apply edits made in Data Studio (e.g. changing
an interface) to an instance that already has the field.

Once you start configuring in Data Studio, the committed **snapshot YAML** (`ai-news/snapshots/`)
becomes the source of truth. To reproduce the schema on a fresh instance (or Dokploy):

```bash
docker cp ../snapshots/<date>-schema.yaml ai-news-directus-1:/tmp/snapshot.yaml
docker exec ai-news-directus-1 npx directus schema apply --yes /tmp/snapshot.yaml
```

`schema.mjs` is kept in sync as a convenience for brand-new empty instances, but if the two
ever disagree, **the snapshot wins**.
