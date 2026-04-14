// ---------------------------------------------------------------------------
// UniFi Protect integration: cameras via go2rtc
// Each integration entry = one go2rtc instance / Protect controller
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, CameraState, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';

const POLL_INTERVAL_MS = 10_000; // poll every 10s for fresher snapshots

/** Default when `go2rtc_url` is omitted — same host as backend (override with LAN IP if go2rtc is elsewhere). */
export const UNIFI_DEFAULT_GO2RTC_URL = 'http://localhost:1984';

/** Trim and strip trailing slashes so fetch URLs match go2rtc consistently. */
function normalizeGo2rtcBaseUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  return t.replace(/\/+$/, '');
}

/** Effective go2rtc base URL from saved entry config (defaults if blank). */
export function resolveGo2rtcConfigUrl(config: Record<string, string>): string {
  const raw = config.go2rtc_url?.trim();
  if (raw) return normalizeGo2rtcBaseUrl(raw);
  return UNIFI_DEFAULT_GO2RTC_URL;
}

/** If go2rtc was down at startup, re-attempt entry init on this interval. */
const RETRY_FAILED_ENTRY_MS = 45_000;
/** Re-fetch `/api/streams` so new cameras appear and recovered go2rtc repopulates after empty startup. */
const REDISCOVER_STREAMS_MS = 120_000;

interface CameraInfo {
  name: string;
  entryId: string;
  deviceId: string;
}

interface EntryContext {
  entryId: string;
  go2rtcUrl: string;
  protectHost: string;
  cameras: CameraInfo[];
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class UniFiIntegration implements Integration {
  readonly id = 'unifi' as const;
  private entries = new Map<string, EntryContext>();
  private connectionState: ConnectionState = 'init';
  private lastError: string | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private rediscoverTimer: ReturnType<typeof setInterval> | null = null;

  /** Cached JPEG snapshots per camera name — updated every poll cycle */
  private snapshotCache = new Map<string, { buffer: Buffer; timestamp: number }>();

  async start(): Promise<void> {
    const dbEntries = await entryStore.getEntries('unifi');
    if (dbEntries.length === 0) {
      logger.info('No UniFi entries configured');
      return;
    }

    this.connectionState = 'connecting';
    this.emitHealth('connecting');

    for (const entry of dbEntries) {
      if (!entry.enabled) continue;
      const go2rtcUrl = resolveGo2rtcConfigUrl(entry.config);

      try {
        await this.initEntry(entry.id, go2rtcUrl, entry.config.protect_host ?? '');
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'UniFi entry init failed');
        this.lastError = String(err);
        logger.warn(
          { entryId: entry.id, go2rtcUrl: normalizeGo2rtcBaseUrl(go2rtcUrl) },
          'If this persists: use the LAN IP of the host running go2rtc (reachable from the backend). localhost only works when go2rtc is on the same machine as the backend.',
        );
      }
    }

    if (this.entries.size > 0) {
      this.connectionState = 'connected';
      this.emitHealth('connected');
    } else if (dbEntries.length > 0) {
      this.connectionState = 'error';
      this.emitHealth('error');
    }

    const hasUnifiConfig = dbEntries.some((e) => e.enabled);
    if (hasUnifiConfig) {
      // go2rtc often starts after the backend — retry soon, then on an interval.
      setTimeout(() => void this.retryMissingEntries(), 5_000);
      this.retryTimer = setInterval(() => void this.retryMissingEntries(), RETRY_FAILED_ENTRY_MS);
      this.rediscoverTimer = setInterval(() => void this.refreshAllEntryStreams(), REDISCOVER_STREAMS_MS);
    }
  }

  /**
   * Re-run discovery for entries that failed init (go2rtc was offline) and refresh stream lists
   * from go2rtc. Safe to call from HTTP for a manual "recover" button.
   */
  async recoverCameras(): Promise<{ ok: boolean; cameraCount: number }> {
    await this.retryMissingEntries();
    await this.refreshAllEntryStreams();
    return { ok: true, cameraCount: this.getCameraNames().length };
  }

