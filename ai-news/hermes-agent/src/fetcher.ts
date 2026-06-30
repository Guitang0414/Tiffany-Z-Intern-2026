// 取材:Jina Reader(r.jina.ai) + fetcher-service(Agent-Reach wrapper)。
// Jina 用於 Lane A 一般網頁；fetcher-service 用於 Reddit/Twitter(需帳號 auth)。
// 只取正文文本，丟棄圖片(合規：不抓圖)。
import { config } from './config';
import { log } from './logger';

const lg = log('fetcher');

/** 可重试错误(限流/5xx)——pipeline 据此把任务留到下一轮。 */
export class RetryableError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 串行限流:保证两次 Jina 调用间隔 ≥ JINA_MIN_INTERVAL_MS(pipeline 顺序处理,够用)。
let chain: Promise<void> = Promise.resolve();
let lastCall = 0;
function throttle(): Promise<void> {
	chain = chain.then(async () => {
		const wait = config.JINA_MIN_INTERVAL_MS - (Date.now() - lastCall);
		if (wait > 0) await sleep(wait);
		lastCall = Date.now();
	});
	return chain;
}

/** 抓取一个 URL 的干净正文(Markdown,去图)。失败抛 RetryableError(限流/5xx)或普通 Error。 */
export async function fetchFullText(url: string, cap = 8000): Promise<string> {
	await throttle();
	const headers: Record<string, string> = { 'User-Agent': 'hermes-agent/0.1' };
	if (config.JINA_API_KEY) headers.Authorization = `Bearer ${config.JINA_API_KEY}`;
	// 只抽文章主体:否则 Jina 返回整页,前几千字全是导航菜单,模型读到的是菜单不是文章。
	headers['X-Target-Selector'] = 'article, main, [role="main"]';

	let res: Response;
	try {
		res = await fetch('https://r.jina.ai/' + url, { headers, signal: AbortSignal.timeout(50_000) });
	} catch (err) {
		throw new RetryableError(`jina network error: ${(err as Error).message}`);
	}

	if (res.status === 429 || res.status === 451 || res.status >= 500) {
		throw new RetryableError(`jina ${res.status} for ${url}`);
	}
	if (!res.ok) throw new Error(`jina ${res.status} for ${url}`);

	const text = await res.text();
	const noImages = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ''); // 去掉 Markdown 图片
	// Jina 偶尔 200 但正文是错误页(如 Reddit 403)。短 + 含错误标记 → 当取材失败,别拿去改写。
	if (noImages.length < 800 && /Target URL returned error|returned error \d{3}|\b40[34]\b.*(Forbidden|Not Found)/i.test(noImages)) {
		throw new RetryableError(`jina returned error page for ${url}`);
	}
	// 取实际正文(Jina 头部是 Title:/URL Source:/Markdown Content:);X-Target-Selector 后这里已是干净文章
	const body = noImages.includes('Markdown Content:') ? noImages.split('Markdown Content:').pop()!.trim() : noImages;
	// 正文近乎为空 = 取材失败/付费墙截断/选择器没命中 → 跳过(截断稿由 pipeline 守卫+最小长度兜底)。
	if (body.length < 400) {
		throw new RetryableError(`thin content for ${url} (body ${body.length} chars)`);
	}
	lg.debug({ url, len: body.length }, 'fetched');
	return body.slice(0, cap); // 返回干净正文(不是整页),模型才读得到真文章
}

/**
 * 透過 fetcher-service (Agent-Reach) 取 Reddit/Twitter 正文。
 * FETCHER_URL 未設定時拋 RetryableError，由 pipeline 降級到 rssContent。
 */
export async function fetchViaAgentReach(url: string, platform: string, cap = 8000): Promise<string> {
	if (!config.FETCHER_URL) {
		throw new RetryableError('FETCHER_URL not configured — fetcher-service not deployed');
	}
	let res: Response;
	try {
		res = await fetch(`${config.FETCHER_URL}/fetch`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url, platform }),
			signal: AbortSignal.timeout(45_000),
		});
	} catch (err) {
		throw new RetryableError(`fetcher-service network error: ${(err as Error).message}`);
	}
	// 503 = backend not auth'd yet → retryable (不要浪費 manual_review slot)
	if (res.status === 503) throw new RetryableError(`fetcher-service 503 (${platform} backend not ready)`);
	if (!res.ok) throw new Error(`fetcher-service ${res.status} for ${url}`);
	const data = await res.json() as { text: string };
	if (!data.text || data.text.length < 100) {
		throw new RetryableError(`fetcher-service thin content (${data.text?.length ?? 0} chars) for ${url}`);
	}
	lg.debug({ url, platform, len: data.text.length }, 'fetched via agent-reach');
	return data.text.slice(0, cap);
}
