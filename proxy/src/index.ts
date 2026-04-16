import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { logger } from './logger.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerProxyRoutes } from './routes/proxy.js';
import { registerSignalingRoutes } from './routes/signaling.js';
import { registerFrontendRoutes } from './routes/frontend.js';
import { tunnelManager } from './tunnel/manager.js';
import { setupClientWebSocket, handleClientUpgrade } from './ws/client-handler.js';

async function main(): Promise<void> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerSignalingRoutes(app);
  await registerProxyRoutes(app);
  // Frontend catch-all must be registered LAST (it matches all unhandled paths)
  await registerFrontendRoutes(app);

  const address = await app.listen({ port: config.port, host: config.host });
  logger.info({ address }, 'Proxy server listening');

  tunnelManager.init(app.server);
  setupClientWebSocket(app.server);

  // Central upgrade dispatcher — avoids attaching multiple WSS instances to the
  // same HTTP server, which causes frame corruption (RSV1 bit conflicts).
  app.server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname === '/tunnel') {
      tunnelManager.handleUpgrade(request, socket, head);
    } else if (pathname === '/ws') {
      handleClientUpgrade(request, socket, head);
    } else {
      socket.destroy();
    }
  });

  logger.info('Tunnel and client WebSocket handlers initialized');
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start proxy');
  process.exit(1);
});
