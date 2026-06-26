// 编排:discover → dedupe → fetch → rewrite → budget → publish → retry/cache。
// 低耦合:本模块只调各模块的公开函数,模块之间不互相依赖。
import { discover } from './sources';
import { fetchFullText, RetryableError } from './fetcher';
import { rewrite } from './claude';
import { ensureCategory, postArticle, type PostResult } from './publisher';
import { isDuplicate } from './dedupe';
import { retryStore } from './retryStore';
import { budget } from './budget';
import { config } from './config';
import { log } from './logger';
import type { Lane, Lead, Rewritten } from './types';

const lg = log('pipeline');

async function publish(lead: Lead, rw: Rewritten, category: string): Promise<PostResult> {
	return postArticle(lead, rw, await ensureCategory(category));
}

/** 先重发上轮没写成功的(D2)。 */
async function reprocessPending(): Promise<void> {
	const pending = retryStore.listPending();
	if (!pending.length) return;
	lg.info({ count: pending.length }, 'reprocessing pending_writeback');
	for (const p of pending) {
		try {
			const r = await publish(p.lead, p.rewritten, p.category);
			retryStore.remove(p.lead.sourceUrl);
			lg.info({ url: p.lead.sourceUrl, result: r }, 'pending re-posted');
		} catch (err) {
			retryStore.savePending(p.lead, p.rewritten, p.category, (err as Error).message);
			lg.warn({ url: p.lead.sourceUrl, err: (err as Error).message }, 'pending still failing');
		}
	}
}

type LeadResult = PostResult | 'skip-dup' | 'skip-budget' | 'fetch-fail' | 'manual' | 'post-deferred';

async function processLead(lead: Lead): Promise<LeadResult> {
	if (await isDuplicate(lead.sourceUrl)) return 'skip-dup';
	if (!budget.ok()) return 'skip-budget';

	let text: string;
	if (lead.fetchMode === 'rss') {
		// Reddit 等:帖子页被 Jina 403,直接用 RSS 内容。太薄就跳过(别浪费 manual_review)。
		text = lead.rssContent.trim();
		if (text.length < 150) { lg.debug({ url: lead.sourceUrl }, 'rss content too thin — skip'); return 'fetch-fail'; }
	} else {
		try {
			text = await fetchFullText(lead.sourceUrl);
		} catch (err) {
			const kind = err instanceof RetryableError ? 'retryable' : 'error';
			lg.warn({ url: lead.sourceUrl, kind, err: (err as Error).message }, 'fetch failed (skip; 下轮 RSS 再现)');
			return 'fetch-fail';
		}
	}

	let rw: Rewritten;
	try {
		const out = await rewrite(lead, text);
		budget.add(out.usage.totalTokens);
		rw = out.rewritten;
	} catch (err) {
		retryStore.saveManualReview(lead, `rewrite: ${(err as Error).message}`);
		return 'manual';
	}
	if (!rw.title || !rw.content) {
		retryStore.saveManualReview(lead, 'rewrite parse empty');
		return 'manual';
	}

	try {
		return await publish(lead, rw, lead.defaultCategory);
	} catch (err) {
		retryStore.savePending(lead, rw, lead.defaultCategory, (err as Error).message); // 改写没丢,下轮重发
		return 'post-deferred';
	}
}

/** 跑一个 lane:重发 pending → 发现 → 逐条处理(限 MAX_PER_RUN 篇新文章)。 */
export async function runLane(lane: Lane): Promise<void> {
	const t0 = Date.now();
	lg.info({ lane, budgetRemaining: budget.remaining() }, 'run start');
	await reprocessPending();

	const leads = await discover(lane);
	const tally: Record<string, number> = {};
	let processed = 0;
	for (const lead of leads) {
		if (processed >= config.MAX_PER_RUN) break;
		const r = await processLead(lead);
		tally[r] = (tally[r] ?? 0) + 1;
		if (r !== 'skip-dup') processed++; // 重复的不占额度
		if (r === 'skip-budget') { lg.warn('每日 token 预算用尽 — 停止本轮 Claude 调用'); break; }
	}
	lg.info({ lane, ms: Date.now() - t0, tally, manualReview: retryStore.countByStatus('manual_review') }, 'run done');
}
