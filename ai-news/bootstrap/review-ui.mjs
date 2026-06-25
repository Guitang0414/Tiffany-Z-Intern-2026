#!/usr/bin/env node
// Editor review UI 配置(在 schema.mjs + permissions.mjs 之后跑)。
// 把编辑审核台的所有「UI 层」配置固化成可复现脚本:
//   - articles 字段的 interface / 条件显示 / 翻译 / 显示格式
//   - review_actions alias 字段(挂自定义扩展 article-review-actions)
//   - editor 角色的 read/update 字段白名单(精简编辑视图)
//   - 列表 preset:默认=待审核(PENDING),标签=已发布 / 已驳回
//
// 幂等:全部用 PATCH / get-or-create。
// Usage: DIRECTUS_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node review-ui.mjs

const URL_BASE = process.env.DIRECTUS_URL ?? 'http://localhost:8055';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.ADMIN_PASSWORD;
// cms-dev 禁用了密码登录(AUTH_DISABLE_DEFAULT),那里用 DIRECTUS_TOKEN(admin 静态 token)。
const TOKEN_ENV = process.env.DIRECTUS_TOKEN;
if (!TOKEN_ENV && !PASSWORD) { console.error('Set DIRECTUS_TOKEN (admin) or ADMIN_PASSWORD'); process.exit(1); }

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

const tr = (en, zh) => [
  { language: 'en-US', translation: en },
  { language: 'zh-CN', translation: zh },
];

async function patchField(field, meta) {
  await api('PATCH', `/fields/articles/${field}`, { meta });
  console.log(`  ~ field ${field}`);
}

async function run() {
  token = TOKEN_ENV ?? (await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).access_token;
  console.log('✓ authenticated');

  // ---- 1) 字段 interface / 翻译 / 条件显示 ----
  // 正文用 Markdown 编辑器(自带 Edit/Preview;避开 TinyMCE 的语言文件 bug)
  await patchField('final_content', {
    interface: 'input-rich-text-md', options: null,
    note: '正文(改写稿)— 点 Preview 标签看排版', translations: tr('Body', '正文'),
  });
  await patchField('final_title', { translations: tr('Title', '标题') });
  await patchField('final_summary', { translations: tr('Summary', '摘要') });
  await patchField('source_url', { translations: tr('Source Link', '原文链接'), note: '点开看原文' });
  await patchField('content_type', { readonly: false, translations: tr('Type', '类型') });
  await patchField('category_id', { translations: tr('Category', '分类') });
  await patchField('created_at', {
    display: 'datetime', display_options: { relative: false, format: 'MMM d, yyyy' },
    translations: tr('Created', '时间'),
  });
  // status:只读;PENDING 时隐藏(待审核里已知是 pending)
  await patchField('status', {
    readonly: true, hidden: false, translations: tr('Status', '状态'),
    conditions: [{ name: '待审核时隐藏', rule: { status: { _eq: 'PENDING' } }, hidden: true }],
  });
  // rejection_reason:只读;只在 REJECTED 时显示
  await patchField('rejection_reason', {
    readonly: true, hidden: true, translations: tr('Reject Reason', '驳回原因'),
    conditions: [{ name: '仅驳回时显示', rule: { status: { _eq: 'REJECTED' } }, hidden: false, readonly: true }],
  });
  // published_at:只读、仅日期;只在已发布时显示
  await patchField('published_at', {
    interface: 'datetime', readonly: true, hidden: true,
    display: 'datetime', display_options: { relative: false, format: 'MMM d, yyyy' },
    translations: tr('Published', '发布时间'),
    conditions: [{ name: '仅已发布时显示', rule: { status: { _in: ['PUBLISHING', 'PUBLISHED'] } }, hidden: false, readonly: true }],
  });

  // ---- 2) review_actions alias 字段(挂自定义扩展)----
  const fields = await api('GET', '/fields/articles?fields=field');
  if (!fields.some((f) => f.field === 'review_actions')) {
    await api('POST', '/fields/articles', {
      field: 'review_actions', type: 'alias',
      meta: { interface: 'article-review-actions', special: ['alias', 'no-data'],
        sort: 1, width: 'full', note: '审核操作:保存并发布 / 驳回' },
    });
    console.log('  + field review_actions (alias -> article-review-actions)');
  } else {
    await api('PATCH', '/fields/articles/review_actions', {
      meta: { interface: 'article-review-actions', sort: 1, width: 'full', note: '审核操作:保存并发布 / 驳回' },
    });
    console.log('  ~ field review_actions');
  }

  // ---- 3) editor 角色 read/update 字段白名单 ----
  const policy = (await api('GET', '/policies?filter[name][_eq]=editor-policy&fields=id'))[0]?.id;
  if (!policy) throw new Error('editor-policy 不存在;先跑 permissions.mjs');
  const READ = ['id', 'final_title', 'final_summary', 'final_content', 'source_url',
    'status', 'rejection_reason', 'content_type', 'category_id', 'created_at', 'review_actions', 'published_at'];
  const UPDATE = ['final_title', 'final_summary', 'final_content', 'content_type',
    'status', 'rejection_reason', 'reviewed_by', 'published_at'];
  for (const [action, list] of [['read', READ], ['update', UPDATE]]) {
    const perm = (await api('GET',
      `/permissions?filter[policy][_eq]=${policy}&filter[collection][_eq]=articles&filter[action][_eq]=${action}&fields=id`))[0];
    if (perm) { await api('PATCH', `/permissions/${perm.id}`, { fields: list }); console.log(`  ~ editor articles.${action} fields`); }
  }

  // ---- 4) 列表 preset:默认=待审核;标签=已发布 / 已驳回 ----
  const upsertPreset = async (bookmark, status, cols, sortField, icon, color) => {
    const body = {
      collection: 'articles', role: null, user: null, bookmark, icon, color,
      filter: { status: { _eq: status } }, layout: 'tabular',
      layout_query: { tabular: { fields: cols, sort: [`-${sortField}`] } },
      layout_options: { tabular: { fields: cols, widths: { final_title: 440, category_id: 190, [sortField]: 150 } } },
    };
    const q = new URLSearchParams({
      'filter[collection][_eq]': 'articles', 'filter[role][_null]': 'true', 'filter[user][_null]': 'true',
    });
    q.append(bookmark ? 'filter[bookmark][_eq]' : 'filter[bookmark][_null]', bookmark ?? 'true');
    const ex = await api('GET', `/presets?${q}&fields=id`);
    if (ex[0]) await api('PATCH', `/presets/${ex[0].id}`, body);
    else await api('POST', '/presets', body);
    console.log(`  ~ preset ${bookmark ?? '(默认/待审核)'}`);
  };
  await upsertPreset(null, 'PENDING', ['final_title', 'category_id', 'created_at'], 'created_at', 'inbox', '#FFA439');
  await upsertPreset('已发布', 'PUBLISHING', ['final_title', 'category_id', 'published_at'], 'published_at', 'article', '#3399FF');
  await upsertPreset('已驳回', 'REJECTED', ['final_title', 'category_id', 'created_at'], 'created_at', 'cancel', '#E35169');

  console.log('\n✓ review UI 配置完成');
}

run().catch((e) => { console.error('\n✗ failed:', e.message); process.exit(1); });
