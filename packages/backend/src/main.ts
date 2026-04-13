// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

import { logger } from './logger.js';
import { appConfig } from './config.js';
import { startManagedRoborockBridgeIfNeeded, stopManagedRoborockBridge } from './roborock-bridge-spawn.js';
import { startServer } from './api/server.js';
import { registry } from './integrations/registry.js';
import { stateStore } from './state/store.js';
import { redis } from './state/redis.js';
import { connectDb, closeDb } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { migrateFromRedis } from './db/integration-config-store.js';
import { historyWriter } from './db/history-writer.js';
import * as entryStore from './db/integration-entry-store.js';
import { query } from './db/pool.js';

// Integrations
import { LutronIntegration } from './integrations/lutron/index.js';
import { YamahaIntegration } from './integrations/yamaha/index.js';
import { TeslaIntegration } from './integrations/tesla/index.js';
import { PentairIntegration } from './integrations/pentair/index.js';
import { UniFiIntegration } from './integrations/unifi/index.js';
import { PaprikaIntegration } from './integrations/paprika/index.js';
import { SonyIntegration } from './integrations/sony/index.js';
import { WeatherIntegration } from './integrations/weather/index.js';
import { XboxIntegration } from './integrations/xbox/index.js';
import { MerossIntegration } from './integrations/meross/index.js';
import { RoborockIntegration } from './integrations/roborock/index.js';
import { RachioIntegration } from './integrations/rachio/index.js';
import { EcobeeIntegration } from './integrations/ecobee/index.js';
import { EsphomeIntegration } from './integrations/esphome/index.js';
import { WyzeIntegration } from './integrations/wyze/index.js';
import { ZwaveIntegration } from './integrations/zwave/index.js';
import { RingIntegration } from './integrations/ring/index.js';
import { SpeedtestIntegration } from './integrations/speedtest/index.js';
import { UnifiNetworkIntegration } from './integrations/unifi-network/index.js';
import { VizioIntegration } from './integrations/vizio/index.js';
import { SamsungIntegration } from './integrations/samsung/index.js';
import { SpotifyIntegration } from './integrations/spotify/index.js';
import { SunIntegration } from './integrations/sun/index.js';
import { CalendarIntegration } from './integrations/calendar/index.js';
import { RainsoftIntegration } from './integrations/rainsoft/index.js';
import { SenseIntegration } from './integrations/sense/index.js';
import { ScreensaverIntegration } from './integrations/screensaver/index.js';
import { HelpersIntegration } from './integrations/helpers/index.js';
import { automationEngine } from './automations/engine.js';
import { loadRolePermissions } from './api/role-permission-routes.js';

const REDIS_STATE_KEY = 'ha4:device_state';


async function main() {
  logger.info('Starting Home Automation 4.0');

  // 1. Connect Postgres and run migrations
  await connectDb();
  await runMigrations();

  // 2. Seed admin user if no users exist
  {
    const { rows } = await query<{ count: string }>('SELECT COUNT(*) as count FROM users');
    if (parseInt(rows[0].count) === 0) {
      const bcrypt = await import('bcrypt');
      const crypto = await import('node:crypto');
      const password = crypto.randomBytes(12).toString('base64url');
      const hash = await bcrypt.default.hash(password, 12);
      const pin = String(1000 + Math.floor(Math.random() * 9000));
      const pinHash = await bcrypt.default.hash(pin, 12);
      await query(
        "INSERT INTO users (username, display_name, password_hash, pin_hash, role) VALUES ('admin', 'Administrator', $1, $2, 'admin')",
        [hash, pinHash],
      );
      logger.info('==========================================================');
      logger.info(`  Admin user created — username: admin  password: ${password}`);
      logger.info(`  Elevation PIN (4 digits): ${pin}`);
      logger.info('==========================================================');
    }
  }

  // 2b. Load role permission overrides from DB
  await loadRolePermissions();

  // 3. Connect Redis (already connected via singleton import)
  logger.info('Redis connected');

  // 3. Migrate any integration configs from Redis → Postgres (one-time)
  await migrateFromRedis(redis);

  // 4. Restore device state from Redis
  const saved = await redis.get(REDIS_STATE_KEY);
  if (saved) stateStore.restore(saved);

  // 4b. Overlay user display names and area assignments from device_settings
  {
    const { rows } = await query<{ device_id: string; display_name: string | null; area_id: string | null; aliases: string[] | null }>(
      'SELECT device_id, display_name, area_id, aliases FROM device_settings WHERE display_name IS NOT NULL OR area_id IS NOT NULL OR (aliases IS NOT NULL AND array_length(aliases, 1) > 0)',
    );
    for (const row of rows) {
      const device = stateStore.get(row.device_id);
      if (device) {
        const patched = { ...device };
        if (row.display_name) patched.displayName = row.display_name;
        if (row.area_id) patched.userAreaId = row.area_id;
        if (row.aliases?.length) patched.aliases = row.aliases;
        stateStore.update(patched);
      }
    }
    if (rows.length > 0) logger.info({ count: rows.length }, 'Applied device display names / area / alias overrides');
  }

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

  // 6. Roborock Python bridge (auto-start on loopback when ROBOROCK_BRIDGE_URL is unset)
  await startManagedRoborockBridgeIfNeeded();

  // 7. Start HTTP + WS server
  const server = await startServer();

  // 8. Start state history writer
  historyWriter.start();

  // 9. Register and start all integrations (they no-op if no entries configured)
  registry.register(new LutronIntegration());
  registry.register(new YamahaIntegration());
  registry.register(new TeslaIntegration());
  registry.register(new PentairIntegration());
  registry.register(new UniFiIntegration());
  registry.register(new PaprikaIntegration());
  registry.register(new SonyIntegration());
  registry.register(new WeatherIntegration());
  registry.register(new XboxIntegration());
  registry.register(new MerossIntegration());
  registry.register(new RoborockIntegration());
  registry.register(new RachioIntegration());
  registry.register(new EcobeeIntegration());
  registry.register(new EsphomeIntegration());
  registry.register(new WyzeIntegration());
  registry.register(new ZwaveIntegration());
  registry.register(new RingIntegration());
  registry.register(new SpeedtestIntegration());
  registry.register(new UnifiNetworkIntegration());
  registry.register(new VizioIntegration());
  registry.register(new SamsungIntegration());
  registry.register(new SpotifyIntegration());
  registry.register(new SunIntegration());
  registry.register(new CalendarIntegration());
  registry.register(new RainsoftIntegration());
  registry.register(new SenseIntegration());
  registry.register(new ScreensaverIntegration());
  registry.register(new HelpersIntegration());

  await registry.startAll();

  // Validate device hierarchy after all integrations have loaded
  setTimeout(() => stateStore.validateHierarchy(), 15_000);

  // 10. Start automation engine
  await automationEngine.start();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    automationEngine.stop();
    historyWriter.stop();
    await registry.stopAll();
    await stopManagedRoborockBridge();
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
