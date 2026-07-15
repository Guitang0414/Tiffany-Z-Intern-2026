// 自带 cron(deployment-plan §4.2.1 / arch O2)。高频→Lane B 热点,低频→Lane A 深度。
// 每个 lane 各自一把锁(同 lane 两轮不重叠)。之前是单一全局锁,CRON_HIGH 默认 0 */2 * * *
// 跟 CRON_LOW 默认 0 8 * * * 每天 8 点必撞在一起——B 先注册先拿锁,只要 B 那轮还没跑完
// (比如 Reddit agent-reach 卡到超时),A 当天唯一一次触发就会被无声跳过、连 manual_review
// 都不会留。Jina 限流已在 fetcher.ts 自己的节流队列里全局排队,budget 落盘是单条原子 SQL
// UPDATE,两个 lane 各跑各的不会有竞态,不需要靠跨 lane 加锁来保护。
import cron from 'node-cron';
import { config } from './config';
import { runLane } from './pipeline';
import { log } from './logger';
import type { Lane } from './types';

const lg = log('scheduler');
const running: Record<Lane, boolean> = { A: false, B: false };

async function tick(lane: Lane): Promise<void> {
	if (running[lane]) { lg.warn({ lane }, '上一轮还没跑完 — 跳过本次触发'); return; }
	running[lane] = true;
	try {
		await runLane(lane);
	} catch (err) {
		lg.error({ lane, err: (err as Error).message }, 'run crashed');
	} finally {
		running[lane] = false;
	}
}

export function startScheduler(): void {
	cron.schedule(config.CRON_HIGH, () => void tick('B'), { timezone: config.TZ });
	cron.schedule(config.CRON_LOW, () => void tick('A'), { timezone: config.TZ });
	lg.info({ high: config.CRON_HIGH, low: config.CRON_LOW, tz: config.TZ }, 'scheduler started');
}
