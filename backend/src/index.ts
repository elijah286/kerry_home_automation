import { config } from './config/index.js';
import { logger } from './logger.js';
import { initRedisStore } from './state/redis-store.js';
import { stateManager } from './state/manager.js';
import { historyWriter } from './state/history.js';
import { initDb } from './db/pool.js';
import { startRestApi } from './api/rest.js';
import { startWebSocketServer } from './api/websocket.js';
import { bridgeManager } from './bridges/index.js';
import { eventBus } from './state/event-bus.js';
import { LightNeedEngine } from './automation/light-need-engine.js';
import { modeMachine } from './automation/mode-machine.js';
import { presenceFusionEngine } from './automation/presence.js';
import { automationEngine } from './automation/engine.js';
import { allRules } from './automation/rules/index.js';

const SHUTDOWN_TIMEOUT_MS = 8_000;

let lightNeedEngine: LightNeedEngine | null = null;
let fastifyServer: import('fastify').FastifyInstance | null = null;
let wss: import('ws').WebSocketServer | null = null;

async function main(): Promise<void> {
  logger.info({ env: config.env }, 'Starting home automation backend');

  logger.info('Connecting to PostgreSQL...');
  await initDb();

  logger.info('Connecting to Redis...');
  await initRedisStore();

  logger.info('Initializing state manager...');
  await stateManager.init();

  logger.info('Starting history writer...');
  historyWriter.start();

  logger.info('Starting REST API...');
  fastifyServer = await startRestApi();

  logger.info('Starting WebSocket server...');
  wss = startWebSocketServer();

  logger.info('Starting light need engine...');
  lightNeedEngine = new LightNeedEngine({
    lat: config.location.lat,
    lon: config.location.lon,
  });
  await lightNeedEngine.init();

  logger.info('Starting mode state machine...');
  modeMachine.init();

  logger.info('Starting presence fusion engine...');
  presenceFusionEngine.init();

  if (config.readOnly) {
    logger.info('READ-ONLY MODE: skipping automation engine and rule registration');
  } else {
    logger.info('Starting automation engine...');
    await automationEngine.init();

    logger.info({ count: allRules.length }, 'Registering automation rules...');
    for (const rule of allRules) {
      automationEngine.register(rule);
    }
    logger.info({ count: allRules.length }, 'All automation rules registered');
  }

  logger.info('Connecting bridges...');
  await bridgeManager.connectAll();

  if (config.readOnly) {
    logger.info('READ-ONLY MODE: command-to-bridge wiring disabled');
  } else {
    eventBus.on('command', (event) => {
      void bridgeManager.sendCommand(event.entity_id, event.command, event.data).catch((err) => {
        logger.error({ err, event }, 'Bridge command failed');
      });
    });
  }

  logger.info(
    {
      api: `http://${config.api.host}:${config.api.port}`,
      ws: `ws://${config.ws.host}:${config.ws.port}`,
    },
    'Home automation backend ready',
  );
}

let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('Shutting down...');

  const forceExit = setTimeout(() => {
    logger.warn('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    automationEngine.stop();
    presenceFusionEngine.stop();
    modeMachine.stop();
    lightNeedEngine?.stop();

    await Promise.allSettled([
      fastifyServer?.close(),
      new Promise<void>((resolve) => wss ? wss.close(() => resolve()) : resolve()),
      bridgeManager.disconnectAll(),
      historyWriter.stop(),
    ]);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
  }

  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
