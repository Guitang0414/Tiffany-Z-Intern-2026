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
	lg.debug({ url, len: noImages.length }, 'fetched');
	return noImages.slice(0, cap);
}
