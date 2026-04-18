// ---------------------------------------------------------------------------
// UniFi Protect integration: auto-discover cameras from Protect API,
// configure go2rtc dynamically, stream via go2rtc.
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, CameraState, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { ProtectClient, type DiscoveredCamera } from './protect-client.js';

const POLL_INTERVAL_MS = 1_000;

/** Default go2rtc URL when none is provided — Docker service name. */
export const UNIFI_DEFAULT_GO2RTC_URL = 'http://go2rtc:1984';

/** Suffix for the high-res variant of a stream in go2rtc. */
const HD_SUFFIX = '_hd';

/** True if this go2rtc stream name is the HD variant of another camera. */
function isHdVariant(name: string): boolean {
  return name.endsWith(HD_SUFFIX);
}

function normalizeGo2rtcBaseUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  return t.replace(/\/+$/, '');
}

export function resolveGo2rtcConfigUrl(config: Record<string, string>): string {
  const raw = config.go2rtc_url?.trim();
  if (raw) return normalizeGo2rtcBaseUrl(raw);
  return UNIFI_DEFAULT_GO2RTC_URL;
}

/** Retry failed entries on this interval. */
const RETRY_FAILED_ENTRY_MS = 45_000;
/** Re-sync cameras from Protect + go2rtc. */
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
  /** Protect API client — null when no credentials (legacy go2rtc-only mode). */
  protectClient: ProtectClient | null;
  /** Cameras discovered from Protect (used to re-populate go2rtc after restart). */
  discoveredCameras: DiscoveredCamera[];
}

export class UniFiIntegration implements Integration {
  readonly id = 'unifi' as const;
  private entries = new Map<string, EntryContext>();
  private connectionState: ConnectionState = 'init';
  private lastError: string | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private rediscoverTimer: ReturnType<typeof setInterval> | null = null;

  /** Cached JPEG snapshots per camera name */
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
      try {
        await this.initEntry(entry);
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

    const hasEnabled = dbEntries.some((e) => e.enabled);
    if (hasEnabled) {
      setTimeout(() => void this.retryMissingEntries(), 5_000);
      this.retryTimer = setInterval(() => void this.retryMissingEntries(), RETRY_FAILED_ENTRY_MS);
      this.rediscoverTimer = setInterval(() => void this.refreshAllEntries(), REDISCOVER_STREAMS_MS);
    }
  }

