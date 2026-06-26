// 入库:POST 到 Directus(用 service token,禁用 admin)。
// 只送 source_*/ai_*/content_type/category_id;final_* 由 Directus hook 从 ai_* 生成;status 默认 PENDING。
// 合规:不送原文链接给读者(source_url 仅内部去重用,不发布)。
import { config } from './config';
import type { Lead, Rewritten } from './types';
import { log } from './logger';

const lg = log('publisher');
const headers = { Authorization: `Bearer ${config.DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };
const catCache = new Map<string, string>();

/** get-or-create 分类,返回 id(带内存 cache)。 */
export async function ensureCategory(name: string): Promise<string> {
	const cached = catCache.get(name);
	if (cached) return cached;
	const q = await fetch(
		`${config.DIRECTUS_URL}/items/categories?filter[name][_eq]=${encodeURIComponent(name)}&fields=id&limit=1`,
		{ headers },
	);
	const found = (await q.json()).data?.[0]?.id as string | undefined;
	if (found) { catCache.set(name, found); return found; }
	const r = await fetch(`${config.DIRECTUS_URL}/items/categories`, {
		method: 'POST', headers, body: JSON.stringify({ name }),
	});
	if (!r.ok) throw new Error(`ensureCategory(${name}) -> ${r.status}: ${(await r.text()).slice(0, 160)}`);
	const id = (await r.json()).data.id as string;
	catCache.set(name, id);
	return id;
}

export type PostResult = 'created' | 'duplicate';

/** 创建一篇 PENDING 文章。422-unique → duplicate;其它错误抛出(由 pipeline 决定重试)。 */
export async function postArticle(lead: Lead, rw: Rewritten, categoryId: string): Promise<PostResult> {
	const body = {
		source_url: lead.sourceUrl,
		source_title: lead.sourceTitle,
		source_site: lead.sourceSite,
		source_published_at: lead.sourcePublishedAt ?? null,
		ai_title: rw.title,
		ai_content: rw.content,
		ai_summary: (rw.summary || rw.title).slice(0, 280),
		content_type: lead.contentType,
		category_id: categoryId,
	};
	const res = await fetch(`${config.DIRECTUS_URL}/items/articles`, { method: 'POST', headers, body: JSON.stringify(body) });
	if (res.ok) return 'created';
	const txt = await res.text();
	if (res.status === 422 && /unique/i.test(txt)) return 'duplicate';
	lg.error({ status: res.status, body: txt.slice(0, 200) }, 'post failed');
	throw new Error(`directus ${res.status}: ${txt.slice(0, 160)}`);
}
