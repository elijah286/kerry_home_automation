// ---------------------------------------------------------------------------
// Configuration from environment variables
// ---------------------------------------------------------------------------

import { config as loadDotenv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, '../.env') });

export const appConfig = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  postgres: {
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://ha_user:ha_dev_password@localhost:5432/home_automation',
  },

  // Per-integration operational settings (not connection config — that's in DB entries)
  lutron: {
    defaultPort: parseInt(process.env.LUTRON_TLS_PORT ?? '8081', 10),
    insecureTls: process.env.LUTRON_TLS_INSECURE === '1',
  },

  yamaha: {
    pollIntervalMs: parseInt(process.env.YAMAHA_POLL_INTERVAL_MS ?? '5000', 10),
  },

  pentair: {
    pollIntervalMs: parseInt(process.env.PENTAIR_POLL_INTERVAL_MS ?? '10000', 10),
  },

  sony: {
    pollIntervalMs: parseInt(process.env.SONY_POLL_INTERVAL_MS ?? '10000', 10),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET ?? 'ha-dev-secret-change-in-production',
    sessionTtlDays: parseInt(process.env.SESSION_TTL_DAYS ?? '30', 10),
  },
} as const;

