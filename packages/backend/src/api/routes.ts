// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import type { DeviceCommand, IntegrationId } from '@ha/shared';
import { KNOWN_INTEGRATIONS } from '@ha/shared';
import { stateStore } from '../state/store.js';
import { registry } from '../integrations/registry.js';
import { redis } from '../state/redis.js';
import { logger } from '../logger.js';
import * as configStore from '../db/integration-config-store.js';
import { query } from '../db/pool.js';

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

  app.get('/api/devices', async (req) => {
    const url = new URL(req.url, 'http://localhost');
    const type = url.searchParams.get('type');
    const integration = url.searchParams.get('integration');
    let devices = stateStore.getAll();
    if (type) devices = devices.filter((d) => d.type === type);
    if (integration) devices = devices.filter((d) => d.integration === integration);
    return { devices };
  });

  app.get<{ Params: { id: string } }>('/api/devices/:id', async (req, reply) => {
    const device = stateStore.get(req.params.id);
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    return { device };
  });

  app.post<{ Params: { id: string }; Body: Omit<DeviceCommand, 'deviceId'> }>(
    '/api/devices/:id/command',
    async (req, reply) => {
      const cmd = { ...req.body, deviceId: req.params.id } as DeviceCommand;
      try {
        await registry.handleCommand(cmd);
        return { ok: true };
      } catch (err) {
        logger.error({ err, cmd }, 'Command failed');
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  // Device state history
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/api/devices/:id/history',
    async (req, reply) => {
      const limit = Math.min(parseInt(req.query.limit ?? '100', 10), 1000);
      try {
        const { rows } = await query<{ state: Record<string, unknown>; changed_at: Date }>(
          'SELECT state, changed_at FROM state_history WHERE device_id = $1 ORDER BY changed_at DESC LIMIT $2',
          [req.params.id, limit],
        );
        return { history: rows.map((r) => ({ state: r.state, changedAt: r.changed_at })) };
      } catch (err) {
        logger.error({ err }, 'Failed to fetch device history');
        return reply.code(500).send({ error: 'Failed to fetch history' });
      }
    },
  );

  // Integrations: return all known + their health + saved config status
  app.get('/api/integrations', async () => {
    const health = registry.getHealthAll();
    const allConfigs = await configStore.getAllConfigs();
    const configMap = new Map(allConfigs.map((c) => [c.id, c]));

    const result: Record<string, { health: { state: string; lastConnected: number | null; lastError: string | null; failureCount: number }; configured: boolean; info: typeof KNOWN_INTEGRATIONS[number] }> = {};

    for (const info of KNOWN_INTEGRATIONS) {
      const h = health[info.id] ?? { state: 'init', lastConnected: null, lastError: null, failureCount: 0 };
      const stored = configMap.get(info.id);
      result[info.id] = { health: h, configured: !!stored, info };
    }
    return { integrations: result };
  });

  // Get saved config for an integration (passwords masked)
  app.get<{ Params: { id: string } }>('/api/integrations/:id/config', async (req, reply) => {
    const id = req.params.id as IntegrationId;
    const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
    if (!info) return reply.code(404).send({ error: 'Unknown integration' });

    const config = await configStore.getConfig(id);
    if (!config) return { config: {}, configured: false };

    // Mask password fields
    const masked = { ...config };
    for (const field of info.configFields) {
      if (field.type === 'password' && masked[field.key]) {
        masked[field.key] = '••••••••';
      }
    }
    return { config: masked, configured: true };
  });

  // Save config for an integration
  app.post<{ Params: { id: string }; Body: Record<string, string> }>('/api/integrations/:id/config', async (req, reply) => {
    const id = req.params.id as IntegrationId;
    const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
    if (!info) return reply.code(404).send({ error: 'Unknown integration' });

    // Merge with existing config (so partial updates work, especially for password fields)
    const existing = await configStore.getConfig(id) ?? {};
    const merged = { ...existing };
    for (const [key, value] of Object.entries(req.body)) {
      if (value !== '••••••••' && value !== '') {
        merged[key] = value;
      }
    }

    await configStore.saveConfig(id, info.name, merged);
    logger.info({ integration: id }, 'Integration config saved to database');
    return { ok: true };
  });

  // Restart an integration (clear cache / reconnect)
  app.post<{ Params: { id: string } }>('/api/integrations/:id/restart', async (req, reply) => {
    const id = req.params.id as IntegrationId;
    const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
    if (!info) return reply.code(404).send({ error: 'Unknown integration' });

    if (id === 'paprika') {
      const keys = await redis.keys('paprika:*');
      if (keys.length > 0) await redis.del(...keys);
      logger.info('Paprika integration restarted (cache cleared)');
      return { ok: true, message: 'Applied' };
    }

    logger.info({ integration: id }, 'Integration restart requested');
    return { ok: true, message: 'Applied' };
  });
}
