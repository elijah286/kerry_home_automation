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
    const method = req.method;

    // Strip the ?token= query param before forwarding — the backend doesn't
    // know about Supabase tokens and the auth has already been validated.
    let path = req.url;
    try {
      const u = new URL(path, 'http://localhost');
      if (u.searchParams.has('token')) {
        u.searchParams.delete('token');
        path = u.pathname + (u.search || '');
      }
    } catch { /* keep original */ }

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
        const lower = key.toLowerCase();
        // transfer-encoding / content-length are managed by Fastify's reply —
        // forwarding them corrupts chunked responses.
        if (lower === 'transfer-encoding' || lower === 'content-length') continue;
        reply.header(key, value);
      }

      if (response.kind === 'streaming') {
        // If the remote client disconnects, tell the home to abort the fetch so
        // we stop pushing chunks into the void. cancelStream is idempotent —
        // after normal http_stream_end the pending entry is gone and cancel
        // becomes a no-op, so firing this on every close is safe.
        req.raw.on('close', () => { tunnelManager.cancelStream(id); });

        const streamState = response.stream as unknown as {
          readableEnded?: boolean;
          readableLength?: number;
          destroyed?: boolean;
        };
        logger.info(
          {
            id,
            path,
            status: response.status,
            contentType: response.headers['content-type'],
            streamEnded: streamState.readableEnded,
            bufferedBytes: streamState.readableLength,
            destroyed: streamState.destroyed,
          },
          'proxy streaming reply.send',
        );

        let bytesWritten = 0;
        response.stream.on('data', (chunk: Buffer) => { bytesWritten += chunk.length; });
        response.stream.on('end', () => {
          logger.info({ id, path, bytesWritten }, 'proxy streaming source ended');
        });
        response.stream.on('error', (err) => {
          logger.warn({ err, path }, 'Streaming tunnel response errored');
        });
        req.raw.on('finish', () => {
          logger.info({ id, path, bytesWritten }, 'proxy streaming reply finished');
        });

        return reply.send(response.stream);
      }

      // Buffered — decode base64 for binary bodies, otherwise send text.
      if (response.bodyEncoding === 'base64' && response.body) {
        return reply.send(Buffer.from(response.body, 'base64'));
      }
      return reply.send(response.body ?? '');
    } catch (err) {
      logger.error({ err, path, method }, 'Tunnel HTTP proxy error');
      return reply.status(502).send({ error: 'failed to reach home instance' });
    }
  });
}
