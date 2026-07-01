#!/usr/bin/env node
// Grants editor role READ-ONLY access to article_audit_log (schema.mjs must have run first).
// Separate from permissions.mjs because that script no-ops once the 'editor' role already
// exists — this one only adds the one new permission, idempotently, without touching anything
// else. No role gets create/update/delete on this collection: it's written exclusively by the
// articles-hooks beforeUpdate hook via raw DB access, so client tokens can never forge history.
//
// Usage: DIRECTUS_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node audit-log-permissions.mjs

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

// Same scope as articles: editor only sees audit history for articles in their own categories.
const EDITOR_SCOPE = { article: { category_id: { _in: '$CURRENT_USER.assigned_categories.categories_id' } } };

async function run() {
  token = (await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).access_token;
  console.log('✓ authenticated');

  const policies = await api('GET', '/policies?filter[name][_eq]=editor-policy&fields=id,name');
  const editorPolicy = policies[0];
  if (!editorPolicy) { console.error('✗ editor-policy not found — run permissions.mjs first'); process.exit(1); }

  const existing = await api(
    'GET',
    `/permissions?filter[policy][_eq]=${editorPolicy.id}&filter[collection][_eq]=article_audit_log&filter[action][_eq]=read`,
  );
  if (existing.length) { console.log('= editor read perm on article_audit_log (exists)'); return; }

  await api('POST', '/permissions', {
    policy: editorPolicy.id,
    collection: 'article_audit_log',
    action: 'read',
    fields: ['*'],
    permissions: EDITOR_SCOPE,
    validation: {},
    presets: null,
  });
  console.log('+ perm article_audit_log.read (editor, scoped to assigned_categories)');
  console.log('\n✓ done — no role has write access; only the articles-hooks extension writes this table.');
}

run().catch((e) => { console.error('\n✗ failed:', e.message); process.exit(1); });
