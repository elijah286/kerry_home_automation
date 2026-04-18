// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DeviceCommand, DeviceState, IntegrationId } from '@ha/shared';
import { KNOWN_INTEGRATIONS, Permission } from '@ha/shared';
import { stateStore } from '../state/store.js';
import { registry } from '../integrations/registry.js';
import { redis } from '../state/redis.js';
import { logger } from '../logger.js';
import * as configStore from '../db/integration-config-store.js';
import * as entryStore from '../db/integration-entry-store.js';
import * as integrationDebugStore from '../db/integration-debug-store.js';
import { setIntegrationDebugEnabledMemory } from '../integration-debug.js';
import { query } from '../db/pool.js';
import { UniFiIntegration } from '../integrations/unifi/index.js';
import WebSocket from 'ws';
import { registerChatRoutes } from './chat.js';
import { registerTtsRoutes } from './tts.js';
import { registerHelperRoutes } from './helpers-routes.js';
import { registerDashboardRoutes } from './dashboard-routes.js';
import { registerNotificationRoutes } from './notification-routes.js';
import { registerScreensaverRoutes } from './screensaver-routes.js';
import { registerRoborockRoutes } from './roborock-routes.js';
import { registerDeviceCardRoutes } from './device-card-routes.js';
import { registerDeviceClassInferenceRoutes } from './device-class-inference.js';
import { requirePermission, requireRole } from './auth.js';

/** Prevent hung Node fetch() calls when go2rtc or Protect is slow or wedged. */
const GO2RTC_FETCH_INIT_MS = 12_000;
const GO2RTC_WEBRTC_MS = 20_000;

/**
 * Coalesces concurrent snapshot requests for the same camera. When N tiles
 * all ask at the same moment (e.g. initial grid mount), they share a single
 * upstream fetch instead of stampeding go2rtc.
 */
const snapshotInflight = new Map<string, Promise<Buffer>>();

/** go2rtc waits for this JSON before sending fMP4 over WebSocket (see https://go2rtc.org/internal/api/ws/). */
const GO2RTC_MSE_REQUEST = JSON.stringify({
  type: 'mse',
  value:
    'avc1.640029,avc1.64002A,avc1.640033,hvc1.1.6.L153.B0,mp4a.40.2,mp4a.40.5,flac,opus',
});

