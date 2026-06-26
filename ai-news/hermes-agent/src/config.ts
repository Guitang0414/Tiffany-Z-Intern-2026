// 配置:从环境变量读取 + zod 校验。禁止硬编码;启动即校验,缺关键项直接报错退出。
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
	DIRECTUS_URL: z.string().url(),
	DIRECTUS_TOKEN: z.string().min(1),

	GATEWAY_BASE_URL: z.string().url(),
	GATEWAY_API_KEY: z.string().min(1),
	MODEL_DEEP: z.string().default('claude-sonnet-4-6'),
	MODEL_SHORT: z.string().default('claude-haiku-4-5-20251001'),

	JINA_API_KEY: z.string().optional().default(''),
	JINA_MIN_INTERVAL_MS: z.coerce.number().int().nonnegative().default(1500),

	CRON_HIGH: z.string().default('*/10 * * * *'),
	CRON_LOW: z.string().default('0 8 * * *'),
	TZ: z.string().default('America/Los_Angeles'),

	DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(500_000),
	SQLITE_PATH: z.string().default('./cache/hermes.db'),
	MAX_PER_RUN: z.coerce.number().int().positive().default(8),

	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof schema>;

function load(): Config {
	const parsed = schema.safeParse(process.env);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
		// eslint-disable-next-line no-console
		console.error(`[config] 环境变量校验失败:\n${issues}`);
		process.exit(1);
	}
	return parsed.data;
}

export const config = load();
