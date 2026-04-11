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