export function registerRoutes(app: FastifyInstance): void {
  registerChatRoutes(app);
  registerTtsRoutes(app);
  registerHelperRoutes(app);
  registerDashboardRoutes(app);
  registerNotificationRoutes(app);
  registerScreensaverRoutes(app);
  registerRoborockRoutes(app);
  registerDeviceCardRoutes(app);
  registerDeviceClassInferenceRoutes(app);

  // Per-integration verbose logging (system terminal troubleshooting)
  app.get('/api/integrations/debug-logging', { preHandler: [requirePermission(Permission.ManageIntegrations)] }, async () => {
    const stored = await integrationDebugStore.getAllDebugFlags();
    const flags: Record<string, boolean> = {};
    for (const info of KNOWN_INTEGRATIONS) {
      flags[info.id] = stored.get(info.id) === true;
    }
    return { flags };
  });

  app.put<{ Params: { id: string }; Body: { enabled?: boolean } }>(
    '/api/integrations/:id/debug-logging',
    { preHandler: [requirePermission(Permission.ManageIntegrations)] },
    async (req, reply) => {
      const id = req.params.id as IntegrationId;
      if (!KNOWN_INTEGRATIONS.some((i) => i.id === id)) {
        return reply.code(404).send({ error: 'Unknown integration' });
      }
      const enabled = req.body?.enabled === true;
      await integrationDebugStore.setDebugFlag(id, enabled);
      setIntegrationDebugEnabledMemory(id, enabled);
      return { ok: true, enabled };
    },
  );

  app.get('/api/health', async (_req, reply) => {
    // Verify critical dependencies so Docker/deploy health checks are meaningful.
    // If postgres or redis are down, report unhealthy — the sidecar will keep
    // retrying instead of declaring the deploy "complete" prematurely.
    const checks: Record<string, boolean> = { postgres: false, redis: false };
    try {
      await query('SELECT 1');
      checks.postgres = true;
    } catch { /* unhealthy */ }
    try {
      await redis.ping();
      checks.redis = true;
    } catch { /* unhealthy */ }

    const ok = checks.postgres && checks.redis;
    return reply.status(ok ? 200 : 503).send({ ok, time: Date.now(), checks });
  });

  // Camera snapshot — serve from backend cache (instant), with request coalescing
  // so N concurrent clients asking for the same camera share ONE upstream fetch.
  // Also short-cache live fetches for 500ms to absorb tile polling bursts.
  app.get<{ Params: { name: string } }>('/api/cameras/:name/snapshot', async (req, reply) => {
    const unifi = registry.get('unifi') as UniFiIntegration | undefined;
    const cached = unifi?.getCachedSnapshot(req.params.name);

    if (cached) {
      reply.header('Content-Type', 'image/jpeg');
      // Allow browsers/proxies to coalesce duplicate concurrent tile fetches
      reply.header('Cache-Control', 'private, max-age=1');
      reply.header('X-Snapshot-Age', String(Date.now() - cached.timestamp));
      return reply.send(cached.buffer);
    }

    // Coalesce concurrent live fetches for the same camera — multiple tiles
    // requesting simultaneously should share one upstream request.
    const coalesceKey = req.params.name;
    const inflight = snapshotInflight.get(coalesceKey);
    if (inflight) {
      try {
        const buf = await inflight;
        reply.header('Content-Type', 'image/jpeg');
        reply.header('Cache-Control', 'private, max-age=1');
        return reply.send(buf);
      } catch {
        return reply.code(502).send({ error: 'Snapshot unavailable' });
      }
    }

    // Live fetch through integration
    const go2rtcUrl = unifi?.getGo2rtcUrl(req.params.name);
    if (!go2rtcUrl) return reply.code(503).send({ error: 'UniFi Protect not configured. Add an instance in Integrations.' });

    const fetchPromise = (async () => {
      const res = await fetch(`${go2rtcUrl}/api/frame.jpeg?src=${encodeURIComponent(req.params.name)}`, {
        signal: AbortSignal.timeout(GO2RTC_FETCH_INIT_MS),
      });
      if (!res.ok) throw new Error('Snapshot unavailable');
      return Buffer.from(await res.arrayBuffer());
    })();
    snapshotInflight.set(coalesceKey, fetchPromise);
    // Clear the inflight entry once resolved/rejected so subsequent requests
    // can trigger a new fetch after the cache would have gone stale.
    fetchPromise.finally(() => snapshotInflight.delete(coalesceKey));

    try {
      const buffer = await fetchPromise;
      reply.header('Content-Type', 'image/jpeg');
      reply.header('Cache-Control', 'private, max-age=1');
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
      // No blanket fetch timeout: MJPEG is long-lived — a global AbortSignal.timeout would
      // kill healthy streams after N seconds. Client abort (`ac`) still ends the proxy.
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

  // ---------------------------------------------------------------------------
  // HLS live view — works through the Railway cloud proxy because each segment
  // is a bounded HTTP request/response (unlike MSE which needs WebSocket).
  // go2rtc's playlists use relative URLs, so we mirror go2rtc's path layout:
  //   /api/cameras/:name/hls/stream.m3u8    →  go2rtc /api/stream.m3u8?src=…
  //   /api/cameras/:name/hls/hls/*          →  go2rtc /api/hls/*  (sub-playlist / segments)
  // ---------------------------------------------------------------------------
  app.get<{ Params: { name: string } }>('/api/cameras/:name/hls/stream.m3u8', async (req, reply) => {
    const unifi = registry.get('unifi') as UniFiIntegration | undefined;
    const go2rtcUrl = unifi?.getGo2rtcUrl(req.params.name);
    if (!go2rtcUrl) {
      return reply.code(503).send({ error: 'UniFi Protect not configured.' });
    }
    const base = go2rtcUrl.replace(/\/$/, '');
    const url = `${base}/api/stream.m3u8?src=${encodeURIComponent(req.params.name)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return reply.code(502).send({ error: 'HLS playlist unavailable' });
      reply.header('Content-Type', res.headers.get('content-type') ?? 'application/vnd.apple.mpegurl');
      reply.header('Cache-Control', 'no-cache');
      return reply.send(await res.text());
    } catch {
      return reply.code(502).send({ error: 'go2rtc not reachable' });
    }
  });

  app.get<{ Params: { name: string; '*': string } }>('/api/cameras/:name/hls/*', async (req, reply) => {
    const unifi = registry.get('unifi') as UniFiIntegration | undefined;
    const go2rtcUrl = unifi?.getGo2rtcUrl(req.params.name);
    if (!go2rtcUrl) {
      return reply.code(503).send({ error: 'UniFi Protect not configured.' });
    }
    const base = go2rtcUrl.replace(/\/$/, '');
    const subPath = (req.params as { '*': string })['*']; // e.g. "hls/playlist.m3u8"
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const url = `${base}/api/${subPath}${qs}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return reply.code(502).send({ error: 'HLS resource unavailable' });
      const ct = res.headers.get('content-type') ?? 'application/octet-stream';
      reply.header('Content-Type', ct);
      reply.header('Cache-Control', 'no-cache');
      // Playlists are text; segments/init are binary.
      if (ct.includes('mpegurl') || ct.startsWith('text/')) {
        return reply.send(await res.text());
      }
      return reply.send(Buffer.from(await res.arrayBuffer()));
    } catch {
      return reply.code(502).send({ error: 'go2rtc not reachable' });
    }
  });

  // Troubleshooting: probe each saved go2rtc URL from the server (stream count, reachability)
  app.get('/api/cameras/diagnostics', async (req, reply) => {
    const integration = registry.get('unifi');
    if (!integration || integration.id !== 'unifi') {
      return reply.code(503).send({ error: 'UniFi integration not available' });
    }
    const unifi = integration as UniFiIntegration;
    try {
      const entries = await unifi.getCameraDiagnostics();
      return { entries };
    } catch (err) {
      logger.error({ err }, 'Camera diagnostics failed');
      return reply.code(500).send({ error: 'diagnostics failed' });
    }
  });

  // Camera list — returns cameras discovered by the UniFi integration
  app.get('/api/cameras', async () => {
    const unifi = registry.get('unifi') as UniFiIntegration | undefined;
    const names = unifi?.getCameraNames() ?? [];
    const pendingEntries = unifi ? await unifi.getPendingEntryCount() : 0;
    return {
      cameras: names.map((name) => ({
        name,
        label: name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        hasHd: unifi?.hasHdVariant(name) ?? false,
      })),
      recover: { pendingEntries },
    };
  });

  // Manual recover: retry failed UniFi/go2rtc init and refresh stream list (same logic as background timers)
  app.post('/api/cameras/recover', async (req, reply) => {
    const integration = registry.get('unifi');
    if (!integration || integration.id !== 'unifi') {
      return reply.code(503).send({ error: 'UniFi integration not available' });
    }
    const unifi = integration as UniFiIntegration;
    try {
      return await unifi.recoverCameras();
    } catch (err) {
      logger.error({ err }, 'Camera recover failed');
      return reply.code(500).send({ error: 'recover failed' });
    }
  });

  // Camera MSE WebSocket proxy — pipes go2rtc MP4 fragments to browser
  // Includes keepalive ping (30s) and data timeout (30s) to detect stale connections.
  app.get<{ Params: { name: string } }>('/api/cameras/:name/stream', { websocket: true }, (clientSocket, req) => {
    const unifi = registry.get('unifi') as UniFiIntegration | undefined;
    const go2rtcUrl = unifi?.getGo2rtcUrl(req.params.name);
    if (!go2rtcUrl) { clientSocket.close(); return; }
    const wsUrl = go2rtcUrl.replace(/^http/, 'ws');
    const upstream = new WebSocket(`${wsUrl}/api/ws?src=${encodeURIComponent(req.params.name)}`);

    upstream.binaryType = 'arraybuffer';

    let dataTimeout: ReturnType<typeof setTimeout> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (dataTimeout) { clearTimeout(dataTimeout); dataTimeout = null; }
      if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    };

    const resetDataTimeout = () => {
      if (dataTimeout) clearTimeout(dataTimeout);
      dataTimeout = setTimeout(() => {
        if (upstream.readyState === WebSocket.OPEN) upstream.close();
      }, 30_000);
    };

    upstream.on('open', () => {
      upstream.send(GO2RTC_MSE_REQUEST);
      resetDataTimeout();
      pingInterval = setInterval(() => {
        if (upstream.readyState === WebSocket.OPEN) {
          try { upstream.ping(); } catch { /* ignore */ }
        }
      }, 30_000);
    });

    upstream.on('message', (data, isBinary) => {
      resetDataTimeout();
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
      cleanup();
      if (clientSocket.readyState === clientSocket.OPEN) clientSocket.close();
    });

    upstream.on('error', () => {
      cleanup();
      if (clientSocket.readyState === clientSocket.OPEN) clientSocket.close();
    });

    clientSocket.on('message', (data, isBinary) => {
      if (upstream.readyState !== WebSocket.OPEN) return;
      if (isBinary) upstream.send(data as Buffer);
      else upstream.send(Buffer.isBuffer(data) ? data.toString('utf8') : String(data), { binary: false });
    });

    clientSocket.on('close', () => {
      cleanup();
      upstream.close();
    });

    clientSocket.on('error', () => {
      cleanup();
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
        signal: AbortSignal.timeout(GO2RTC_WEBRTC_MS),
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

  app.post<{ Params: { id: string }; Body: { label?: string; config?: Record<string, string> } }>(
    '/api/integrations/:id/entries',
    { preHandler: [requireRole('admin')] },
    async (req, reply) => {
      const id = req.params.id as IntegrationId;
      const info = KNOWN_INTEGRATIONS.find((i) => i.id === id);
      if (!info) return reply.code(404).send({ error: 'Unknown integration' });

      const raw = req.body;
      const label = typeof raw?.label === 'string' ? raw.label : '';
      const config =
        raw?.config && typeof raw.config === 'object' && !Array.isArray(raw.config)
          ? (raw.config as Record<string, string>)
          : {};

      const entryId = randomUUID();
      try {
        await entryStore.saveEntry({
          id: entryId,
          integration: id,
          label,
          config,
          enabled: true,
        });
      } catch (err) {
        logger.error({ err, integration: id }, 'Integration entry save failed');
        return reply.code(500).send({ error: 'Failed to save integration entry' });
      }
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

      const nowEnabled = req.body.enabled ?? existing.enabled;

      await entryStore.saveEntry({
        ...existing,
        label: req.body.label ?? existing.label,
        config: mergedConfig,
        enabled: nowEnabled,
      });
      logger.info({ integration: id, entryId: req.params.entryId, enabled: nowEnabled }, 'Integration entry updated');

      // If entry was just disabled, remove its devices from the state store
      // so they disappear immediately from the dashboard.
      if (existing.enabled && !nowEnabled) {
        const entryDevices = stateStore.getByIntegration(id);
        for (const d of entryDevices) {
          if (d.id.includes(req.params.entryId)) {
            stateStore.remove(d.id);
          }
        }
        logger.info({ integration: id, entryId: req.params.entryId }, 'Removed devices for disabled entry');
      }

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
      const body = req.body ?? {};
      const hasDisplayName = 'display_name' in body;
      const hasAreaId = 'area_id' in body;
      const hasHistoryEnabled = 'history_enabled' in body;
      const hasAliases = 'aliases' in body;

      await query(
        `INSERT INTO device_settings (device_id, history_retention_days, display_name, area_id, history_enabled, aliases, updated_at)
         VALUES ($1, $2, $3, $4, COALESCE($7::boolean, TRUE), CASE WHEN $10::boolean THEN COALESCE($9::text[], '{}') ELSE '{}' END, NOW())
         ON CONFLICT (device_id) DO UPDATE SET
           history_retention_days = COALESCE($2::integer, device_settings.history_retention_days),
           display_name = CASE WHEN $5::boolean THEN $3::text ELSE device_settings.display_name END,
           area_id = CASE WHEN $6::boolean THEN $4::text ELSE device_settings.area_id END,
           history_enabled = CASE WHEN $8::boolean THEN $7::boolean ELSE device_settings.history_enabled END,
           aliases = CASE WHEN $10::boolean THEN COALESCE($9::text[], '{}') ELSE device_settings.aliases END,
           updated_at = NOW()`,
        [
          req.params.id,
          (body as { history_retention_days?: number | null }).history_retention_days ?? null,
          (body as { display_name?: string | null }).display_name ?? null,
          (body as { area_id?: string | null }).area_id ?? null,
          hasDisplayName,
          hasAreaId,
          (body as { history_enabled?: boolean }).history_enabled ?? null,
          hasHistoryEnabled,
          (body as { aliases?: string[] }).aliases ?? null,
          hasAliases,
        ],
      );

      // Update in-memory device state so WebSocket clients see the change immediately
      const device = stateStore.get(req.params.id);
      if (device) {
        const updated = { ...device };
        if (hasDisplayName) updated.displayName = (body as { display_name?: string | null }).display_name ?? undefined;
        if (hasAreaId) updated.userAreaId = (body as { area_id?: string | null }).area_id ?? undefined;
        if (hasAliases) {
          const aliases = (body as { aliases?: string[] }).aliases;
          updated.aliases = aliases?.length ? aliases : undefined;
        }
        stateStore.update(updated);
      }

      return { ok: true };
    },
  );

  app.put<{ Params: { id: string }; Body: { aliases: string[] } }>(
    '/api/devices/:id/aliases',
    { preHandler: [requireRole('admin')] },
    async (req) => {
      const aliases: string[] = Array.isArray(req.body?.aliases) ? req.body.aliases : [];
      await query(
        `INSERT INTO device_settings (device_id, history_enabled, aliases, updated_at)
         VALUES ($1, TRUE, $2, NOW())
         ON CONFLICT (device_id) DO UPDATE SET aliases = EXCLUDED.aliases, updated_at = NOW()`,
        [req.params.id, aliases],
      );
      const device = stateStore.get(req.params.id);
      if (device) stateStore.update({ ...device, aliases: aliases.length ? aliases : undefined });
      return { ok: true };
    },
  );
}