  async recoverCameras(): Promise<{ ok: boolean; cameraCount: number }> {
    await this.retryMissingEntries();
    await this.refreshAllEntries();
    return { ok: true, cameraCount: this.getCameraNames().length };
  }

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
      autoDiscovery: boolean;
      protectCameraCount?: number;
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
      autoDiscovery: boolean;
      protectCameraCount?: number;
    }> = [];

    for (const entry of dbEntries) {
      if (!entry.enabled) continue;
      const base = resolveGo2rtcConfigUrl(entry.config);
      const hasCredentials = Boolean(entry.config.username && entry.config.password);
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
          'This URL uses localhost — it targets the machine running the backend, not your laptop. If go2rtc runs elsewhere or the backend is in Docker, use the host LAN IP.';
      }

      const ctx = this.entries.get(entry.id);
      const protectCameraCount = ctx?.discoveredCameras.length;

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
        autoDiscovery: hasCredentials,
        protectCameraCount,
      });
    }

    return out;
  }

  async getPendingEntryCount(): Promise<number> {
    const dbEntries = await entryStore.getEntries('unifi');
    let n = 0;
    for (const e of dbEntries) {
      if (!e.enabled) continue;
      if (!this.entries.has(e.id)) n += 1;
    }
    return n;
  }

  // ---------------------------------------------------------------------------
  // Entry initialization
  // ---------------------------------------------------------------------------

  private async initEntry(entry: { id: string; config: Record<string, string> }): Promise<void> {
    const go2rtcUrl = normalizeGo2rtcBaseUrl(resolveGo2rtcConfigUrl(entry.config));
    const protectHost = entry.config.protect_host?.trim() ?? '';
    const username = entry.config.username?.trim() ?? '';
    const password = entry.config.password ?? '';
    const hasCredentials = Boolean(username && password && protectHost);

    const ctx: EntryContext = {
      entryId: entry.id,
      go2rtcUrl,
      protectHost,
      cameras: [],
      pollTimer: null,
      protectClient: null,
      discoveredCameras: [],
    };

    if (hasCredentials) {
      // Auto-discovery: Protect API → go2rtc → cameras
      ctx.protectClient = new ProtectClient(protectHost, username, password);
      await ctx.protectClient.login();

      const discovered = await ctx.protectClient.discoverCameras();
      ctx.discoveredCameras = discovered;

      logger.info(
        { entryId: entry.id, cameras: discovered.length, protectHost },
        'UniFi Protect: discovered cameras',
      );

      if (discovered.length === 0) {
        this.lastError = 'UniFi Protect returned no cameras';
        logger.warn({ entryId: entry.id }, this.lastError);
      }

      // Push streams to go2rtc
      await this.syncStreamsToGo2rtc(ctx, discovered);
    } else {
      // Legacy mode: just query go2rtc for existing streams
      logger.info(
        { entryId: entry.id, go2rtcUrl },
        'UniFi: no Protect credentials — using go2rtc stream list only',
      );
    }

    // Discover from go2rtc (includes auto-added streams + any pre-configured YAML streams)
    const streams = await this.discoverStreams(go2rtcUrl);
    const cameras: CameraInfo[] = streams.map((name) => ({
      name,
      entryId: entry.id,
      deviceId: `unifi.${entry.id}.${name}`,
    }));

    ctx.cameras = cameras;
    this.entries.set(entry.id, ctx);

    logger.info(
      { entryId: entry.id, cameras: cameras.length, go2rtcUrl },
      'UniFi cameras registered from go2rtc',
    );

    if (cameras.length === 0 && !hasCredentials) {
      this.lastError =
        'go2rtc returned no streams. Add UniFi Protect credentials for auto-discovery, or configure streams in go2rtc manually.';
      logger.warn({ entryId: entry.id, go2rtcUrl }, this.lastError);
    } else {
      this.lastError = null;
    }

    // Register device states (skip HD variants — they're the same logical camera)
    for (const cam of cameras) {
      if (isHdVariant(cam.name)) continue;
      stateStore.update(this.makeCameraState(cam, go2rtcUrl, true));
    }

    // Start snapshot polling
    void this.pollCameras(ctx);
    ctx.pollTimer = setInterval(() => void this.pollCameras(ctx), POLL_INTERVAL_MS);
  }

  // ---------------------------------------------------------------------------
  // go2rtc stream management
  // ---------------------------------------------------------------------------

  private async syncStreamsToGo2rtc(ctx: EntryContext, cameras: DiscoveredCamera[]): Promise<void> {
    // Get current go2rtc streams
    let currentStreams: string[] = [];
    try {
      currentStreams = await this.discoverStreams(ctx.go2rtcUrl);
    } catch {
      logger.warn({ entryId: ctx.entryId }, 'go2rtc unreachable — will retry on next cycle');
      return;
    }

    const currentSet = new Set(currentStreams);

    // Add new/updated streams. We register up to TWO streams per camera:
    //   `{name}`      — low-res sub-stream (default, used by grid + snapshots)
    //   `{name}_hd`   — high-res main stream (only if camera exposes one)
    for (const cam of cameras) {
      try {
        await this.go2rtcPutStream(ctx.go2rtcUrl, cam.streamName, cam.rtspUrl);
        if (!currentSet.has(cam.streamName)) {
          logger.info(
            { entryId: ctx.entryId, stream: cam.streamName },
            'UniFi: added low-res stream to go2rtc',
          );
        }
        if (cam.rtspUrlHd) {
          const hdName = `${cam.streamName}_hd`;
          await this.go2rtcPutStream(ctx.go2rtcUrl, hdName, cam.rtspUrlHd);
          if (!currentSet.has(hdName)) {
            logger.info(
              { entryId: ctx.entryId, stream: hdName },
              'UniFi: added HD stream to go2rtc',
            );
          }
        }
      } catch (err) {
        logger.warn(
          { err, entryId: ctx.entryId, stream: cam.streamName },
          'UniFi: failed to add stream to go2rtc',
        );
      }
    }

    // Remove streams that no longer exist in Protect (only streams we manage)
    const discoveredNames = new Set<string>();
    for (const c of cameras) {
      discoveredNames.add(c.streamName);
      if (c.rtspUrlHd) discoveredNames.add(`${c.streamName}_hd`);
    }
    const previousNames = new Set<string>();
    for (const c of ctx.discoveredCameras) {
      previousNames.add(c.streamName);
      if (c.rtspUrlHd) previousNames.add(`${c.streamName}_hd`);
    }
    for (const name of previousNames) {
      if (!discoveredNames.has(name)) {
        try {
          await this.go2rtcDeleteStream(ctx.go2rtcUrl, name);
          logger.info(
            { entryId: ctx.entryId, stream: name },
            'UniFi: removed camera stream from go2rtc (no longer in Protect)',
          );
        } catch {
          // Best effort
        }
      }
    }
  }

  private async go2rtcPutStream(baseUrl: string, name: string, rtspUrl: string): Promise<void> {
    // Register through the ffmpeg source wrapper so any HLS fragmenting or
    // MJPEG transcoding go2rtc has to do goes through the iGPU. We use VAAPI
    // rather than QSV because the master-hardware image's ffmpeg is compiled
    // with --disable-libmfx (so `#hardware=qsv` fails at init). VAAPI hits the
    // same Intel iGPU via the iHD driver and gives the same CPU savings.
    // `video=copy` / `audio=copy` keep native passthrough for WebRTC/MSE on
    // the happy path — ffmpeg only does real work when a client asks for HLS.
    const src = `ffmpeg:${rtspUrl}#video=copy#audio=copy#hardware=vaapi`;
    const url = `${baseUrl}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(src)}`;
    const res = await fetch(url, { method: 'PUT', signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      throw new Error(`go2rtc PUT stream failed: ${res.status}`);
    }
  }

  private async go2rtcDeleteStream(baseUrl: string, name: string): Promise<void> {
    const url = `${baseUrl}/api/streams?src=${encodeURIComponent(name)}`;
    await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(8_000) }).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Retry & refresh
  // ---------------------------------------------------------------------------

  private async retryMissingEntries(): Promise<void> {
    const dbEntries = await entryStore.getEntries('unifi');
    let anySuccess = false;
    for (const entry of dbEntries) {
      if (!entry.enabled) continue;
      if (this.entries.has(entry.id)) {
        // Entry exists — check if go2rtc has our streams (handles go2rtc restart)
        const ctx = this.entries.get(entry.id)!;
        if (ctx.discoveredCameras.length > 0 && ctx.cameras.length === 0) {
          try {
            await this.syncStreamsToGo2rtc(ctx, ctx.discoveredCameras);
            await this.refreshEntryFromGo2rtc(ctx);
            anySuccess = true;
          } catch {
            // Will retry next cycle
          }
        }
        continue;
      }
      try {
        await this.initEntry(entry);
        anySuccess = true;
        this.lastError = null;
      } catch (err) {
        logger.warn({ err, entryId: entry.id }, 'UniFi entry init retry failed');
        this.lastError = String(err);
      }
    }
    if (anySuccess) {
      this.connectionState = 'connected';
      this.emitHealth('connected');
    }
  }

  private async refreshAllEntries(): Promise<void> {
    await Promise.allSettled([...this.entries.values()].map((ctx) => this.refreshEntry(ctx)));
  }

  /**
   * Full refresh: re-discover from Protect (if available) → sync go2rtc → update devices.
   */
  private async refreshEntry(ctx: EntryContext): Promise<void> {
    if (ctx.protectClient && !ctx.protectClient.badCredentials) {
      try {
        const cameras = await ctx.protectClient.discoverCameras();
        await this.syncStreamsToGo2rtc(ctx, cameras);
        ctx.discoveredCameras = cameras;
      } catch (err) {
        // Session expired — re-login and retry once
        if (err instanceof Error && (err as { status?: number }).status === 401) {
          try {
            await ctx.protectClient.login();
            const cameras = await ctx.protectClient.discoverCameras();
            await this.syncStreamsToGo2rtc(ctx, cameras);
            ctx.discoveredCameras = cameras;
          } catch (retryErr) {
            logger.warn({ err: retryErr, entryId: ctx.entryId }, 'UniFi Protect re-auth failed');
          }
        } else {
          logger.warn({ err, entryId: ctx.entryId }, 'UniFi Protect camera refresh failed');
        }
      }
    }

    await this.refreshEntryFromGo2rtc(ctx);
  }

  /**
   * Refresh the camera list from go2rtc's current streams.
   * Adds new cameras, removes deleted ones. If go2rtc returns empty while
   * we had streams, keeps the old list (protects against transient glitches).
   */
  private async refreshEntryFromGo2rtc(ctx: EntryContext): Promise<void> {
    let streams: string[];
    try {
      streams = await this.discoverStreams(ctx.go2rtcUrl);
    } catch (err) {
      logger.warn({ err, entryId: ctx.entryId }, 'go2rtc stream list refresh failed');
      return;
    }

    if (streams.length === 0 && ctx.cameras.length > 0) {
      // go2rtc might have restarted — try to re-push our streams
      if (ctx.discoveredCameras.length > 0) {
        await this.syncStreamsToGo2rtc(ctx, ctx.discoveredCameras);
        try {
          streams = await this.discoverStreams(ctx.go2rtcUrl);
        } catch {
          return;
        }
      }
      if (streams.length === 0) {
        logger.warn({ entryId: ctx.entryId }, 'go2rtc returned no streams — keeping previous list');
        return;
      }
    }

    // Update camera list
    const nextNames = new Set(streams);
    for (const cam of ctx.cameras) {
      if (!nextNames.has(cam.name)) {
        if (!isHdVariant(cam.name)) stateStore.remove(cam.deviceId);
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
      if (isHdVariant(cam.name)) continue;
      stateStore.update(this.makeCameraState(cam, ctx.go2rtcUrl, true));
    }
    void this.pollCameras(ctx);
  }

  // ---------------------------------------------------------------------------
  // Snapshot polling & device state
  // ---------------------------------------------------------------------------

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
    // Only poll the low-res (base) stream. HD snapshots aren't cached —
    // grid tiles use low-res and fullscreen hits go2rtc live for HD.
    await Promise.allSettled(
      ctx.cameras.filter((c) => !isHdVariant(c.name)).map(async (cam) => {
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

  getCachedSnapshot(name: string): { buffer: Buffer; timestamp: number } | null {
    return this.snapshotCache.get(name) ?? null;
  }

  /** Write a freshly-fetched snapshot into the shared cache so other clients
   *  asking for the same camera get it immediately without another upstream
   *  fetch. Called from the /snapshot route after a `?fresh=` bypass. */
  setCachedSnapshot(name: string, buffer: Buffer): void {
    this.snapshotCache.set(name, { buffer, timestamp: Date.now() });
  }

  getGo2rtcUrl(name: string): string | null {
    for (const ctx of this.entries.values()) {
      if (ctx.cameras.some((c) => c.name === name)) {
        return ctx.go2rtcUrl;
      }
    }
    return null;
  }

  getCameraNames(): string[] {
    const names: string[] = [];
    for (const ctx of this.entries.values()) {
      for (const cam of ctx.cameras) {
        if (isHdVariant(cam.name)) continue;
        names.push(cam.name);
      }
    }
    return names;
  }

  /** True if this camera has a registered HD variant available. */
  hasHdVariant(name: string): boolean {
    const hd = `${name}${HD_SUFFIX}`;
    for (const ctx of this.entries.values()) {
      if (ctx.cameras.some((c) => c.name === hd)) return true;
    }
    return false;
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
