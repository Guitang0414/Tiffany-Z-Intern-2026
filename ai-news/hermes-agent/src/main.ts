// 程序入口。常驻:启动 scheduler(自带 cron)+ 开机先跑一轮。
// 测试:--once 跑一轮即退出;--lane=A|B 只跑某 lane。
import { config } from './config';
import { startScheduler } from './scheduler';
import { runLane } from './pipeline';
import { logger, log } from './logger';
import type { Lane } from './types';

const lg = log('main');

async function main(): Promise<void> {
	const once = process.argv.includes('--once');
	const lane = process.argv.find((a) => a.startsWith('--lane='))?.split('=')[1] as Lane | undefined;
	lg.info({ directus: config.DIRECTUS_URL, gateway: config.GATEWAY_BASE_URL, once, lane: lane ?? 'both' }, 'hermes-agent starting');

	if (once) {
		if (lane) await runLane(lane);
		else { await runLane('A'); await runLane('B'); }
		process.exit(0);
	}

	startScheduler();
	// 开机先各跑一轮,别干等到下个 cron 点
	await runLane('A');
	await runLane('B');
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
	process.on(sig, () => { lg.info({ sig }, 'shutting down'); process.exit(0); });
}

main().catch((err) => { logger.error({ err: (err as Error).message }, 'fatal'); process.exit(1); });
