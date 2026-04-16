// ---------------------------------------------------------------------------
// Frontend catch-all — serves the home's Next.js frontend through the tunnel
// ---------------------------------------------------------------------------
//
// Any request that doesn't match /api/*, /auth/*, /health, /tunnel, or /ws
// is forwarded through the tunnel to the home's Next.js server (port 3001).
// This gives remote users the exact same frontend experience as local users.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { tunnelManager } from '../tunnel/manager.js';
import { logger } from '../logger.js';

/** Paths handled by other route modules — don't catch these. */
const RESERVED_PREFIXES = ['/api/', '/auth/', '/tunnel'];
const RESERVED_EXACT = new Set(['/health', '/ws']);

export async function registerFrontendRoutes(app: FastifyInstance): Promise<void> {
  // Use setNotFoundHandler so we don't conflict with existing route methods
  // (app.all('*') would collide with the proxy's app.all('/api/*') on OPTIONS).
  app.setNotFoundHandler(async (req, reply) => {
    const path = req.url.split('?')[0];

    if (!tunnelManager.isConnected()) {
      return reply
        .status(503)
        .header('content-type', 'text/html')
        .send(
          '<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#111;color:#aaa">' +
          '<div style="text-align:center"><h1 style="color:#f59e0b">Home Offline</h1>' +
          '<p>The home hub is not connected. It may be rebooting or offline.</p>' +
          '<p style="margin-top:1rem"><small>This page will refresh automatically.</small></p></div>' +
          '<script>setTimeout(()=>location.reload(),5000)</script></body></html>',
        );
    }

    const id = randomUUID();

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }
    // Tell the tunnel client this is a frontend request (port 3001)
    headers['x-tunnel-target'] = 'frontend';
    delete headers['host'];

    let body: string | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const raw = req.body;
      body = typeof raw === 'string' ? raw : JSON.stringify(raw);
    }

    try {
      const response = await tunnelManager.sendHttpRequest(
        id,
        req.method,
        req.url,
        headers,
        body,
      );

      reply.status(response.status);
      for (const [key, value] of Object.entries(response.headers)) {
        const lower = key.toLowerCase();
        // Skip hop-by-hop headers
        if (lower === 'transfer-encoding' || lower === 'connection') continue;
        reply.header(key, value);
      }
      return reply.send(response.body ?? '');
    } catch (err) {
      logger.error({ err, path: req.url }, 'Frontend tunnel proxy error');
      return reply.status(502).send({ error: 'failed to reach home frontend' });
    }
  });
}
