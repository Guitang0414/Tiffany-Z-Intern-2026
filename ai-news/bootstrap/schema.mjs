#!/usr/bin/env node
// Idempotent schema bootstrap for the ai-news Directus instance.
// Creates the `categories` and `articles` collections, their fields, and the two
// simple relations. Re-running is safe (existing collections/fields are skipped).
//
// Faithful to docs/hld.md §Database + docs/deployment-plan.md §4.3.6.
// Includes the two fields the HLD ER diagram is missing:
//   - articles.manual_intervention_required  (deployment-plan §4.3.6 防线 1)
//   - categories.wp_category_id              (deployment-plan §4.3.6 / PE4)
//
// NOT handled here (do in Data Studio — Directus 11 ties these to roles/policies and
// they are easier + safer to verify in the UI):
//   - directus_users.assigned_categories  (M2M -> categories; admin drags per editor)
//   - roles (editor / service) + field-permission matrix (deployment-plan §4.1.9)
//
// Usage:
//   DIRECTUS_URL=http://localhost:8055 \
//   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... \
//   node schema.mjs

const URL_BASE = process.env.DIRECTUS_URL ?? 'http://localhost:8055';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!PASSWORD) {
  console.error('Set ADMIN_PASSWORD (and optionally DIRECTUS_URL / ADMIN_EMAIL).');
  process.exit(1);
}

let token = '';

async function api(method, path, body) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = json?.errors?.[0]?.message ?? text;
    throw Object.assign(new Error(`${method} ${path} -> ${res.status}: ${err}`), { status: res.status });
  }
  return json.data;
}

async function login() {
  const data = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = data.access_token;
  console.log('✓ authenticated');
}

async function collectionExists(name) {
  try {
    await api('GET', `/collections/${name}`);
    return true;
  } catch (e) {
    if (e.status === 403 || e.status === 404) return false;
    throw e;
  }
}

// Create a collection with only its UUID primary key; fields are added separately.
async function ensureCollection(name, meta) {
  if (await collectionExists(name)) {
    console.log(`= collection ${name} (exists)`);
    return;
  }
  await api('POST', '/collections', {
    collection: name,
    meta: { singleton: false, ...meta },
    schema: {},
    fields: [
      {
        field: 'id',
        type: 'uuid',
        meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
        schema: { is_primary_key: true, has_auto_increment: false },
      },
    ],
  });
  console.log(`+ collection ${name}`);
}

async function ensureField(collection, field) {
  try {
    await api('GET', `/fields/${collection}/${field.field}`);
    console.log(`  = ${collection}.${field.field} (exists)`);
    return;
  } catch (e) {
    if (e.status !== 403 && e.status !== 404) throw e;
  }
  await api('POST', `/fields/${collection}`, field);
  console.log(`  + ${collection}.${field.field}`);
}

async function ensureRelation(rel) {
  const existing = await api('GET', `/relations/${rel.collection}/${rel.field}`).catch((e) => {
    if (e.status === 403 || e.status === 404) return null;
    throw e;
  });
  if (existing) {
    console.log(`  = relation ${rel.collection}.${rel.field} (exists)`);
    return;
  }
  await api('POST', '/relations', rel);
  console.log(`  + relation ${rel.collection}.${rel.field} -> ${rel.related_collection}`);
}

// --- field helpers -----------------------------------------------------------
const f = {
  string: (field, { len = 255, nullable = true, unique = false } = {}) => ({
    field,
    type: 'string',
    schema: { is_nullable: nullable, is_unique: unique, max_length: len },
    meta: {},
  }),
  text: (field, { nullable = true } = {}) => ({ field, type: 'text', schema: { is_nullable: nullable }, meta: {} }),
  integer: (field, { nullable = true } = {}) => ({ field, type: 'integer', schema: { is_nullable: nullable }, meta: {} }),
  boolean: (field, def = false) => ({
    field,
    type: 'boolean',
    schema: { is_nullable: false, default_value: def },
    meta: {},
  }),
  json: (field) => ({ field, type: 'json', schema: { is_nullable: true }, meta: { interface: 'input-code' } }),
  timestamp: (field, { nullable = true } = {}) => ({
    field,
    type: 'timestamp',
    schema: { is_nullable: nullable },
    meta: {},
  }),
  dateCreated: () => ({
    field: 'created_at',
    type: 'timestamp',
    meta: { special: ['date-created'], readonly: true, hidden: true },
    schema: {},
  }),
  dateUpdated: () => ({
    field: 'updated_at',
    type: 'timestamp',
    meta: { special: ['date-updated'], readonly: true, hidden: true },
    schema: {},
  }),
  // FK uuid column; relation wired separately via ensureRelation.
  fk: (field, { nullable = true } = {}) => ({ field, type: 'uuid', schema: { is_nullable: nullable }, meta: {} }),
};

