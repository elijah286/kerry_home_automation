// ---------------------------------------------------------------------------
// Roborock: local miIO (UDP) or cloud session + hybrid local/MQTT via bridge
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { MiioClient } from './miio-client.js';
import { mapVacuumState } from './mapper.js';
import {
  bridgeCommand,
  bridgeListDevices,
  bridgeMap,
  bridgeStatus,
  isRoborockBridgeConfigured,
  type BridgeDevice,
} from './bridge-client.js';

const POLL_INTERVAL_MS = 30_000;
const MAP_POLL_MS = 50_000;

const FAN_SPEED_MAP: Record<string, number> = {
  quiet: 101, balanced: 102, turbo: 103, max: 104, gentle: 105, auto: 106,
};

interface LocalVacuumCtx {
  kind: 'local';
  entryId: string;
  label: string;
  client: MiioClient;
  pollTimer: ReturnType<typeof setInterval> | null;
}

interface CloudVacuumCtx {
  kind: 'cloud';
  entryId: string;
  sessionB64: string;
  devices: BridgeDevice[];
  /** Last known LAN IP per duid (speeds up hybrid local path) */
  hostByDuid: Map<string, string>;
  /** Avoid rewriting integration_entries when device_hosts unchanged */
  lastPersistedHostsJson: string | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  mapPollTimer: ReturnType<typeof setInterval> | null;
}

type VacuumCtx = LocalVacuumCtx | CloudVacuumCtx;

function isLocalEntry(config: Record<string, string>): boolean {
  if (config.local_miio === 'true') return true;
  if (config.cloud_session?.trim()) return false;
  return Boolean(config.host?.trim() && config.token?.trim());
}

function parseDeviceHosts(raw: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!raw?.trim()) return m;
  try {
    const o = JSON.parse(raw) as Record<string, string>;
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && v.trim()) m.set(k, v.trim());
      }
    }
  } catch {
    /* ignore */
  }
  return m;
}

/** Stable JSON for comparing / persisting `device_hosts` (key order independent). */
function stableHostsJsonFromMap(m: Map<string, string>): string {
  const o: Record<string, string> = {};
  for (const k of [...m.keys()].sort()) {
    const v = m.get(k);
    if (v) o[k] = v;
  }
  return JSON.stringify(o);
}

