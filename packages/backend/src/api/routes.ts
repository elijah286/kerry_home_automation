// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import type { DeviceCommand, DeviceState, IntegrationId } from '@ha/shared';
import { KNOWN_INTEGRATIONS } from '@ha/shared';
import { stateStore } from '../state/store.js';
import { registry } from '../integrations/registry.js';
import { redis } from '../state/redis.js';
import { logger } from '../logger.js';
import * as configStore from '../db/integration-config-store.js';
import * as entryStore from '../db/integration-entry-store.js';
import { query } from '../db/pool.js';
import { UniFiIntegration } from '../integrations/unifi/index.js';
import WebSocket from 'ws';
import { registerChatRoutes } from './chat.js';
import { registerHelperRoutes } from './helpers-routes.js';
import { registerScreensaverRoutes } from './screensaver-routes.js';
import { registerRoborockRoutes } from './roborock-routes.js';
import { requireRole } from './auth.js';

/** go2rtc waits for this JSON before sending fMP4 over WebSocket (see https://go2rtc.org/internal/api/ws/). */
const GO2RTC_MSE_REQUEST = JSON.stringify({
  type: 'mse',
  value:
    'avc1.640029,avc1.64002A,avc1.640033,hvc1.1.6.L153.B0,mp4a.40.2,mp4a.40.5,flac,opus',
});

