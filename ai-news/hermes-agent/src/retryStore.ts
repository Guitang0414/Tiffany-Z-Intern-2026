// 防丢 + 重试 + 预算持久化(better-sqlite3)。对齐 deployment-plan §4.2.7 的 cache 状态机。
// 程序重启后仍能继续重试 pending_writeback、保留 manual_review。
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from './config';
import type { CacheStatus, Lead, Rewritten } from './types';

mkdirSync(dirname(config.SQLITE_PATH), { recursive: true });
const db = new Database(config.SQLITE_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS article_cache (
    source_url  TEXT PRIMARY KEY,
    lead_json   TEXT NOT NULL,
    ai_json     TEXT,
    category    TEXT,
    status      TEXT NOT NULL,
    error_log   TEXT,
    retries     INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS budget (
    day    TEXT PRIMARY KEY,
    tokens INTEGER NOT NULL DEFAULT 0
  );
`);

const now = () => Date.now();

export interface PendingEntry {
	lead: Lead;
	rewritten: Rewritten;
	category: string;
	retries: number;
}

export const retryStore = {
	/** 改写完成但 POST Directus 失败 → 留着下轮重发(D2)。 */
	savePending(lead: Lead, rewritten: Rewritten, category: string, error?: string): void {
		db.prepare(
			`INSERT INTO article_cache (source_url, lead_json, ai_json, category, status, error_log, retries, created_at, updated_at)
       VALUES (@u, @l, @a, @c, 'pending_writeback', @e, 0, @t, @t)
       ON CONFLICT(source_url) DO UPDATE SET ai_json=@a, category=@c, status='pending_writeback', error_log=@e, retries=retries+1, updated_at=@t`,
		).run({ u: lead.sourceUrl, l: JSON.stringify(lead), a: JSON.stringify(rewritten), c: category, e: error ?? null, t: now() });
	},

	/** Claude 永久失败(内容策略/模型错)→ 留人工处理(D3)。 */
	saveManualReview(lead: Lead, error: string): void {
		db.prepare(
			`INSERT INTO article_cache (source_url, lead_json, ai_json, category, status, error_log, retries, created_at, updated_at)
       VALUES (@u, @l, NULL, NULL, 'manual_review', @e, 0, @t, @t)
       ON CONFLICT(source_url) DO UPDATE SET status='manual_review', error_log=@e, updated_at=@t`,
		).run({ u: lead.sourceUrl, l: JSON.stringify(lead), e: error, t: now() });
	},

	listPending(): PendingEntry[] {
		const rows = db
			.prepare(`SELECT * FROM article_cache WHERE status='pending_writeback' ORDER BY created_at`)
			.all() as Array<{ lead_json: string; ai_json: string; category: string; retries: number }>;
		return rows.map((r) => ({ lead: JSON.parse(r.lead_json), rewritten: JSON.parse(r.ai_json), category: r.category, retries: r.retries }));
	},

	countByStatus(status: CacheStatus): number {
		return (db.prepare(`SELECT count(*) c FROM article_cache WHERE status=?`).get(status) as { c: number }).c;
	},

	remove(sourceUrl: string): void {
		db.prepare(`DELETE FROM article_cache WHERE source_url=?`).run(sourceUrl);
	},

	// --- 预算(按 UTC 日累计 token) ---
	addTokens(day: string, n: number): void {
		db.prepare(`INSERT INTO budget (day, tokens) VALUES (@d, @n) ON CONFLICT(day) DO UPDATE SET tokens=tokens+@n`).run({ d: day, n });
	},
	getTokens(day: string): number {
		return (db.prepare(`SELECT tokens FROM budget WHERE day=?`).get(day) as { tokens: number } | undefined)?.tokens ?? 0;
	},
};
