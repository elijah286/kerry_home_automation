// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

import { logger } from './logger.js';
import { appConfig } from './config.js';
import { startServer } from './api/server.js';
import { registry } from './integrations/registry.js';
import { stateStore } from './state/store.js';
import { redis } from './state/redis.js';
import { connectDb, closeDb } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { migrateFromRedis } from './db/integration-config-store.js';
import { historyWriter } from './db/history-writer.js';

// Integrations
import { LutronIntegration } from './integrations/lutron/index.js';
import { YamahaIntegration } from './integrations/yamaha/index.js';

const REDIS_STATE_KEY = 'ha4:device_state';

async function main() {
  logger.info('Starting Home Automation 4.0');

  // 1. Connect Postgres and run migrations
  await connectDb();
  await runMigrations();

  // 2. Connect Redis (already connected via singleton import)
  logger.info('Redis connected');

  // 3. Migrate any integration configs from Redis → Postgres (one-time)
  await migrateFromRedis(redis);

  // 4. Restore device state from Redis
  const saved = await redis.get(REDIS_STATE_KEY);
  if (saved) stateStore.restore(saved);

  // 5. Persist state to Redis on changes (debounced)
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const { eventBus } = await import('./state/event-bus.js');
  eventBus.on('device_updated', () => {
    if (persistTimer) return;
    persistTimer = setTimeout(async () => {
      persistTimer = null;
      try {
        await redis.set(REDIS_STATE_KEY, stateStore.serialize());
      } catch (err) {
        logger.error({ err }, 'Failed to persist state to Redis');
      }
    }, 2000);
  });

  // 6. Start HTTP + WS server
  const server = await startServer();

  // 7. Start state history writer
  historyWriter.start();

  // 8. Register and start integrations
  if (appConfig.lutron.enabled && appConfig.lutron.hosts.length > 0) {
    registry.register(new LutronIntegration());
  }
  if (appConfig.yamaha.enabled && appConfig.yamaha.hosts.length > 0) {
    registry.register(new YamahaIntegration());
  }

  await registry.startAll();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    historyWriter.stop();
    await registry.stopAll();
    if (persistTimer) clearTimeout(persistTimer);
    await redis.set(REDIS_STATE_KEY, stateStore.serialize());
    await redis.quit();
    await closeDb();
    await server.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