export function registerRoutes(app: FastifyInstance): void {
  registerChatRoutes(app);
  registerHelperRoutes(app);
  registerScreensaverRoutes(app);
  registerRoborockRoutes(app);
  app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

  // Camera snapshot — serve from backend cache (instant), fallback to live fetch from integration
  app.get<{ Params: { name: string } }>('/api/cameras/:name/snapshot', async (req, reply) => {
    const unifi = registry.get('unifi') as UniFiIntegration | undefined;
    const cached = unifi?.getCachedSnapshot(req.params.name);

    if (cached) {
      reply.header('Content-Type', 'image/jpeg');
      reply.header('Cache-Control', 'public, max-age=5');
      reply.header('X-Snapshot-Age', String(Date.now() - cached.timestamp));
      return reply.send(cached.buffer);
    }

    // Live fetch through integration
    const go2rtcUrl = unifi?.getGo2rtcUrl(req.params.name);
    if (!go2rtcUrl) return reply.code(503).send({ error: 'UniFi Protect not configured. Add an instance in Integrations.' });

    try {
      const res = await fetch(`${go2rtcUrl}/api/frame.jpeg?src=${encodeURIComponent(req.params.name)}`);
      if (!res.ok) return reply.code(502).send({ error: 'Snapshot unavailable' });
      reply.header('Content-Type', 'image/jpeg');
      reply.header('Cache-Control', 'public, max-age=5');
      const buffer = Buffer.from(await res.arrayBuffer());
      return reply.send(buffer);
    } catch {
      return reply.code(502).send({ error: 'go2rtc not reachable' });
    }
  });

  // Camera live view — proxy go2rtc multipart MJPEG (updates in <img>; works without MSE/WebRTC)
  app.get<{ Params: { name: string } }>('/api/cameras/:name/mjpeg', async (req, reply) => {
    const unifi = registry.get('unifi') as UniFiIntegration | undefined;
    const go2rtcUrl = unifi?.getGo2rtcUrl(req.params.name);
    if (!go2rtcUrl) {
      return reply.code(503).send({ error: 'UniFi Protect not configured. Add an instance in Integrations.' });
    }

    const base = go2rtcUrl.replace(/\/$/, '');
    const url = `${base}/api/stream.mjpeg?src=${encodeURIComponent(req.params.name)}`;
    const ac = new AbortController();
    req.raw.once('close', () => ac.abort());

    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) {
        return reply.code(502).send({ error: 'MJPEG stream unavailable' });
      }
      const body = res.body;
      if (!body) {
        return reply.code(502).send({ error: 'Empty stream' });
      }

      const ct =
        res.headers.get('content-type') ?? 'multipart/x-mixed-replace;boundary=ffmpeg';

      reply.header('Content-Type', ct);
      reply.header('Cache-Control', 'no-cache');
      reply.header('Pragma', 'no-cache');

      // Pass fetch()’s Web ReadableStream through — Fastify streams it via getReader()
      return reply.send(body);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      return reply.code(502).send({ error: 'go2rtc not reachable' });
    }
  });

  // Camera list — returns cameras discovered by the UniFi integration
  app.get('/api/cameras', async () => {
    const unifi = registry.get('unifi') as UniFiIntegration | undefined;
    const names = unifi?.getCameraNames() ?? [];
    return { cameras: names.map((name) => ({ name, label: name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) })) };
  });

  // Camera MSE WebSocket proxy — pipes go2rtc MP4 fragments to browser
  app.get<{ Params: { name: string } }>('/api/cameras/:name/stream', { websocket: true }, (clientSocket, req) => {
    const unifi = registry.get('unifi') as UniFiIntegration | undefined;
    const go2rtcUrl = unifi?.getGo2rtcUrl(req.params.name);
    if (!go2rtcUrl) { clientSocket.close(); return; }
    const wsUrl = go2rtcUrl.replace(/^http/, 'ws');
    const upstream = new WebSocket(`${wsUrl}/api/ws?src=${encodeURIComponent(req.params.name)}`);

    upstream.binaryType = 'arraybuffer';

    upstream.on('open', () => {
      upstream.send(GO2RTC_MSE_REQUEST);
    });

    upstream.on('message', (data, isBinary) => {
      if (clientSocket.readyState !== WebSocket.OPEN) return;
      if (isBinary) {
        clientSocket.send(data as Buffer);
      } else {
        const text = Buffer.isBuffer(data)
          ? data.toString('utf8')
          : typeof data === 'string'
            ? data
            : new TextDecoder().decode(data as ArrayBuffer);
        clientSocket.send(text);
      }
    });

    upstream.on('close', () => {
      if (clientSocket.readyState === clientSocket.OPEN) clientSocket.close();
    });

    upstream.on('error', () => {
      if (clientSocket.readyState === clientSocket.OPEN) clientSocket.close();
    });

    clientSocket.on('message', (data, isBinary) => {
      if (upstream.readyState !== WebSocket.OPEN) return;
      if (isBinary) upstream.send(data as Buffer);
      else upstream.send(Buffer.isBuffer(data) ? data.toString('utf8') : String(data), { binary: false });
    });

    clientSocket.on('close', () => {
      upstream.close();
    });

    clientSocket.on('error', () => {
      upstream.close();
    });
  });

  // Camera WebRTC proxy — SDP exchange through backend instead of direct browser→go2rtc
  app.post<{ Params: { name: string } }>('/api/cameras/:name/webrtc', async (req, reply) => {
    const unifi = registry.get('unifi') as UniFiIntegration | undefined;
    const go2rtcUrl = unifi?.getGo2rtcUrl(req.params.name);
    if (!go2rtcUrl) return reply.code(503).send({ error: 'UniFi Protect not configured' });

    try {
      const res = await fetch(`${go2rtcUrl}/api/webrtc?src=${encodeURIComponent(req.params.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: req.body as string,
      });
      if (!res.ok) return reply.code(502).send({ error: 'WebRTC negotiation failed' });
      const sdp = await res.text();
      reply.header('Content-Type', 'application/sdp');
      return reply.send(sdp);
    } catch {
      return reply.code(502).send({ error: 'go2rtc not reachable' });
    }
  });

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
      const action = 'action' in cmd ? (cmd as { action?: string }).action : undefined;
      logger.info(
        { deviceId: cmd.deviceId, type: cmd.type, action },
        'HTTP device command received — routing to integration',
      );
      try {
        await registry.handleCommand(cmd);
        logger.info(
          { deviceId: cmd.deviceId, type: cmd.type, action },
          'HTTP device command completed successfully',
        );
        return { ok: true };
      } catch (err) {
        logger.error({ err, deviceId: cmd.deviceId, type: cmd.type, action }, 'HTTP device command failed');
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  // Device state history
  app.get<{ Params: { id: string }; Querystring: { limit?: string; from?: string; to?: string } }>(
    '/api/devices/:id/history',
    async (req, reply) => {
      try {
        const from = req.query.from;
        const to = req.query.to;

        if (from) {
          // Time-range query (ascending for graphing)
          const fromDate = new Date(from);
          const toDate = to ? new Date(to) : new Date();
          const { rows } = await query<{ state: Record<string, unknown>; changed_at: Date }>(
            'SELECT state, changed_at FROM state_history WHERE device_id = $1 AND changed_at >= $2 AND changed_at <= $3 ORDER BY changed_at ASC',
            [req.params.id, fromDate, toDate],
          );
          return { history: rows.map((r) => ({ state: r.state, changedAt: r.changed_at })) };
        }

        // Legacy limit-based query (descending, most recent first)
        const limit = Math.min(parseInt(req.query.limit ?? '100', 10), 1000);
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

    const allEntries = await entryStore.getAllEntries();
    const entriesByIntegration = new Map<string, typeof allEntries>();
    for (const e of allEntries) {
      const list = entriesByIntegration.get(e.integration) ?? [];
      list.push(e);
      entriesByIntegration.set(e.integration, list);
    }

    const result: Record<string, { health: { state: string; lastConnected: number | null; lastError: string | null; failureCount: number }; configured: boolean; entries: typeof allEntries; info: typeof KNOWN_INTEGRATIONS[number] }> = {};

    for (const info of KNOWN_INTEGRATIONS) {
      const h = health[info.id] ?? { state: 'init', lastConnected: null, lastError: null, failureCount: 0 };
      const stored = configMap.get(info.id);
      const entries = entriesByIntegration.get(info.id) ?? [];
      result[info.id] = { health: h, configured: !!stored || entries.length > 0, entries, info };
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

  // Save config for an integration (admin only)
  app.post<{ Params: { id: string }; Body: Record<string, string> }>('/api/integrations/:id/config', { preHandler: [requireRole('admin')] }, async (req, reply) => {
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

  // Restart an integration (admin only)
  app.post<{ Params: { id: string } }>('/api/integrations/:id/restart', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const id = req.params.id as IntegrationId;
    const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
    if (!info) return reply.code(404).send({ error: 'Unknown integration' });

    if (id === 'paprika') {
      const keys = await redis.keys('paprika:*');
      if (keys.length > 0) await redis.del(...keys);
      logger.info('Paprika integration restarted (cache cleared)');
      return { ok: true, message: 'Applied' };
    }

    if (id === 'calendar') {
      const keys = await redis.keys(`ical:${id}:*`);
      if (keys.length > 0) await redis.del(...keys);
    }

    try {
      await registry.restart(id);
      return { ok: true, message: 'Restarted' };
    } catch (err) {
      logger.error({ integration: id, err }, 'Integration restart failed');
      return { ok: true, message: 'Applied (restart failed — will retry on next poll)' };
    }
  });

  // Rebuild entry (admin only)
  app.post<{ Params: { id: string; entryId: string } }>('/api/integrations/:id/entries/:entryId/rebuild', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const id = req.params.id as IntegrationId;
    const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
    if (!info) return reply.code(404).send({ error: 'Unknown integration' });

    const entryId = req.params.entryId;

    // Remove devices whose ID contains this entry's UUID (e.g. lutron.{entryId}.zone.X)
    const devices = stateStore.getByIntegration(id);
    let removed = 0;
    for (const d of devices) {
      if (d.id.includes(entryId)) {
        stateStore.remove(d.id);
        removed++;
      }
    }
    logger.info({ integration: id, entryId, removed }, 'Cleared devices for entry rebuild');

    // Clear Paprika cache if applicable
    if (id === 'paprika') {
      const keys = await redis.keys('paprika:*');
      if (keys.length > 0) await redis.del(...keys);
    }
    if (id === 'calendar') {
      await redis.del(`ical:${id}:${entryId}`);
    }

    // Restart the integration to rediscover all entries
    try {
      await registry.restart(id);
    } catch (err) {
      logger.error({ integration: id, err }, 'Integration restart failed during rebuild');
    }

    return { ok: true, message: `Cleared ${removed} devices for entry, rediscovering` };
  });

  // Rebuild all (admin only)
  app.post<{ Params: { id: string } }>('/api/integrations/:id/rebuild', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const id = req.params.id as IntegrationId;
    const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
    if (!info) return reply.code(404).send({ error: 'Unknown integration' });

    const devices = stateStore.getByIntegration(id);
    for (const d of devices) {
      stateStore.remove(d.id);
    }
    logger.info({ integration: id, removed: devices.length }, 'Cleared all devices for rebuild');

    if (id === 'paprika') {
      const keys = await redis.keys('paprika:*');
      if (keys.length > 0) await redis.del(...keys);
    }
    if (id === 'calendar') {
      const keys = await redis.keys(`ical:${id}:*`);
      if (keys.length > 0) await redis.del(...keys);
    }

    try {
      await registry.restart(id);
    } catch (err) {
      logger.error({ integration: id, err }, 'Integration restart failed during rebuild');
    }

    return { ok: true, message: `Cleared ${devices.length} devices, rediscovering` };
  });

  // --- Integration entries (multi-entry support) ---

  app.get<{ Params: { id: string } }>('/api/integrations/:id/entries', async (req, reply) => {
    const id = req.params.id as IntegrationId;
    const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
    if (!info) return reply.code(404).send({ error: 'Unknown integration' });
    const entries = await entryStore.getEntries(id);
    // Mask password fields
    for (const entry of entries) {
      for (const field of info.configFields) {
        if (field.type === 'password' && entry.config[field.key]) {
          entry.config[field.key] = '••••••••';
        }
      }
    }
    return { entries };
  });

  app.post<{ Params: { id: string }; Body: { label: string; config: Record<string, string> } }>(
    '/api/integrations/:id/entries',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      const id = req.params.id as IntegrationId;
      const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
      if (!info) return reply.code(404).send({ error: 'Unknown integration' });

      const entryId = crypto.randomUUID();
      await entryStore.saveEntry({
        id: entryId,
        integration: id,
        label: req.body.label || '',
        config: req.body.config,
        enabled: true,
      });
      logger.info({ integration: id, entryId }, 'Integration entry created');

      // Auto-restart so the new entry is picked up
      try { await registry.restart(id); } catch (err) {
        logger.error({ integration: id, err }, 'Auto-restart after entry create failed');
      }

      return { ok: true, id: entryId };
    },
  );

  app.put<{ Params: { id: string; entryId: string }; Body: { label?: string; config?: Record<string, string>; enabled?: boolean } }>(
    '/api/integrations/:id/entries/:entryId',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      const id = req.params.id as IntegrationId;
      const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
      if (!info) return reply.code(404).send({ error: 'Unknown integration' });

      const existing = await entryStore.getEntry(req.params.entryId);
      if (!existing) return reply.code(404).send({ error: 'Entry not found' });

      // Merge config, preserving masked passwords
      const mergedConfig = { ...existing.config };
      if (req.body.config) {
        for (const [key, value] of Object.entries(req.body.config)) {
          if (value !== '••••••••' && value !== '') {
            mergedConfig[key] = value;
          }
        }
      }

      await entryStore.saveEntry({
        ...existing,
        label: req.body.label ?? existing.label,
        config: mergedConfig,
        enabled: req.body.enabled ?? existing.enabled,
      });
      logger.info({ integration: id, entryId: req.params.entryId }, 'Integration entry updated');

      // Auto-restart so updated config takes effect
      try { await registry.restart(id); } catch (err) {
        logger.error({ integration: id, err }, 'Auto-restart after entry update failed');
      }

      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string; entryId: string } }>(
    '/api/integrations/:id/entries/:entryId',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      const existing = await entryStore.getEntry(req.params.entryId);
      if (!existing) return reply.code(404).send({ error: 'Entry not found' });
      await entryStore.deleteEntry(req.params.entryId);
      logger.info({ integration: req.params.id, entryId: req.params.entryId }, 'Integration entry deleted');

      // Auto-restart so removed entry is no longer polled
      const id = req.params.id as IntegrationId;
      try { await registry.restart(id); } catch (err) {
        logger.error({ integration: id, err }, 'Auto-restart after entry delete failed');
      }

      return { ok: true };
    },
  );

  // --- System settings ---

  app.get('/api/settings', async () => {
    const { rows } = await query<{ key: string; value: unknown }>(
      'SELECT key, value FROM system_settings',
    );
    const settings: Record<string, unknown> = {};
    for (const r of rows) settings[r.key] = r.value;
    return { settings };
  });

  app.get<{ Params: { key: string } }>(
    '/api/settings/:key',
    async (req) => {
      const { rows } = await query<{ value: unknown }>(
        'SELECT value FROM system_settings WHERE key = $1',
        [req.params.key],
      );
      return { value: rows[0]?.value ?? null };
    },
  );

  app.put<{ Params: { key: string }; Body: { value: unknown } }>(
    '/api/settings/:key',
    { preHandler: [requireRole('admin')] },
    async (req) => {
      await query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [req.params.key, JSON.stringify(req.body.value)],
      );
      return { ok: true };
    },
  );

  // --- Areas ---

  app.get('/api/areas', async () => {
    const { rows } = await query<{ id: string; name: string; created_at: Date }>(
      'SELECT id, name, created_at FROM areas ORDER BY name',
    );
    return { areas: rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at })) };
  });

  app.post<{ Body: { name: string } }>('/api/areas', { preHandler: [requireRole('admin')] }, async (req) => {
    const { rows } = await query<{ id: string }>(
      'INSERT INTO areas (name) VALUES ($1) RETURNING id',
      [req.body.name],
    );
    return { ok: true, id: rows[0].id };
  });

  app.put<{ Params: { id: string }; Body: { name: string } }>('/api/areas/:id', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const { rowCount } = await query(
      'UPDATE areas SET name = $1 WHERE id = $2',
      [req.body.name, req.params.id],
    );
    if (rowCount === 0) return reply.code(404).send({ error: 'Area not found' });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/areas/:id', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    // Nullify device_settings references
    await query('UPDATE device_settings SET area_id = NULL WHERE area_id = $1', [req.params.id]);
    // Also update in-memory devices that reference this area
    for (const d of stateStore.getAll()) {
      if (d.userAreaId === req.params.id) {
        stateStore.update({ ...d, userAreaId: undefined });
      }
    }
    const { rowCount } = await query('DELETE FROM areas WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return reply.code(404).send({ error: 'Area not found' });
    return { ok: true };
  });

  // --- Per-device settings ---

  // Bulk: all device history settings for the history settings page
  app.get('/api/device-settings/history', async () => {
    const { rows } = await query<{ device_id: string; history_retention_days: number | null; history_enabled: boolean }>(
      'SELECT device_id, history_retention_days, history_enabled FROM device_settings',
    );
    return { settings: rows };
  });

  app.get<{ Params: { id: string } }>('/api/devices/:id/settings', async (req) => {
    const { rows } = await query<{ history_retention_days: number | null; display_name: string | null; area_id: string | null; history_enabled: boolean; aliases: string[] | null }>(
      'SELECT history_retention_days, display_name, area_id, history_enabled, COALESCE(aliases, \'{}\') as aliases FROM device_settings WHERE device_id = $1',
      [req.params.id],
    );
    return { settings: rows[0] ?? { history_retention_days: null, display_name: null, area_id: null, history_enabled: true, aliases: [] } };
  });

  app.put<{ Params: { id: string }; Body: { history_retention_days?: number | null; display_name?: string | null; area_id?: string | null; history_enabled?: boolean; aliases?: string[] } }>(
    '/api/devices/:id/settings',
    { preHandler: [requireRole('admin')] },
    async (req) => {
      const { rows } = await query<{ display_name: string | null; area_id: string | null }>(
        `INSERT INTO device_settings (device_id, history_retention_days, display_name, area_id, history_enabled, aliases, updated_at)
         VALUES ($1, $2, $3, $4, COALESCE($7, TRUE), COALESCE($9, '{}'), NOW())
         ON CONFLICT (device_id) DO UPDATE SET
           history_retention_days = COALESCE($2, device_settings.history_retention_days),
           display_name = CASE WHEN $5 THEN $3 ELSE device_settings.display_name END,
           area_id = CASE WHEN $6 THEN $4 ELSE device_settings.area_id END,
           history_enabled = CASE WHEN $8 THEN $7 ELSE device_settings.history_enabled END,
           aliases = CASE WHEN $10 THEN COALESCE($9, '{}') ELSE device_settings.aliases END,
           updated_at = NOW()
         RETURNING display_name, area_id`,
        [
          req.params.id,
          req.body.history_retention_days ?? null,
          req.body.display_name ?? null,
          req.body.area_id ?? null,
          'display_name' in req.body,
          'area_id' in req.body,
          req.body.history_enabled ?? null,
          'history_enabled' in req.body,
          req.body.aliases ?? null,
          'aliases' in req.body,
        ],
      );

      // Update in-memory device state so WebSocket clients see the change immediately
      const device = stateStore.get(req.params.id);
      if (device) {
        const updated = { ...device };
        if ('display_name' in req.body) {
          updated.displayName = req.body.display_name ?? undefined;
        }
        if ('area_id' in req.body) {
          updated.userAreaId = req.body.area_id ?? undefined;
        }
        if ('aliases' in req.body) {
          updated.aliases = req.body.aliases?.length ? req.body.aliases : undefined;
        }
        stateStore.update(updated);
      }

      return { ok: true };
    },
  );
}
