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
      const go2rtcUrl = entry.config.go2rtc_url;
      if (!go2rtcUrl) continue;

      try {
        await this.initEntry(entry.id, go2rtcUrl, entry.config.protect_host ?? '');
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'UniFi entry init failed');
        this.lastError = String(err);
      }
    }

    if (this.entries.size > 0) {
      this.connectionState = 'connected';
      this.emitHealth('connected');
    } else if (dbEntries.length > 0) {
      this.connectionState = 'error';
      this.emitHealth('error');
    }

    const hasUnifiConfig = dbEntries.some((e) => e.enabled && e.config.go2rtc_url);
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

  /** Entries configured in DB but not yet successfully initialized (go2rtc unreachable at startup). */
  async getPendingEntryCount(): Promise<number> {
    const dbEntries = await entryStore.getEntries('unifi');
    let n = 0;
    for (const e of dbEntries) {
      if (!e.enabled || !e.config.go2rtc_url) continue;
      if (!this.entries.has(e.id)) n += 1;
    }
    return n;
  }

  private async retryMissingEntries(): Promise<void> {
    const dbEntries = await entryStore.getEntries('unifi');
    let anySuccess = false;
    for (const entry of dbEntries) {
      if (!entry.enabled) continue;
      const go2rtcUrl = entry.config.go2rtc_url;
      if (!go2rtcUrl) continue;
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
    const streams = await this.discoverStreams(go2rtcUrl);
    const cameras: CameraInfo[] = streams.map((name) => ({
      name,
      entryId,
      deviceId: `unifi.${entryId}.${name}`,
    }));

    logger.info({ entryId, cameras: cameras.length }, 'UniFi cameras discovered from go2rtc');

    const ctx: EntryContext = { entryId, go2rtcUrl, protectHost, cameras, pollTimer: null };
    this.entries.set(entryId, ctx);

    // Register initial camera devices and fetch first snapshots
    for (const cam of cameras) {
      stateStore.update(this.makeCameraState(cam, go2rtcUrl, true));
    }

    // Initial snapshot fetch (parallel, don't block startup)
    void this.pollCameras(ctx);

    // Start polling
    ctx.pollTimer = setInterval(() => void this.pollCameras(ctx), POLL_INTERVAL_MS);
  }

  private async discoverStreams(go2rtcUrl: string): Promise<string[]> {
    const res = await fetch(`${go2rtcUrl}/api/streams`);
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
