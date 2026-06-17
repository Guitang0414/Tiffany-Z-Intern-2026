# ai-news — Directus data layer (MVP)

Local **dev** stack for the AI News Curation project's content layer: Directus + Postgres,
plus the `articles` lifecycle hooks and a schema bootstrap script.

Authoritative design: [`../docs/hld.md`](../docs/hld.md) + [`../docs/deployment-plan.md`](../docs/deployment-plan.md).
(`internship-plan.md` is stale — it predates the Directus-first decision; ignore it for implementation.)

> This is **dev only**. It never touches the production `cms.epochtimesnw.com` / OVH box.
> The production compose (dokploy-network, Authentik OIDC, pinned patches) is a separate
> artifact described in deployment-plan §4.1.3.

## Layout

```
ai-news/
├── docker-compose.yml        # local dev: Directus(:8055) + Postgres
├── .env.example              # copy to .env
├── extensions/
│   └── articles-hooks/       # lifecycle hooks (TS) + unit tests (Directus 11 layout: directly under extensions/)
└── bootstrap/
    └── schema.mjs            # creates collections/fields/relations/roles via REST API
```

## 1. Run Directus locally

```bash
cd ai-news
cp .env.example .env          # then edit secrets/passwords
docker compose up -d
# open http://localhost:8055  (log in with ADMIN_EMAIL / ADMIN_PASSWORD)
```

## 2. Build the hooks extension

Directus loads the **built** extension from `extensions/`, so build before (or after) `up`:

```bash
cd extensions/articles-hooks
npm install
npm run build                 # produces dist/index.js
docker compose restart directus   # (from ai-news/) pick up the built hook
```

## 3. Unit tests (no Directus needed)

The decision logic (url normalization, state machine, actor resolution) is pure and tested
in isolation — `npm test` does not require a running Directus or DB:

```bash
cd extensions/articles-hooks
npm install
npm test                      # 28 tests
```

## 4. Apply the schema

With Directus up, create the `articles` / `categories` collections, relations and roles:

```bash
cd bootstrap
node schema.mjs               # idempotent; reads DIRECTUS_URL / admin creds from env
```

See [`bootstrap/README.md`](bootstrap/README.md) for details.

## What the hooks do (deployment-plan §4.1.7)

| Event | Behavior |
|---|---|
| `articles.beforeCreate` | normalize `source_url` (strip utm_/fbclid/scheme/case/slash); seed `final_* = ai_*` in the same INSERT |
| `articles.beforeUpdate` | actor-aware state-machine guard (only when `status` changes); require `content_type` before `PUBLISHING`; write `reviewed_by` on human approval; strip client-supplied `reviewed_by` |

Static field protection (`source_*` / `ai_*` immutability) is **not** done in hooks — it's
Directus field permissions (deployment-plan §4.1.9), applied by the bootstrap script.

## Open items carried from the docs

- `reviewed_by` on approval: docs say "editor"; we also record `admin`. Confirm with mentor
  (see comment in `state-machine.ts`).
- HLD ER diagram is missing `articles.manual_intervention_required` and
  `categories.wp_category_id` (added in deployment-plan §4.3.6). The bootstrap script
  includes them — **HLD should be synced** to match.
