#!/usr/bin/env node
// Add the directus_users.assigned_categories M2M (-> categories), per hld.md.
//
// M2M in Directus = a hidden junction collection + 2 relations + 1 alias field:
//   directus_users_categories (junction): id, directus_users_id, categories_id
//   directus_users.assigned_categories (alias, special m2m)
//
// Idempotent-ish: bails early if the alias field already exists.
//
// Usage:
//   DIRECTUS_URL=http://localhost:8055 ADMIN_EMAIL=admin@example.com \
//   ADMIN_PASSWORD=... node add-m2m.mjs

const URL_BASE = process.env.DIRECTUS_URL ?? 'http://localhost:8055';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) { console.error('Set ADMIN_PASSWORD'); process.exit(1); }

let token = '';
async function api(method, path, body) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

// Junction can't use the reserved "directus_" prefix when created via the API.
const JUNCTION = 'users_categories';

async function exists(path) {
  try { await api('GET', path); return true; }
  catch (e) { if (e.status === 403 || e.status === 404) return false; throw e; }
}

async function run() {
  token = (await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).access_token;
  console.log('✓ authenticated');

  if (await exists('/fields/directus_users/assigned_categories')) {
    console.log('= assigned_categories already exists — nothing to do');
    return;
  }

  // 1. junction collection
  if (!(await exists(`/collections/${JUNCTION}`))) {
    await api('POST', '/collections', {
      collection: JUNCTION,
      meta: { hidden: true, icon: 'import_export' },
      schema: {},
      fields: [
        { field: 'id', type: 'integer', meta: { hidden: true },
          schema: { is_primary_key: true, has_auto_increment: true } },
        { field: 'directus_users_id', type: 'uuid', meta: { hidden: true }, schema: {} },
        { field: 'categories_id', type: 'uuid', meta: { hidden: true }, schema: {} },
      ],
    });
    console.log(`+ junction collection ${JUNCTION}`);
  }

  // 2. alias field on directus_users
  await api('POST', '/fields/directus_users', {
    field: 'assigned_categories',
    type: 'alias',
    meta: { interface: 'list-m2m', special: ['m2m'], options: {}, note: 'editor 被分配的 category' },
  });
  console.log('+ directus_users.assigned_categories (alias)');

  // 3. relation: junction.directus_users_id -> directus_users (carries the alias field)
  await api('POST', '/relations', {
    collection: JUNCTION,
    field: 'directus_users_id',
    related_collection: 'directus_users',
    meta: { one_field: 'assigned_categories', sort_field: null, one_deselect_action: 'nullify', junction_field: 'categories_id' },
    schema: { on_delete: 'CASCADE' },
  });
  console.log('+ relation junction.directus_users_id -> directus_users');

  // 4. relation: junction.categories_id -> categories
  await api('POST', '/relations', {
    collection: JUNCTION,
    field: 'categories_id',
    related_collection: 'categories',
    meta: { one_field: null, junction_field: 'directus_users_id' },
    schema: { on_delete: 'CASCADE' },
  });
  console.log('+ relation junction.categories_id -> categories');

  console.log('\n✓ M2M assigned_categories created');
}

run().catch((e) => { console.error('\n✗ failed:', e.message); process.exit(1); });
