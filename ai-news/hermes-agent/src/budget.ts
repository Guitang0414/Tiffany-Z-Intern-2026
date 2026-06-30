// 每日 token 预算(arch A5)。超限 → 停止 Claude 调用,任务留到下一天继续。
import { config } from './config';
import { retryStore } from './retryStore';

const today = () => new Date().toISOString().slice(0, 10); // UTC 日

export const budget = {
	spent: (): number => retryStore.getTokens(today()),
	remaining: (): number => Math.max(0, config.DAILY_TOKEN_BUDGET - retryStore.getTokens(today())),
	/** 还有预算可花? */
	ok: (): boolean => retryStore.getTokens(today()) < config.DAILY_TOKEN_BUDGET,
	add: (tokens: number): void => retryStore.addTokens(today(), tokens),
};
