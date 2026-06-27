// 取材:Jina Reader(r.jina.ai)。带免费 key(500 RPM)+ 限流兜底 + 退避标记。
// 只取正文文本,丢弃图片(合规:不抓图)。
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
	// 取实际正文(Jina 头部是 Title:/URL Source:/Markdown Content:)
	const body = noImages.includes('Markdown Content:') ? noImages.split('Markdown Content:').pop()!.trim() : noImages;
	// 正文近乎为空 = 取材失败/被屏蔽 → 跳过。
	// ⚠️ 不按 "subscribe/sign in" 字样判付费墙:Jina 返回整页,页眉页脚都带订阅 CTA,会误杀正常全文
	// (如 Seattle Times)。付费墙导致的"只有导语"由 pipeline 的"元说明"守卫兜底(模型会说内容缺失)。
	if (body.length < 500) {
		throw new RetryableError(`thin content for ${url} (body ${body.length} chars)`);
	}
	lg.debug({ url, len: body.length }, 'fetched');
	return noImages.slice(0, cap);
}
