// 共享类型。模块间只依赖这些类型,不互相直接 import 实现(低耦合)。

export type Lane = 'A' | 'B';
export type ContentType = 'ARTICLE' | 'SHORT';

/** 一个 RSS 源的配置 */
export interface SourceFeed {
	name: string;
	url: string;
	lane: Lane;
	contentType: ContentType;
	/** 该源默认分类(taxonomy 未定前的占位;真 AI 分类待 mentor 定 taxonomy 后接） */
	defaultCategory: string;
	/** 取材方式:'jina'=抓全文;'rss'=直接用 RSS 内容;'agent-reach'=走 fetcher-service。 */
	fetchMode: 'jina' | 'rss' | 'agent-reach';
	/** fetchMode='agent-reach' 時傳給 fetcher-service 的平台標識。 */
	platform?: 'reddit' | 'twitter' | 'youtube';
	/** 跳過標題匹配此正則的條目(如 Reddit 的 megathread/週帖，非新聞)。 */
	skip?: RegExp;
}

/** 發現階段產出：一條待處理的新聞線索 */
export interface Lead {
	sourceUrl: string;
	sourceTitle: string;
	sourceSite: string;
	sourcePublishedAt?: string;
	lane: Lane;
	contentType: ContentType;
	defaultCategory: string;
	fetchMode: 'jina' | 'rss' | 'agent-reach';
	/** fetchMode='agent-reach' 時傳給 fetcher-service 的平台標識。 */
	platform?: 'reddit' | 'twitter' | 'youtube';
	/** RSS 自帶內容(fetchMode='rss'/'agent-reach' 降級時用)。 */
	rssContent: string;
}

/** Claude 改写产出 */
export interface Rewritten {
	title: string;
	summary: string;
	content: string; // Markdown
}

/** 一次 Claude 调用的 token 用量 */
export interface Usage {
	totalTokens: number;
}

/** retry 缓存里一条记录的状态(对齐 deployment-plan §4.2.7) */
export type CacheStatus = 'rewritten' | 'pending_writeback' | 'manual_review';
