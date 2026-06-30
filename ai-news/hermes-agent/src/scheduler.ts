// 自带 cron(deployment-plan §4.2.1 / arch O2)。高频→Lane B 热点,低频→Lane A 深度。
// 单 running 锁:两轮不重叠(避免 Jina 限流/预算并发争用)。
import cron from 'node-cron';
import { config } from './config';
import { runLane } from './pipeline';
import { log } from './logger';
import type { Lane } from './types';

const lg = log('scheduler');
let running = false;

async function tick(lane: Lane): Promise<void> {
	if (running) { lg.warn({ lane }, '上一轮还没跑完 — 跳过本次触发'); return; }
	running = true;
	try {
		await runLane(lane);
	} catch (err) {
		lg.error({ lane, err: (err as Error).message }, 'run crashed');
	} finally {
		running = false;
	}
}

export function startScheduler(): void {
	cron.schedule(config.CRON_HIGH, () => void tick('B'), { timezone: config.TZ });
	cron.schedule(config.CRON_LOW, () => void tick('A'), { timezone: config.TZ });
	lg.info({ high: config.CRON_HIGH, low: config.CRON_LOW, tz: config.TZ }, 'scheduler started');
}
