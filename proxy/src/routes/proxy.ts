import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { requireRemoteAuth } from '../auth/middleware.js';
import { tunnelManager } from '../tunnel/manager.js';
import { logger } from '../logger.js';

export async function registerProxyRoutes(app: FastifyInstance): Promise<void> {
  app.all('/api/*', {
    preHandler: [requireRemoteAuth],
  }, async (req, reply) => {
    if (!tunnelManager.isConnected()) {
      return reply.status(503).send({ error: 'home instance not connected' });
    }

    const id = randomUUID();
    const path = req.url;
    const method = req.method;

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }
    delete headers['authorization'];
    delete headers['host'];

    if (req.tunnelUser) {
      headers['x-tunnel-user'] = JSON.stringify(req.tunnelUser);
    }

    let body: string | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      const raw = req.body;
      body = typeof raw === 'string' ? raw : JSON.stringify(raw);
    }

    try {
      const response = await tunnelManager.sendHttpRequest(id, method, path, headers, body);

      reply.status(response.status);
      for (const [key, value] of Object.entries(response.headers)) {
        if (key.toLowerCase() !== 'transfer-encoding') {
          reply.header(key, value);
        }
      }
      return reply.send(response.body ?? '');
    } catch (err) {
      logger.error({ err, path, method }, 'Tunnel HTTP proxy error');
      return reply.status(502).send({ error: 'failed to reach home instance' });
    }
  });
}
