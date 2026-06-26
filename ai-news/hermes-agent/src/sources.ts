// 新闻源 + RSS 发现。Lane A=西雅图本地深度(ARTICLE),Lane B=热点短讯(SHORT)。
// 发现走 RSS(免费、零 token);Twitter 待定(无 RSS,以后接)。
import Parser from 'rss-parser';
import type { Lane, Lead, SourceFeed } from './types';
import { log } from './logger';

const lg = log('sources');

// defaultCategory 是 taxonomy 未定前的占位;真 AI 分类待 mentor 给正式 category 列表后接入。
export const SOURCES: SourceFeed[] = [
	// Lane A — 西雅图本地 / 官方,深度长文(Jina 抓全文)
	{ name: 'Seattle Times', url: 'https://www.seattletimes.com/feed/', lane: 'A', contentType: 'ARTICLE', defaultCategory: 'Local', fetchMode: 'jina' },
	{ name: 'KING 5', url: 'https://www.king5.com/feeds/syndication/rss/news', lane: 'A', contentType: 'ARTICLE', defaultCategory: 'Local', fetchMode: 'jina' },
	{ name: 'FOX 13 Seattle', url: 'https://www.fox13seattle.com/rss.xml', lane: 'A', contentType: 'ARTICLE', defaultCategory: 'Local', fetchMode: 'jina' },
	{ name: 'MyNorthwest', url: 'https://mynorthwest.com/feed/', lane: 'A', contentType: 'ARTICLE', defaultCategory: 'Local', fetchMode: 'jina' },
	{ name: 'Cascade PBS (Crosscut)', url: 'https://www.cascadepbs.org/articles/briefs/rss/', lane: 'A', contentType: 'ARTICLE', defaultCategory: 'Local', fetchMode: 'jina' },
	{ name: 'GeekWire', url: 'https://www.geekwire.com/feed/', lane: 'A', contentType: 'ARTICLE', defaultCategory: 'Local', fetchMode: 'jina' },
	{ name: 'Port of Seattle', url: 'https://www.portseattle.org/rss.xml', lane: 'A', contentType: 'ARTICLE', defaultCategory: 'Local', fetchMode: 'jina' },
	{ name: 'WSDOT', url: 'https://wsdot.wa.gov/rss.xml', lane: 'A', contentType: 'ARTICLE', defaultCategory: 'Local', fetchMode: 'jina' },
	{ name: 'WA DOH', url: 'https://doh.wa.gov/rss.xml', lane: 'A', contentType: 'ARTICLE', defaultCategory: 'Local', fetchMode: 'jina' },

	// Lane B — 热点短讯。Reddit 帖子页被 Jina 403,故直接用 RSS 内容;跳过 megathread/周帖等非新闻。
	{
		name: 'Reddit r/Seattle', url: 'https://www.reddit.com/r/Seattle/.rss', lane: 'B', contentType: 'SHORT',
		defaultCategory: 'Trending', fetchMode: 'rss', skip: /megathread|weekly|daily|ask r\/seattle|^r\/seattle\b.*\b(thread|w)/i,
	},
];

const parser = new Parser({
	timeout: 15_000,
	headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
});

const cleanUrl = (u: string) => u.split('?')[0].trim();

/** 拉一个源,映射成 Lead[]。单源失败不影响其它源。 */
async function discoverOne(src: SourceFeed): Promise<Lead[]> {
	try {
		const feed = await parser.parseURL(src.url);
		const leads = (feed.items ?? [])
			.filter((it) => it.link && it.title && !(src.skip && src.skip.test(it.title)))
			.map<Lead>((it) => ({
				sourceUrl: cleanUrl(it.link as string),
				sourceTitle: (it.title ?? '').trim(),
				sourceSite: src.name,
				sourcePublishedAt: it.isoDate,
				lane: src.lane,
				contentType: src.contentType,
				defaultCategory: src.defaultCategory,
				fetchMode: src.fetchMode,
				rssContent: (it.contentSnippet || (it as Record<string, unknown>).content || '').toString().slice(0, 4000),
			}));
		lg.info({ source: src.name, count: leads.length }, 'discovered');
		return leads;
	} catch (err) {
		lg.warn({ source: src.name, err: (err as Error).message }, 'discover failed (skipped)');
		return [];
	}
}

/** 发现指定 lane(不传=全部)的所有线索。 */
export async function discover(lane?: Lane): Promise<Lead[]> {
	const feeds = SOURCES.filter((s) => !lane || s.lane === lane);
	const all = await Promise.all(feeds.map(discoverOne));
	return all.flat();
}
