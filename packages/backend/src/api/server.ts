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
import { registerCalendarRoutes } from './calendar-routes.js';
import { registerAlarmRoutes } from './alarm-routes.js';
import { registerAutomationRoutes } from './automation-routes.js';
import { registerAuthRoutes } from './auth-routes.js';
import { registerUserRoutes } from './user-routes.js';
import { registerRolePermissionRoutes } from './role-permission-routes.js';
import { registerInstallerRoutes } from './installer-routes.js';
import { registerSystemRoutes } from './system-routes.js';
import { authenticate } from './auth.js';

// Routes that don't require authentication
const PUBLIC_ROUTES = new Set(['/api/health', '/api/auth/login', '/api/system/app-version']);

/** Paths to omit from HTTP access logs (high-frequency probes). */
const HTTP_LOG_SKIP = new Set(['/api/health']);

export async function createServer() {
  const app = Fastify({ logger: false });

  await app.register(fastifyCors, { origin: true, credentials: true });
  await app.register(fastifyWebsocket);

  app.addHook('onResponse', async (request, reply) => {
    if (process.env.LOG_HTTP === '0') return;
    const path = request.url.split('?')[0];
    if (HTTP_LOG_SKIP.has(path)) return;
    logger.info(
      {
        method: request.method,
        path,
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime ?? 0),
      },
      'HTTP',
    );
  });

  // Parse application/sdp as raw text (for WebRTC SDP proxy)
  app.addContentTypeParser('application/sdp', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  // Parse text/yaml as raw text (for helpers YAML editor)
  app.addContentTypeParser('text/yaml', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  // Global auth hook — skip public routes and WebSocket upgrades
  app.addHook('preHandler', async (req, reply) => {
    if (PUBLIC_ROUTES.has(req.url.split('?')[0])) return;
    if (req.url === '/ws') return; // WebSocket auth handled separately
    await authenticate(req, reply);
  });

  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerRolePermissionRoutes(app);
  registerRoutes(app);
  registerWebSocket(app);
  registerAlarmRoutes(app);
  registerAutomationRoutes(app);
  await registerPaprikaRoutes(app);
  await registerCalendarRoutes(app);
  registerInstallerRoutes(app);
  registerSystemRoutes(app);

  return app;
}

export async function startServer() {
  const app = await createServer();
  await app.listen({ port: appConfig.port, host: appConfig.host });
  logger.info({ port: appConfig.port }, 'HTTP server listening');
  return app;
}