async function run() {
  await login();

  // === categories ===========================================================
  await ensureCollection('categories', { icon: 'category', note: '文章话题分类 (admin 维护)' });
  await ensureField('categories', f.string('name', { len: 50, nullable: false, unique: true }));
  await ensureField('categories', f.text('description'));
  await ensureField('categories', f.json('keywords')); // Agent 关键词预筛
  await ensureField('categories', f.integer('wp_category_id')); // deployment-plan §4.3.6 / PE4
  await ensureField('categories', f.dateCreated());
  await ensureField('categories', f.dateUpdated());

  // === articles =============================================================
  await ensureCollection('articles', { icon: 'article', note: '文章主表' });

  // source_* (immutable after create; protected by field permissions, not hooks)
  await ensureField('articles', f.string('source_url', { len: 2048, nullable: false, unique: true }));
  await ensureField('articles', f.string('source_title', { len: 500 }));
  await ensureField('articles', f.text('source_content'));
  await ensureField('articles', f.string('source_site', { len: 100 }));
  await ensureField('articles', f.timestamp('source_published_at'));

  // ai_* (immutable after create)
  await ensureField('articles', f.string('ai_title', { len: 500, nullable: false }));
  await ensureField('articles', f.text('ai_content', { nullable: false }));
  await ensureField('articles', f.string('ai_summary', { len: 280 }));

  // final_* (editor-edited; seeded = ai_* by beforeCreate hook)
  await ensureField('articles', f.string('final_title', { len: 500 }));
  await ensureField('articles', f.text('final_content'));
  await ensureField('articles', f.string('final_summary', { len: 280 }));

  // workflow
  await ensureField('articles', {
    field: 'content_type',
    type: 'string',
    schema: { is_nullable: true, max_length: 20 },
    meta: { interface: 'select-dropdown', options: { choices: [{ text: 'ARTICLE', value: 'ARTICLE' }, { text: 'SHORT', value: 'SHORT' }] } },
  });
  await ensureField('articles', {
    field: 'status',
    type: 'string',
    schema: { is_nullable: false, default_value: 'PENDING', max_length: 20 },
    meta: {
      interface: 'select-dropdown',
      options: { choices: ['PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'REJECTED'].map((v) => ({ text: v, value: v })) },
    },
  });
  await ensureField('articles', f.text('rejection_reason'));
  await ensureField('articles', f.fk('reviewed_by')); // -> directus_users
  await ensureField('articles', f.timestamp('published_at'));
  await ensureField('articles', f.boolean('manual_intervention_required', false)); // deployment-plan §4.3.6

  // per-platform: WordPress
  await ensureField('articles', f.integer('wp_post_id'));
  await ensureField('articles', f.text('wp_url'));
  await ensureField('articles', f.string('wp_status', { len: 20 }));
  await ensureField('articles', f.text('wp_error'));
  await ensureField('articles', f.timestamp('wp_published_at'));

  // per-platform: Twitter
  await ensureField('articles', f.string('tweet_id', { len: 50 }));
  await ensureField('articles', f.string('tweet_status', { len: 20 }));
  await ensureField('articles', f.text('tweet_error'));
  await ensureField('articles', f.timestamp('tweet_published_at'));

  // category FK (created last so the column exists before wiring the relation)
  await ensureField('articles', f.fk('category_id', { nullable: false }));

  await ensureField('articles', f.dateCreated());
  await ensureField('articles', f.dateUpdated());

  // === relations ============================================================
  await ensureRelation({
    collection: 'articles',
    field: 'category_id',
    related_collection: 'categories',
    meta: { sort_field: null },
    schema: { on_delete: 'NO ACTION' },
  });
  await ensureRelation({
    collection: 'articles',
    field: 'reviewed_by',
    related_collection: 'directus_users',
    meta: {},
    schema: { on_delete: 'SET NULL' },
  });

  console.log('\n✓ schema bootstrap complete');
  console.log('Next (Data Studio): add directus_users.assigned_categories (M2M -> categories),');
  console.log('then roles + field permissions per deployment-plan §4.1.9.');
}

run().catch((e) => {
  console.error('\n✗ bootstrap failed:', e.message);
  process.exit(1);
});
