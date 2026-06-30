// 编排:discover → dedupe → fetch → rewrite → budget → publish → retry/cache。
// 低耦合:本模块只调各模块的公开函数,模块之间不互相依赖。
import { discover } from './sources';
import { fetchFullText, fetchViaAgentReach, RetryableError } from './fetcher';
import { rewrite } from './claude';
import { ensureCategory, postArticle, postManualReview, type PostResult } from './publisher';
import { isDuplicate } from './dedupe';
import { isNewsworthy } from './selector';
import { retryStore } from './retryStore';
import { budget } from './budget';
import { config } from './config';
import { log } from './logger';
import type { Lane, Lead, Rewritten } from './types';

const lg = log('pipeline');

async function publish(lead: Lead, rw: Rewritten, category: string, sourceText?: string): Promise<PostResult> {
	return postArticle(lead, rw, await ensureCategory(category), sourceText);
}

/** 改写失败/不合格 → 入库打 manual_intervention_required,而不是只存本地缓存(编辑看不到)。
 *  Directus 写入本身失败(网络/权限)时才退回本地缓存,留到下一轮(reprocessPending 不会重发这类 manual,
 *  所以只是兜底防丢,不会自动重试 —— agent 重启日志能看到 manual_review 计数提醒去查)。 */
async function flagManualReview(lead: Lead, reason: string, sourceText: string, draft?: { title?: string; content?: string }): Promise<void> {
	try {
		await postManualReview(lead, await ensureCategory(lead.defaultCategory), reason, sourceText, draft);
	} catch (err) {
		lg.error({ url: lead.sourceUrl, err: (err as Error).message }, 'manual-review directus post failed — caching locally');
		retryStore.saveManualReview(lead, `${reason} (directus post also failed: ${(err as Error).message})`);
	}
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

type LeadResult = PostResult | 'skip-dup' | 'skip-budget' | 'skip-lowvalue' | 'fetch-fail' | 'manual' | 'post-deferred';

async function processLead(lead: Lead): Promise<LeadResult> {
	if (await isDuplicate(lead.sourceUrl)) return 'skip-dup';
	if (!budget.ok()) return 'skip-budget';
	// 选题:低价值新闻(体育选秀/名人八卦/琐事)在取材前就跳过,省 Jina/Claude
	if (!(await isNewsworthy(lead))) return 'skip-lowvalue';

	let text: string;
	if (lead.fetchMode === 'rss') {
		text = lead.rssContent.trim();
		if (text.length < 150) { lg.debug({ url: lead.sourceUrl }, 'rss content too thin — skip'); return 'fetch-fail'; }
	} else if (lead.fetchMode === 'agent-reach') {
		// Agent-Reach（fetcher-service）取帖子全文。
		// FETCHER_URL 未設 或 rdt-cli 未 auth → RetryableError → 降級用 RSS 內容（薄但不中斷）。
		try {
			text = await fetchViaAgentReach(lead.sourceUrl, lead.platform ?? 'web');
		} catch (err) {
			const rssText = lead.rssContent.trim();
			if (rssText.length < 150) {
				lg.warn({ url: lead.sourceUrl, err: (err as Error).message }, 'agent-reach failed + rss too thin → skip');
				return 'fetch-fail';
			}
			lg.warn({ url: lead.sourceUrl, err: (err as Error).message }, 'agent-reach failed → falling back to rss content');
			text = rssText;
		}
	} else {
		try {
			text = await fetchFullText(lead.sourceUrl);
		} catch (err) {
			const kind = err instanceof RetryableError ? 'retryable' : 'error';
			lg.warn({ url: lead.sourceUrl, kind, err: (err as Error).message }, 'fetch failed (skip; 下輪 RSS 再現)');
			return 'fetch-fail';
		}
	}

	let rw: Rewritten;
	try {
		const out = await rewrite(lead, text);
		budget.add(out.usage.totalTokens);
		rw = out.rewritten;
	} catch (err) {
		await flagManualReview(lead, `rewrite: ${(err as Error).message}`, text);
		return 'manual';
	}
	if (!rw.title || !rw.content) {
		await flagManualReview(lead, 'rewrite parse empty', text);
		return 'manual';
	}
	// 取不到/截斷正文時模型會寫「內容缺失/無從獲取/不在已知資訊」這類元說明 → 別建成文章
	// 正則同時覆蓋簡體與繁體，避免切換語言後漏判。
	if (/截[断斷]|[内內]容缺失|[无無][从從](获取|獲取|[确確][认認]|知[晓曉]|得知)|不在已知[信資][息訊]|已知[信資][息訊]之[内內]|不得而知|未能.{0,8}([呈][现現]|提供|[获獲]取|[加载]|[載]入|[核][实實])|[无無][法].{0,10}([撰][写寫]|[核][实實]|[报報][道]|[进進]一步|完整|[呈][现現]|[获獲]取)|([访訪]问|查看|[参參][见見]|[详詳][见見]|[请請]看|前往).{0,12}原文|[获獲]取完整[报報][道]|原文([链鏈][接]|[网網][址])/.test(rw.content)) {
		await flagManualReview(lead, 'source unavailable/truncated (model wrote a meta-disclaimer)', text, rw);
		return 'manual';
	}
	// 确定性兜底:改写太短 = 取材不足/失败,不够格当文章(不靠穷举措辞)
	const minLen = lead.contentType === 'ARTICLE' ? 400 : 120;
	const bodyLen = rw.content.replace(/\s/g, '').length;
	if (bodyLen < minLen) {
		await flagManualReview(lead, `content too short (${bodyLen} chars for ${lead.contentType})`, text, rw);
		return 'manual';
	}

	try {
		return await publish(lead, rw, lead.defaultCategory, text);
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
	let published = 0; // 只数真正建成的(MAX_PER_RUN 限的是发布量)
	let attempts = 0; // 取材/改写过的(防极端情况狂调 Claude)
	const attemptCap = config.MAX_PER_RUN * 4;
	for (const lead of leads) {
		if (published >= config.MAX_PER_RUN || attempts >= attemptCap) break;
		const r = await processLead(lead);
		tally[r] = (tally[r] ?? 0) + 1;
		if (r === 'created') published++;
		// dedupe/低价值/预算跳过很便宜,不计入 attempt;做了取材改写的才计
		if (r !== 'skip-dup' && r !== 'skip-lowvalue' && r !== 'skip-budget') attempts++;
		if (r === 'skip-budget') { lg.warn('每日 token 预算用尽 — 停止本轮 Claude 调用'); break; }
	}
	lg.info({ lane, ms: Date.now() - t0, tally, manualReview: retryStore.countByStatus('manual_review') }, 'run done');
}
