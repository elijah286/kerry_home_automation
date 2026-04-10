// ---------------------------------------------------------------------------
// Configuration from environment variables
// ---------------------------------------------------------------------------

import { config as loadDotenv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, '../.env') });

function envList(key: string): string[] {
  return (process.env[key] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

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

  lutron: {
    enabled: process.env.LUTRON_ENABLED !== '0',
    hosts: envList('LUTRON_HOSTS'),
    port: parseInt(process.env.LUTRON_TLS_PORT ?? '8081', 10),
    insecureTls: process.env.LUTRON_TLS_INSECURE === '1',
  },

  yamaha: {
    enabled: process.env.YAMAHA_ENABLED !== '0',
    hosts: envList('YAMAHA_HOSTS'),
    pollIntervalMs: parseInt(process.env.YAMAHA_POLL_INTERVAL_MS ?? '5000', 10),
  },

  paprika: {
    email: process.env.PAPRIKA_EMAIL ?? '',
    password: process.env.PAPRIKA_PASSWORD ?? '',
  },
} as const;
