// 统一结构化日志(pino)。模块各自 logger.child({ mod: '...' })。
import pino from 'pino';
import { config } from './config';

export const logger = pino({
	level: config.LOG_LEVEL,
	transport:
		process.env.NODE_ENV === 'production'
			? undefined
			: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } },
});

export const log = (mod: string) => logger.child({ mod });
