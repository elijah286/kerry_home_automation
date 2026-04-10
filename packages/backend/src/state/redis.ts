// ---------------------------------------------------------------------------
// Redis singleton
// ---------------------------------------------------------------------------

import { Redis } from 'ioredis';
import { appConfig } from '../config.js';
import { logger } from '../logger.js';

export const redis = new Redis(appConfig.redis.url);
redis.on('error', (err: Error) => logger.error({ err }, 'Redis error'));
