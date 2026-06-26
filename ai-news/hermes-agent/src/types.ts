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
	/** 取材方式:'jina'=抓全文(默认);'rss'=直接用 RSS 自带内容(如 Reddit,Jina 被 403)。 */
	fetchMode: 'jina' | 'rss';
	/** 跳过标题匹配此正则的条目(如 Reddit 的 megathread/周帖,非新闻)。 */
	skip?: RegExp;
}

/** 发现阶段产出:一条待处理的新闻线索 */
export interface Lead {
	sourceUrl: string;
	sourceTitle: string;
	sourceSite: string;
	sourcePublishedAt?: string;
	lane: Lane;
	contentType: ContentType;
	defaultCategory: string;
	fetchMode: 'jina' | 'rss';
	/** RSS 自带内容(fetchMode='rss' 时直接用它,不调 Jina)。 */
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
