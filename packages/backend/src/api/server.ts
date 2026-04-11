// ---------------------------------------------------------------------------
// Fastify HTTP + WebSocket server
// ---------------------------------------------------------------------------

import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { appConfig } from '../config.js';
import { logger } from '../logger.js';
import { registerRoutes } from './routes.js';
import { registerWebSocket } from './websocket.js';
import { registerPaprikaRoutes } from './paprika-routes.js';
import { registerAlarmRoutes } from './alarm-routes.js';

export async function createServer() {
  const app = Fastify({ logger: false });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyWebsocket);

  // Parse application/sdp as raw text (for WebRTC SDP proxy)
  app.addContentTypeParser('application/sdp', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  registerRoutes(app);
  registerWebSocket(app);
  registerAlarmRoutes(app);
  await registerPaprikaRoutes(app);

  return app;
}

export async function startServer() {
  const app = await createServer();
  await app.listen({ port: appConfig.port, host: appConfig.host });
  logger.info({ port: appConfig.port }, 'HTTP server listening');
  return app;
}