  /**
   * Live probe of each saved go2rtc URL (from DB), for troubleshooting when the server sees no streams
   * but the same config works on a developer laptop.
   */
  async getCameraDiagnostics(): Promise<
    Array<{
      entryId: string;
      label: string;
      go2rtcUrl: string;
      reachable: boolean;
      httpStatus?: number;
      streamCount: number;
      streamNames: string[];
      error?: string;
      hint?: string;
    }>
  > {
    const dbEntries = await entryStore.getEntries('unifi');
    const out: Array<{
      entryId: string;
      label: string;
      go2rtcUrl: string;
      reachable: boolean;
      httpStatus?: number;
      streamCount: number;
      streamNames: string[];
      error?: string;
      hint?: string;
    }> = [];

    for (const entry of dbEntries) {
      if (!entry.enabled) continue;
      const base = resolveGo2rtcConfigUrl(entry.config);
      let reachable = false;
      let httpStatus: number | undefined;
      let streamCount = 0;
      let streamNames: string[] = [];
      let error: string | undefined;

      try {
        const res = await fetch(`${base}/api/streams`, { signal: AbortSignal.timeout(12_000) });
        httpStatus = res.status;
        reachable = res.ok;
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          streamNames = Object.keys(data);
          streamCount = streamNames.length;
        } else {
          error = `HTTP ${res.status}`;
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      let hint: string | undefined;
      if (/localhost|127\.0\.0\.1/i.test(base)) {
        hint =
          'This URL uses localhost — it targets the machine running the **backend**, not your laptop. If go2rtc runs elsewhere or the backend is in Docker, set go2rtc_url to that host\'s LAN IP.';
      }
      if (reachable && streamCount === 0) {
        hint =
          (hint ? `${hint} ` : '') +
          'go2rtc responded but listed no streams — configure inputs (e.g. RTSP from UniFi Protect) in go2rtc on this server.';
      }

      out.push({
        entryId: entry.id,
        label: entry.label || 'UniFi',
        go2rtcUrl: base,
        reachable,
        httpStatus,
        streamCount,
        streamNames: streamNames.slice(0, 24),
        error: reachable ? undefined : error,
        hint,
      });
    }

    return out;
  }

  /** Entries configured in DB but not yet successfully initialized (go2rtc unreachable at startup). */
  async getPendingEntryCount(): Promise<number> {
    const dbEntries = await entryStore.getEntries('unifi');
    let n = 0;
    for (const e of dbEntries) {
      if (!e.enabled) continue;
      if (!this.entries.has(e.id)) n += 1;
    }
    return n;
  }

  private async retryMissingEntries(): Promise<void> {
    const dbEntries = await entryStore.getEntries('unifi');
    let anySuccess = false;
    for (const entry of dbEntries) {
      if (!entry.enabled) continue;
      const go2rtcUrl = resolveGo2rtcConfigUrl(entry.config);
      if (this.entries.has(entry.id)) continue;
      try {
        await this.initEntry(entry.id, go2rtcUrl, entry.config.protect_host ?? '');
        anySuccess = true;
        this.lastError = null;
      } catch (err) {
        logger.warn({ err, entryId: entry.id }, 'UniFi entry init retry failed (will try again)');
        this.lastError = String(err);
      }
    }
    if (anySuccess) {
      this.connectionState = 'connected';
      this.emitHealth('connected');
    }
  }

  private async refreshAllEntryStreams(): Promise<void> {
    await Promise.allSettled([...this.entries.values()].map((ctx) => this.refreshEntryStreams(ctx)));
  }

  /**
   * Merge go2rtc's current stream list into this entry. Adds new cameras, removes ones gone from go2rtc.
   * If go2rtc returns an empty list while we already had streams, keep the old list (protect against transient API glitches).
   */
  private async refreshEntryStreams(ctx: EntryContext): Promise<void> {
    let streams: string[];
    try {
      streams = await this.discoverStreams(ctx.go2rtcUrl);
    } catch (err) {
      logger.warn({ err, entryId: ctx.entryId }, 'go2rtc stream list refresh failed');
      return;
    }
    if (streams.length === 0 && ctx.cameras.length > 0) {
      logger.warn({ entryId: ctx.entryId }, 'go2rtc returned no streams — keeping previous camera list');
      return;
    }

    const nextNames = new Set(streams);
    for (const cam of ctx.cameras) {
      if (!nextNames.has(cam.name)) {
        stateStore.remove(cam.deviceId);
        this.snapshotCache.delete(cam.name);
      }
    }

    const newCameras: CameraInfo[] = streams.map((name) => ({
      name,
      entryId: ctx.entryId,
      deviceId: `unifi.${ctx.entryId}.${name}`,
    }));
    ctx.cameras = newCameras;
    for (const cam of newCameras) {
      stateStore.update(this.makeCameraState(cam, ctx.go2rtcUrl, true));
    }
    void this.pollCameras(ctx);
  }

  private async initEntry(entryId: string, go2rtcUrl: string, protectHost: string): Promise<void> {
    const base = normalizeGo2rtcBaseUrl(go2rtcUrl);
    const streams = await this.discoverStreams(base);
    const cameras: CameraInfo[] = streams.map((name) => ({
      name,
      entryId,
      deviceId: `unifi.${entryId}.${name}`,
    }));

    logger.info({ entryId, cameras: cameras.length, go2rtcUrl: base }, 'UniFi cameras discovered from go2rtc');

    if (cameras.length === 0) {
      const msg =
        'go2rtc returned no streams — use a go2rtc URL reachable from this backend (try the host LAN IP instead of localhost) and ensure streams are configured in go2rtc.';
      this.lastError = msg;
      logger.warn({ entryId, go2rtcUrl: base }, msg);
    } else {
      this.lastError = null;
    }

    const ctx: EntryContext = { entryId, go2rtcUrl: base, protectHost, cameras, pollTimer: null };
    this.entries.set(entryId, ctx);

    // Register initial camera devices and fetch first snapshots
    for (const cam of cameras) {
      stateStore.update(this.makeCameraState(cam, base, true));
    }

    // Initial snapshot fetch (parallel, don't block startup)
    void this.pollCameras(ctx);

    // Start polling
    ctx.pollTimer = setInterval(() => void this.pollCameras(ctx), POLL_INTERVAL_MS);
  }

  private async discoverStreams(go2rtcBaseUrl: string): Promise<string[]> {
    const res = await fetch(`${go2rtcBaseUrl}/api/streams`, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`go2rtc streams API returned ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    return Object.keys(data);
  }

  private makeCameraState(cam: CameraInfo, host: string, online: boolean): CameraState {
    return {
      type: 'camera',
      id: cam.deviceId,
      name: cam.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      integration: 'unifi',
      areaId: null,
      available: online,
      lastChanged: Date.now(),
      lastUpdated: Date.now(),
      online,
      host,
    };
  }

  private async pollCameras(ctx: EntryContext): Promise<void> {
    await Promise.allSettled(
      ctx.cameras.map(async (cam) => {
        try {
          const res = await fetch(
            `${ctx.go2rtcUrl}/api/frame.jpeg?src=${encodeURIComponent(cam.name)}`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer());
            this.snapshotCache.set(cam.name, { buffer, timestamp: Date.now() });
            stateStore.update(this.makeCameraState(cam, ctx.go2rtcUrl, true));
          } else {
            stateStore.update(this.makeCameraState(cam, ctx.go2rtcUrl, false));
          }
        } catch {
          stateStore.update(this.makeCameraState(cam, ctx.go2rtcUrl, false));
        }
      }),
    );
  }

  /** Get cached snapshot JPEG for a camera. Returns null if not cached. */
  getCachedSnapshot(name: string): { buffer: Buffer; timestamp: number } | null {
    return this.snapshotCache.get(name) ?? null;
  }

  /** Get the go2rtc URL for a camera name (for WebSocket proxying). */
  getGo2rtcUrl(name: string): string | null {
    for (const ctx of this.entries.values()) {
      if (ctx.cameras.some((c) => c.name === name)) {
        return ctx.go2rtcUrl;
      }
    }
    return null;
  }

  /** Get all known camera names across all entries. */
  getCameraNames(): string[] {
    const names: string[] = [];
    for (const ctx of this.entries.values()) {
      for (const cam of ctx.cameras) names.push(cam.name);
    }
    return names;
  }

  async stop(): Promise<void> {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.rediscoverTimer) {
      clearInterval(this.rediscoverTimer);
      this.rediscoverTimer = null;
    }
    for (const ctx of this.entries.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    }
    this.entries.clear();
    this.snapshotCache.clear();
    this.connectionState = 'disconnected';
  }

  async handleCommand(_cmd: DeviceCommand): Promise<void> {
    // Cameras are view-only
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.connectionState,
      lastConnected: null,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
