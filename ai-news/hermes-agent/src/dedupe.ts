// 去重:按 source_url 查 Directus 是否已存在(避免重复抓取/改写/发布)。
// Directus 上 source_url 还有 unique 约束做最终兜底(POST 时 422)。
import { config } from './config';

export async function isDuplicate(sourceUrl: string): Promise<boolean> {
	const url =
		`${config.DIRECTUS_URL}/items/articles` +
		`?filter[source_url][_eq]=${encodeURIComponent(sourceUrl)}&limit=1&fields=id`;
	try {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${config.DIRECTUS_TOKEN}` },
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return false; // 查不了就当不重复,让 POST 的 422 兜底
		const data = (await res.json()).data;
		return Array.isArray(data) && data.length > 0;
	} catch {
		return false;
	}
}
