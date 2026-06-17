#!/usr/bin/env node
// Roles + policies + field/item permissions for the articles workflow — §4.1.9.
// Also creates a test editor user and a service (Agent/n8n) user with a static token
// so the permission/actor behavior can be verified end-to-end.
//
// Idempotent-ish: skips if the 'editor' role already exists.
//
// Prints the SERVICE role id at the end — put it into ARTICLES_SERVICE_ROLE_IDS.
//
// Usage: DIRECTUS_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node permissions.mjs

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

// editor may only WRITE these on articles (everything else read-only => source_*/ai_* immutable).
// reviewed_by is included ONLY because the beforeUpdate hook adds it to the payload on
// approval (PENDING->PUBLISHING) — without write perm the hook-augmented payload 403s.
// It's safe: the hook strips any client-supplied reviewed_by and sets the value itself,
// so editors still can't forge it. (Keep it UI-readonly so editors don't try to edit it.)
const EDITOR_WRITE = ['final_title', 'final_content', 'final_summary', 'content_type', 'status', 'rejection_reason', 'reviewed_by'];
// service (Agent) creates with these
const SERVICE_CREATE = ['source_url','source_title','source_content','source_site','source_published_at','ai_title','ai_content','ai_summary','final_title','final_content','final_summary','category_id'];
// service (n8n) writes back these
const SERVICE_UPDATE = ['wp_post_id','wp_url','wp_status','wp_error','wp_published_at','tweet_id','tweet_status','tweet_error','tweet_published_at','status','published_at','manual_intervention_required'];

// editor item-level filter: only articles whose category is in the user's assigned_categories
const EDITOR_SCOPE = { category_id: { _in: '$CURRENT_USER.assigned_categories.categories_id' } };

async function perm(policy, collection, action, fields, permissions = {}) {
  await api('POST', '/permissions', { policy, collection, action, fields, permissions, validation: {}, presets: null });
  console.log(`  + perm ${collection}.${action} (${fields.length === 1 && fields[0] === '*' ? 'all' : fields.length + ' fields'})`);
}

async function makeRole(name, { appAccess }) {
  const role = await api('POST', '/roles', { name });
  const policy = await api('POST', '/policies', { name: `${name}-policy`, app_access: appAccess, admin_access: false, enforce_tfa: false });
  await api('POST', '/access', { role: role.id, policy: policy.id });
  console.log(`+ role ${name} (${role.id}) + policy`);
  return { roleId: role.id, policyId: policy.id };
}

async function run() {
  token = (await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).access_token;
  console.log('✓ authenticated');

  const roles = await api('GET', '/roles?fields=id,name');
  if (roles.some((r) => r.name === 'editor')) { console.log('= editor role exists — skipping'); return; }

  // Politics (test category) id, for assigning the editor
  const cats = await api('GET', '/items/categories?fields=id,name');
  const politics = cats.find((c) => c.name === 'Politics');

  // --- editor ---
  const editor = await makeRole('editor', { appAccess: true });
  await perm(editor.policyId, 'articles', 'read', ['*'], EDITOR_SCOPE);
  await perm(editor.policyId, 'articles', 'update', EDITOR_WRITE, EDITOR_SCOPE);
  await perm(editor.policyId, 'categories', 'read', ['*']);
  await perm(editor.policyId, 'directus_users', 'read', ['*'], { id: { _eq: '$CURRENT_USER' } });

  // --- service (Agent / n8n) ---
  const service = await makeRole('service', { appAccess: false });
  await perm(service.policyId, 'articles', 'create', SERVICE_CREATE);
  await perm(service.policyId, 'articles', 'update', SERVICE_UPDATE);
  await perm(service.policyId, 'articles', 'read', ['*']);
  await perm(service.policyId, 'categories', 'read', ['*']);

  // --- test users (DEV / LOCALHOST ONLY) ---
  // These have known/public credentials (editor123, plus a static token committed to this
  // repo), so they are ONLY seeded against a local instance. Never create them on a remote /
  // public instance — anyone reading the repo could use the token to write. On a real
  // deployment you create editor accounts via Authentik SSO and issue the Agent/n8n token as
  // a real secret. (We had to manually delete these from the public cms-dev deploy.)
  const isLocal = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(URL_BASE);
  if (isLocal) {
    const editorUser = await api('POST', '/users', {
      email: 'editor@example.com', password: 'editor123', role: editor.roleId,
      first_name: 'Test', last_name: 'Editor',
    });
    if (politics) {
      await api('PATCH', `/users/${editorUser.id}`, { assigned_categories: [{ categories_id: politics.id }] });
    }
    console.log(`+ test editor user editor@example.com / editor123 (assigned: ${politics ? 'Politics' : 'none'})`);

    await api('POST', '/users', {
      email: 'agent@example.com', role: service.roleId, token: 'svc-static-token-123',
      first_name: 'Agent', last_name: 'Service',
    });
    console.log('+ service user agent@example.com (static token: svc-static-token-123)');
  } else {
    console.log('= skipped DEV test users (non-local DIRECTUS_URL) — create real accounts + a real Agent/n8n token instead');
  }

  console.log('\n✓ permissions bootstrap complete');
  console.log(`\n>>> SERVICE ROLE ID (put in ARTICLES_SERVICE_ROLE_IDS): ${service.roleId}`);
}

run().catch((e) => { console.error('\n✗ failed:', e.message); process.exit(1); });
