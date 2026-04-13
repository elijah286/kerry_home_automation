// ---------------------------------------------------------------------------
// Configuration from environment variables
// ---------------------------------------------------------------------------

import { config as loadDotenv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, '../.env') });

/** Filled from env, or by the managed Python bridge when `ROBOROCK_BRIDGE_URL` is unset */
export const roborockBridgeSettings: { baseUrl: string; secret: string } = {
  baseUrl: (process.env.ROBOROCK_BRIDGE_URL ?? '').trim(),
  secret: (process.env.ROBOROCK_BRIDGE_SECRET ?? '').trim(),
};

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

  serverInstaller: {
    isoCacheDir: process.env.ISO_CACHE_DIR ?? '/tmp/ha-iso-cache',
    workDir: process.env.ISO_WORK_DIR ?? '/tmp/ha-iso-work',
    ubuntuIsoUrl: process.env.UBUNTU_ISO_URL ??
      'https://releases.ubuntu.com/24.04.2/ubuntu-24.04.2-live-server-amd64.iso',
    /** Must match SHA256SUMS for this URL (Ubuntu occasionally respins the same filename). */
    ubuntuIsoSha256: process.env.UBUNTU_ISO_SHA256 ??
      'd6dab0c3a657988501b4bd76f1297c053df710e06e0c3aece60dead24f270b4d',
    appRepoUrl: process.env.APP_REPO_URL ?? '',
    envFilePath: process.env.ENV_FILE_PATH ?? resolve(__dirname, '../.env'),
    prodComposePath: process.env.PROD_COMPOSE_PATH ?? '/opt/home-automation/docker-compose.prod.yml',
  },
} as const;

