import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import type { SystemMode, Area, Floor } from '@home-automation/shared';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { stateManager } from '../state/manager.js';
import { query } from '../db/pool.js';
import { eventBus } from '../state/event-bus.js';
import { areaLightingConfigStore, type AreaLightingConfig } from '../automation/area-lighting-config.js';
import { registerJwt, authenticate, type JwtPayload } from '../auth/jwt.js';
import { requireRole, filterByUserAreas } from '../auth/middleware.js';
import { registerAuthRoutes } from './auth-routes.js';
import { registerKioskRoutes } from './kiosk-routes.js';
import { registerPaprikaRoutes } from './paprika-routes.js';

const SYSTEM_MODES: SystemMode[] = [
  'night',
  'morning',
  'day',
  'evening',
  'late_evening',
  'late_night',
];

const startTime = Date.now();

export async function startRestApi(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await registerJwt(app);

  // --- Public / auth routes ---
  app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));
  await registerAuthRoutes(app);
  await registerKioskRoutes(app);
  await registerPaprikaRoutes(app);

  // --- Protected routes (all require valid JWT) ---

  app.get('/api/floors', { preHandler: [authenticate] }, async () => {
    const { rows } = await query<Floor>('SELECT id, name, level FROM floors ORDER BY level NULLS LAST, name');
    return { floors: rows };
  });

  app.get('/api/areas', { preHandler: [authenticate] }, async (req) => {
    const user = req.user as JwtPayload;
    const { rows } = await query<Area & { floor_name: string | null }>(
      `SELECT a.id, a.name, a.floor_id, a.icon, f.name as floor_name
       FROM areas a LEFT JOIN floors f ON a.floor_id = f.id
       ORDER BY f.level NULLS LAST, a.name`,
    );
    let areas = rows.map((r) => ({
      id: r.id,
      name: r.name,
      floor_id: r.floor_id,
      icon: r.icon,
      area_id: r.id,
      floor: r.floor_id ? { id: r.floor_id, name: r.floor_name } : null,
    }));
    if (user.role !== 'admin' && user.allowed_areas !== null) {
      areas = filterByUserAreas(areas, user.allowed_areas);
    }
    return { areas };
  });

  app.get<{
    Querystring: { domain?: string; area_id?: string };
  }>('/api/entities', { preHandler: [authenticate] }, async (req) => {
    const user = req.user as JwtPayload;
    const { domain, area_id } = req.query;
    let states = area_id
      ? await stateManager.getStatesByArea(area_id)
      : await stateManager.getAllStates();
    if (domain) {
      states = states.filter((s) => s.domain === domain);
    }
    if (user.role !== 'admin' && user.allowed_areas !== null) {
      const allowedSet = new Set(user.allowed_areas);
      states = states.filter((s) => {
        const areaId = s.attributes.area_id as string | undefined;
        return areaId == null || allowedSet.has(areaId);
      });
    }
    return { entities: states };
  });

  app.get<{ Params: { entity_id: string } }>(
    '/api/entities/:entity_id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const state = await stateManager.getEntityState(req.params.entity_id);
      if (!state) {
        return reply.status(404).send({ error: 'entity not found' });
      }
      return { entity: state };
    },
  );

  app.get<{
    Params: { entity_id: string };
    Querystring: { start?: string; end?: string; limit?: string };
  }>('/api/entities/:entity_id/history', { preHandler: [authenticate] }, async (req, reply) => {
    const { entity_id } = req.params;
    const start = req.query.start ? new Date(req.query.start) : null;
    const end = req.query.end ? new Date(req.query.end) : null;
    const limit = Math.min(
      Math.max(parseInt(req.query.limit ?? '100', 10) || 100, 1),
      5000,
    );
    if (start && Number.isNaN(start.getTime())) {
      return reply.status(400).send({ error: 'invalid start' });
    }
    if (end && Number.isNaN(end.getTime())) {
      return reply.status(400).send({ error: 'invalid end' });
    }
    const params: unknown[] = [entity_id];
    let p = 2;
    let sql = `
      SELECT state, attributes, timestamp
      FROM state_history
      WHERE entity_id = $1`;
    if (start) {
      sql += ` AND timestamp >= $${p}`;
      params.push(start.toISOString());
      p++;
    }
    if (end) {
      sql += ` AND timestamp <= $${p}`;
      params.push(end.toISOString());
      p++;
    }
    sql += ` ORDER BY timestamp DESC LIMIT $${p}`;
    params.push(limit);

    const { rows } = await query<{
      state: string;
      attributes: Record<string, unknown> | null;
      timestamp: Date;
    }>(sql, params);

    return {
      entity_id,
      history: rows.map((r) => ({
        state: r.state,
        attributes: r.attributes,
        timestamp: r.timestamp.toISOString(),
      })),
    };
  });

  app.post<{
    Params: { entity_id: string };
    Body: { command?: string; data?: Record<string, unknown> };
  }>('/api/entities/:entity_id/command', {
    preHandler: [authenticate, requireRole('admin', 'member')],
  }, async (req, reply) => {
    if (config.readOnly) {
      return reply.status(403).send({ error: 'read-only mode: commands disabled' });
    }
    const command = req.body?.command;
    if (!command || typeof command !== 'string') {
      return reply.status(400).send({ error: 'body.command required' });
    }
    stateManager.handleCommand(req.params.entity_id, command, req.body?.data);
    return { ok: true };
  });

  app.get('/api/system/mode', { preHandler: [authenticate] }, async () => {
    const mode = await stateManager.getSystemMode();
    return { mode };
  });

  app.post<{ Body: { mode?: string } }>('/api/system/mode', {
    preHandler: [authenticate, requireRole('admin', 'member')],
  }, async (req, reply) => {
    if (config.readOnly) {
      return reply.status(403).send({ error: 'read-only mode: mode changes disabled' });
    }
    const mode = req.body?.mode;
    if (!mode || typeof mode !== 'string' || !SYSTEM_MODES.includes(mode as SystemMode)) {
      return reply.status(400).send({ error: 'invalid mode' });
    }
    await stateManager.setSystemMode(mode as SystemMode);
    return { mode: await stateManager.getSystemMode() };
  });

  app.get('/api/devices', { preHandler: [authenticate] }, async (req) => {
    const user = req.user as JwtPayload;
    const { rows } = await query<{
      id: string;
      name: string;
      manufacturer: string | null;
      model: string | null;
      area_id: string | null;
      floor_id: string | null;
      protocol: string;
      connection: unknown;
      disabled: boolean;
      created_at: Date;
      updated_at: Date;
      entity_ids: string[] | null;
    }>(
      `SELECT d.id, d.name, d.manufacturer, d.model, d.area_id, a.floor_id,
        d.protocol, d.connection, d.disabled, d.created_at, d.updated_at,
        COALESCE(
          (SELECT array_agg(e.entity_id ORDER BY e.entity_id) FROM entities e WHERE e.device_id = d.id),
          ARRAY[]::text[]
        ) AS entity_ids
       FROM devices d
       LEFT JOIN areas a ON d.area_id = a.id
       ORDER BY d.name`,
    );
    let devices = rows.map((r) => ({
      id: r.id,
      name: r.name,
      manufacturer: r.manufacturer,
      model: r.model,
      area_id: r.area_id,
      floor_id: r.floor_id,
      protocol: r.protocol,
      connection: r.connection,
      disabled: r.disabled,
      entity_ids: r.entity_ids ?? [],
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    }));
    if (user.role !== 'admin' && user.allowed_areas !== null) {
      devices = filterByUserAreas(devices, user.allowed_areas);
    }
    return { devices };
  });

  app.get('/api/stats', { preHandler: [authenticate] }, async () => {
    const entities = await stateManager.getAllStates();
    const { rows: dc } = await query<{ c: string }>(
      'SELECT COUNT(*)::text AS c FROM devices',
    );
    const deviceCount = parseInt(dc[0]?.c ?? '0', 10);
    return {
      entity_count: entities.length,
      device_count: deviceCount,
      uptime_seconds: Math.floor(process.uptime()),
      uptime_ms: Date.now() - startTime,
      event_bus: eventBus.stats,
    };
  });

  // --- Area lighting config CRUD (admin only for writes) ---

  app.get('/api/lighting/config', { preHandler: [authenticate] }, async () => {
    return { configs: areaLightingConfigStore.getAllConfigs() };
  });

  app.get<{ Params: { area_id: string } }>(
    '/api/lighting/config/:area_id',
    { preHandler: [authenticate] },
    async (req) => {
      return { config: areaLightingConfigStore.getConfig(req.params.area_id) };
    },
  );

  app.put<{
    Params: { area_id: string };
    Body: Partial<Omit<AreaLightingConfig, 'area_id'>>;
  }>('/api/lighting/config/:area_id', {
    preHandler: [authenticate, requireRole('admin')],
  }, async (req, reply) => {
    if (config.readOnly) {
      return reply.status(403).send({ error: 'read-only mode: config changes disabled' });
    }
    const { area_id } = req.params;
    const body = req.body ?? {};
    const existing = areaLightingConfigStore.getConfig(area_id);

    const merged: AreaLightingConfig = {
      area_id,
      target_lux: body.target_lux ?? existing.target_lux,
      illuminance_entity_id: body.illuminance_entity_id !== undefined
        ? body.illuminance_entity_id
        : existing.illuminance_entity_id,
      activation_threshold: body.activation_threshold ?? existing.activation_threshold,
      deactivation_threshold: body.deactivation_threshold ?? existing.deactivation_threshold,
      min_hold_seconds: body.min_hold_seconds ?? existing.min_hold_seconds,
      weight_overrides: body.weight_overrides !== undefined
        ? body.weight_overrides
        : existing.weight_overrides,
      enabled: body.enabled ?? existing.enabled,
    };

    if (merged.activation_threshold <= merged.deactivation_threshold) {
      return reply.status(400).send({
        error: 'activation_threshold must be greater than deactivation_threshold',
      });
    }

    await areaLightingConfigStore.upsert(merged);
    return { config: merged };
  });

  app.delete<{ Params: { area_id: string } }>(
    '/api/lighting/config/:area_id',
    { preHandler: [authenticate, requireRole('admin')] },
    async (req, reply) => {
      if (config.readOnly) {
        return reply.status(403).send({ error: 'read-only mode: config changes disabled' });
      }
      const removed = await areaLightingConfigStore.remove(req.params.area_id);
      if (!removed) {
        return reply.status(404).send({ error: 'config not found' });
      }
      return { ok: true };
    },
  );

  app.get('/api/lighting/scores', { preHandler: [authenticate] }, async () => {
    const allStates = stateManager.getAllStates();
    const scores = allStates
      .filter((s) => s.entity_id.endsWith('_light_need_score'))
      .map((s) => ({
        area_id: s.attributes.area_id as string,
        score: parseFloat(s.state),
        raw_score: s.attributes.raw_score as number,
        armed: s.attributes.armed as boolean,
        signals: s.attributes.signals,
        weights: s.attributes.weights,
        last_updated: s.last_updated,
      }));
    return { scores };
  });

  const addr = await app.listen({
    host: config.api.host,
    port: config.api.port,
  });
  logger.info({ addr }, 'REST API listening');
  return app;
}