export class RoborockIntegration implements Integration {
  readonly id = 'roborock' as const;
  private vacuums = new Map<string, VacuumCtx>();
  /** Live map PNG per device id (cloud / hybrid only) */
  private mapCache = new Map<string, Buffer>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  /** Cached floor-plan map for a Roborock vacuum device id. */
  getCachedMap(deviceId: string): Buffer | null {
    const b = this.mapCache.get(deviceId);
    return b && b.length > 0 ? b : null;
  }

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('roborock');
    if (entries.length === 0) return;

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled) continue;
      const cfg = entry.config;

      if (isLocalEntry(cfg)) {
        if (!cfg.host?.trim() || !cfg.token?.trim()) continue;
        const client = new MiioClient(cfg.host.trim(), cfg.token.trim());
        const ctx: LocalVacuumCtx = {
          kind: 'local',
          entryId: entry.id,
          label: entry.label || 'Roborock',
          client,
          pollTimer: null,
        };
        this.vacuums.set(`local:${entry.id}`, ctx);
        try {
          await this.poll(ctx);
          this.lastConnected = Date.now();
        } catch (err) {
          logger.error({ err, entryId: entry.id }, 'Roborock: initial poll failed');
          this.lastError = String(err);
        }
        ctx.pollTimer = setInterval(() => {
          if (this.stopping) return;
          this.poll(ctx).catch((err) => {
            this.lastError = String(err);
          });
        }, POLL_INTERVAL_MS);
        continue;
      }

      // Cloud + hybrid via bridge
      const session = cfg.cloud_session?.trim();
      if (!session) {
        logger.warn({ entryId: entry.id }, 'Roborock: cloud entry missing cloud_session');
        continue;
      }
      if (!isRoborockBridgeConfigured()) {
        logger.error(
          { entryId: entry.id },
          'Roborock: cloud entry requires the bridge (auto-started locally, or set ROBOROCK_BRIDGE_URL)',
        );
        this.lastError = 'Roborock bridge not available';
        continue;
      }

      let devices: BridgeDevice[] = [];
      try {
        devices = await bridgeListDevices(session);
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'Roborock: list devices failed');
        this.lastError = String(err);
      }
      if (devices.length === 0) {
        logger.warn({ entryId: entry.id }, 'Roborock: no devices on account');
        continue;
      }

      const hostByDuid = parseDeviceHosts(cfg.device_hosts);
      const ctx: CloudVacuumCtx = {
        kind: 'cloud',
        entryId: entry.id,
        sessionB64: session,
        devices,
        hostByDuid,
        lastPersistedHostsJson: hostByDuid.size > 0 ? stableHostsJsonFromMap(hostByDuid) : null,
        pollTimer: null,
        mapPollTimer: null,
      };
      this.vacuums.set(`cloud:${entry.id}`, ctx);

      try {
        await this.poll(ctx);
        this.lastConnected = Date.now();
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'Roborock: initial cloud poll failed');
        this.lastError = String(err);
      }

      ctx.pollTimer = setInterval(() => {
        if (this.stopping) return;
        this.poll(ctx).catch((err) => {
          this.lastError = String(err);
        });
      }, POLL_INTERVAL_MS);

      void this.pollMaps(ctx).catch(() => {});
      ctx.mapPollTimer = setInterval(() => {
        if (this.stopping) return;
        void this.pollMaps(ctx).catch(() => {});
      }, MAP_POLL_MS);
    }

    if (this.vacuums.size > 0 && this.lastConnected) {
      this.emitHealth('connected');
    }
    logger.info({ instances: this.vacuums.size }, 'Roborock integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.vacuums.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
      if (ctx.kind === 'cloud' && ctx.mapPollTimer) clearInterval(ctx.mapPollTimer);
      if (ctx.kind === 'local') ctx.client.disconnect();
    }
    this.vacuums.clear();
    this.mapCache.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'vacuum') return;
    const parts = cmd.deviceId.split('.');
    const entryId = parts[1];
    const duidFromId = parts.length >= 4 ? parts[2] : null;

    const cloudKey = `cloud:${entryId}`;
    const localKey = `local:${entryId}`;
    const cloudCtx = this.vacuums.get(cloudKey) as CloudVacuumCtx | undefined;
    const localCtx = this.vacuums.get(localKey) as LocalVacuumCtx | undefined;

    if (localCtx) {
      logger.info({ deviceId: cmd.deviceId, action: cmd.action }, 'Roborock: local miIO vacuum command');
      await this.runLocalCommand(localCtx, cmd);
      logger.info({ deviceId: cmd.deviceId, action: cmd.action }, 'Roborock: local miIO command finished');
      setTimeout(() => void this.poll(localCtx).catch(() => {}), 3000);
      return;
    }

    if (cloudCtx) {
      let duid = duidFromId;
      if (!duid) {
        if (cloudCtx.devices.length === 1) duid = cloudCtx.devices[0].duid;
      }
      if (!duid) throw new Error('Roborock: device id must include duid when multiple vacuums are linked');
      const cached = cloudCtx.hostByDuid.get(duid);
      logger.info(
        { deviceId: cmd.deviceId, action: cmd.action, duid: duid.slice(0, 12), cachedHost: cached ?? null },
        'Roborock: vacuum command (prefer LAN when IP known)',
      );
      switch (cmd.action) {
        case 'start':
          await bridgeCommand(cloudCtx.sessionB64, duid, 'start', { cachedHost: cached });
          break;
        case 'stop':
          await bridgeCommand(cloudCtx.sessionB64, duid, 'stop', { cachedHost: cached });
          break;
        case 'pause':
          await bridgeCommand(cloudCtx.sessionB64, duid, 'pause', { cachedHost: cached });
          break;
        case 'return_dock':
          await bridgeCommand(cloudCtx.sessionB64, duid, 'return_dock', { cachedHost: cached });
          break;
        case 'find':
          await bridgeCommand(cloudCtx.sessionB64, duid, 'find', { cachedHost: cached });
          break;
        case 'set_fan_speed': {
          const speed = FAN_SPEED_MAP[cmd.fanSpeed ?? ''] ?? 102;
          await bridgeCommand(cloudCtx.sessionB64, duid, 'set_fan_speed', {
            fanSpeed: speed,
            cachedHost: cached,
          });
          break;
        }
        default: {
          const a = (cmd as { action?: string }).action;
          throw new Error(`Roborock: unsupported vacuum action ${a ?? '(missing)'}`);
        }
      }
      logger.info({ deviceId: cmd.deviceId, action: cmd.action }, 'Roborock: vacuum command finished');
      setTimeout(() => void this.poll(cloudCtx).catch(() => {}), 3000);
      return;
    }

    throw new Error('Roborock not found');
  }

  private async runLocalCommand(ctx: LocalVacuumCtx, cmd: DeviceCommand): Promise<void> {
    switch (cmd.action) {
      case 'start':
        await ctx.client.startCleaning();
        break;
      case 'stop':
        await ctx.client.stopCleaning();
        break;
      case 'pause':
        await ctx.client.pauseCleaning();
        break;
      case 'return_dock':
        await ctx.client.returnToDock();
        break;
      case 'find':
        await ctx.client.findMe();
        break;
      case 'set_fan_speed': {
        const speed = FAN_SPEED_MAP[cmd.fanSpeed ?? ''] ?? 102;
        await ctx.client.setFanSpeed(speed);
        break;
      }
    }
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.vacuums.size > 0 ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async poll(ctx: VacuumCtx): Promise<void> {
    if (ctx.kind === 'local') {
      const status = await ctx.client.getStatus();
      stateStore.update(mapVacuumState(ctx.entryId, ctx.label, status));
      if (status) this.lastConnected = Date.now();
      return;
    }

    let anyOk = false;
    for (const dev of ctx.devices) {
      const cached = ctx.hostByDuid.get(dev.duid);
      try {
        const res = await bridgeStatus(ctx.sessionB64, dev.duid, cached);
        if (res.local_ip) ctx.hostByDuid.set(dev.duid, res.local_ip);
        stateStore.update(
          mapVacuumState(ctx.entryId, dev.name, res.status, dev.duid),
        );
        if (res.status) anyOk = true;
      } catch (err) {
        logger.warn(
          { err: String(err), duid: dev.duid.slice(0, 12), hadCachedIp: Boolean(cached) },
          'Roborock: status poll failed (device may be offline or bridge cannot reach MQTT/LAN)',
        );
        stateStore.update(mapVacuumState(ctx.entryId, dev.name, null, dev.duid));
      }
    }
    if (anyOk) this.lastConnected = Date.now();
    await this.persistLearnedHosts(ctx);
  }

  /** Save discovered LAN IPs to the integration entry so the next backend start tries local-first immediately. */
  private async persistLearnedHosts(ctx: CloudVacuumCtx): Promise<void> {
    if (ctx.hostByDuid.size === 0) return;
    const json = stableHostsJsonFromMap(ctx.hostByDuid);
    if (json === ctx.lastPersistedHostsJson) return;
    const entry = await entryStore.getEntry(ctx.entryId);
    if (!entry) return;
    const existingJson = entry.config.device_hosts?.trim()
      ? stableHostsJsonFromMap(parseDeviceHosts(entry.config.device_hosts))
      : null;
    if (existingJson === json) {
      ctx.lastPersistedHostsJson = json;
      return;
    }
    await entryStore.saveEntry({
      ...entry,
      config: { ...entry.config, device_hosts: json },
    });
    ctx.lastPersistedHostsJson = json;
    logger.info(
      { entryId: ctx.entryId, duids: ctx.hostByDuid.size },
      'Roborock: saved vacuum LAN IPs to integration config (local-first on restart)',
    );
  }

  private async pollMaps(ctx: CloudVacuumCtx): Promise<void> {
    for (const dev of ctx.devices) {
      const deviceId = `roborock.${ctx.entryId}.${dev.duid}.vacuum`;
      const cached = ctx.hostByDuid.get(dev.duid);
      try {
        const { png, local_ip } = await bridgeMap(ctx.sessionB64, dev.duid, cached);
        if (local_ip) ctx.hostByDuid.set(dev.duid, local_ip);
        if (png && png.length > 200) {
          this.mapCache.set(deviceId, png);
          const prev = stateStore.get(deviceId);
          if (prev?.type === 'vacuum') {
            stateStore.update({
              ...prev,
              mapUpdatedAt: Date.now(),
              lastUpdated: Date.now(),
            });
          }
        }
      } catch (err) {
        logger.debug({ err, duid: dev.duid }, 'Roborock map poll skipped');
      }
    }
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
