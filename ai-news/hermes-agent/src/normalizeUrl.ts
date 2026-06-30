// source_url 规范化,与 articles-hooks 的 normalizeSourceUrl 完全一致(deployment-plan §4.3.6)。
// 让 agent 端 dedupe 查询 + 入库的 URL 跟 Directus hook 存的规范化形式对齐 ——
// 否则尾斜杠/utm 差异会导致 dedupe 漏判 + POST 撞 unique。
const TRACKING = /^(utm_|fbclid|gclid|ref_|aff_)/i;

export function normalizeUrl(raw: string): string | null {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return null;
	}
	url.protocol = 'https:'; // 强制 https(URL 解析已把 host 小写)
	url.hash = ''; // 去 fragment
	for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
	let path = url.pathname; // 去单个尾斜杠(根 "/" 保留)
	if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
	const query = url.searchParams.toString();
	return `https://${url.host}${path}${query ? `?${query}` : ''}`;
}
