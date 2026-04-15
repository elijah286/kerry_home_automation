// ---------------------------------------------------------------------------
// Roborock cloud login — proxies to Python bridge v2 (admin only)
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { requireRole } from './auth.js';
import { logger } from '../logger.js';
import { registry } from '../integrations/registry.js';
import { RoborockIntegration } from '../integrations/roborock/index.js';
import {
  bridgeLogin,
  bridgeRequestCode,
  isRoborockBridgeConfigured,
} from '../integrations/roborock/bridge-client.js';

const log = logger.child({ integration: 'roborock' });

export function registerRoborockRoutes(app: FastifyInstance): void {
  app.post<{ Body: { email?: string } }>(
    '/api/roborock/request-code',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      if (!isRoborockBridgeConfigured()) {
        log.warn('Roborock request-code: bridge unavailable');
        return reply.code(503).send({
          error:
            'Roborock cloud bridge is not running. Set ROBOROCK_BRIDGE_URL to the bridge service.',
        });
      }
      const email = req.body?.email?.trim();
      if (!email) return reply.code(400).send({ error: 'email required' });
      log.info({ email: email.replace(/@.*/, '@…') }, 'Roborock: sending email verification code via bridge');
      try {
        await bridgeRequestCode(email);
        log.info('Roborock: verification code request succeeded');
        return { ok: true };
      } catch (e) {
        log.warn({ err: String(e) }, 'Roborock: request-code failed');
        return reply.code(400).send({ error: String(e) });
      }
    },
  );

  app.post<{ Body: { email?: string; code?: string } }>(
    '/api/roborock/login',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      if (!isRoborockBridgeConfigured()) {
        return reply.code(503).send({ error: 'Roborock bridge not configured' });
      }
      const email = req.body?.email?.trim();
      const code = req.body?.code?.trim();
      if (!email || !code) return reply.code(400).send({ error: 'email and code required' });
      log.info({ email: email.replace(/@.*/, '@…') }, 'Roborock: completing email login via bridge');
      try {
        const out = await bridgeLogin(email, code);
        log.info({ devices: out.devices?.length ?? 0 }, 'Roborock: login succeeded');
        return {
          session_token: out.session_token,
          user_data: out.user_data,
          base_url: out.base_url,
          devices: out.devices,
        };
      } catch (e) {
        log.warn({ err: String(e) }, 'Roborock: login failed');
        return reply.code(400).send({ error: String(e) });
      }
    },
  );

  app.get<{ Querystring: { deviceId?: string } }>('/api/roborock/map', async (req, reply) => {
    const deviceId = req.query.deviceId?.trim();
    if (!deviceId?.startsWith('roborock.')) {
      return reply.code(400).send({ error: 'deviceId must be a roborock vacuum id' });
    }
    const robo = registry.get('roborock');
    if (!robo) return reply.code(503).send({ error: 'Roborock integration not loaded' });
    const png = (robo as RoborockIntegration).getCachedMap(deviceId);
    if (!png?.length) {
      return reply.code(404).send({ error: 'No map cached yet (cloud Roborock only); wait for the next map refresh.' });
    }
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'private, max-age=15');
    return reply.send(png);
  });
}
