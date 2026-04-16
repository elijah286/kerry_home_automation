// ---------------------------------------------------------------------------
// Roborock: local miIO (UDP) or cloud session via bridge DeviceManager
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState, VacuumRoom } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { integrationDetailLog } from '../../integration-debug.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { MiioClient, type RoborockCleanSummary, type RoborockConsumables } from './miio-client.js';
import { mapConsumableSensors, mapVacuumState, vacuumDeviceId } from './mapper.js';
import {
  bridgeCleanSummary,
  bridgeCommand,
  bridgeConnect,
  bridgeConsumables,
  bridgeDisconnect,
  bridgeMap,
  bridgeRenderMap,
  bridgeRooms,
  bridgeStatus,
  isRoborockBridgeConfigured,
  type BridgeDevice,
} from './bridge-client.js';

const log = logger.child({ integration: 'roborock' });

const POLL_INTERVAL_MS = 30_000;
const MAP_POLL_MS = 50_000;
// Consumables / lifetime stats change slowly — poll every 5 minutes.
const SLOW_POLL_INTERVAL_MS = 5 * 60_000;

const FAN_SPEED_MAP: Record<string, number> = {
  quiet: 101, balanced: 102, turbo: 103, max: 104, gentle: 105, auto: 106,
};

const MOP_MODE_NAME_TO_CODE: Record<string, number> = {
  standard: 300,
  deep: 301,
  deep_plus: 303,
  fast: 304,
};

const MOP_INTENSITY_NAME_TO_CODE: Record<string, number> = {
  off: 200,
  low: 201,
  medium: 202,
  high: 203,
  custom: 204,
};

interface DeviceExtras {
  consumables: RoborockConsumables | null;
  cleanSummary: RoborockCleanSummary | null;
  rooms: VacuumRoom[];
}

interface LocalVacuumCtx {
  kind: 'local';
  entryId: string;
  label: string;
  client: MiioClient;
  pollTimer: ReturnType<typeof setInterval> | null;
  slowPollTimer: ReturnType<typeof setInterval> | null;
  mapPollTimer: ReturnType<typeof setInterval> | null;
  extras: DeviceExtras;
}

interface CloudVacuumCtx {
  kind: 'cloud';
  entryId: string;
  /** Session token from bridge DeviceManager */
  sessionToken: string;
  devices: BridgeDevice[];
  pollTimer: ReturnType<typeof setInterval> | null;
  slowPollTimer: ReturnType<typeof setInterval> | null;
  mapPollTimer: ReturnType<typeof setInterval> | null;
  /** Per-device extras keyed by duid */
  extras: Map<string, DeviceExtras>;
}

type VacuumCtx = LocalVacuumCtx | CloudVacuumCtx;

function emptyExtras(): DeviceExtras {
  return { consumables: null, cleanSummary: null, rooms: [] };
}

function isLocalEntry(config: Record<string, string>): boolean {
  if (config.local_miio === 'true') return true;
  if (config.cloud_user_data?.trim() || config.cloud_session?.trim()) return false;
  return Boolean(config.host?.trim() && config.token?.trim());
}

function resolveMopMode(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (Object.prototype.hasOwnProperty.call(MOP_MODE_NAME_TO_CODE, value)) {
    return MOP_MODE_NAME_TO_CODE[value];
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function resolveMopIntensity(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (Object.prototype.hasOwnProperty.call(MOP_INTENSITY_NAME_TO_CODE, value)) {
    return MOP_INTENSITY_NAME_TO_CODE[value];
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export class RoborockIntegration implements Integration {
  readonly id = 'roborock' as const;
  private vacuums = new Map<string, VacuumCtx>();
  /** Live map PNG per device id */
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
          slowPollTimer: null,
          mapPollTimer: null,
          extras: emptyExtras(),
        };
        this.vacuums.set(`local:${entry.id}`, ctx);

        try {
          await this.poll(ctx);
          await this.pollSlow(ctx).catch(() => {});
          this.lastConnected = Date.now();
        } catch (err) {
          log.error({ err, entryId: entry.id }, 'Roborock: initial poll failed');
          this.lastError = String(err);
        }
        ctx.pollTimer = setInterval(() => {
          if (this.stopping) return;
          this.poll(ctx).catch((err) => {
            this.lastError = String(err);
          });
        }, POLL_INTERVAL_MS);
        ctx.slowPollTimer = setInterval(() => {
          if (this.stopping) return;
          this.pollSlow(ctx).catch(() => {});
        }, SLOW_POLL_INTERVAL_MS);

        // Local map rendering (best-effort; requires bridge for render endpoint)
        if (isRoborockBridgeConfigured()) {
          void this.pollLocalMap(ctx).catch(() => {});
          ctx.mapPollTimer = setInterval(() => {
            if (this.stopping) return;
            void this.pollLocalMap(ctx).catch(() => {});
          }, MAP_POLL_MS);
        }
        continue;
      }

      // Cloud via bridge DeviceManager
      if (!isRoborockBridgeConfigured()) {
        log.error(
          { entryId: entry.id },
          'Roborock: cloud entry requires the bridge (set ROBOROCK_BRIDGE_URL)',
        );
        this.lastError = 'Roborock bridge not available';
        continue;
      }

      const email = cfg.cloud_email?.trim();
      const userDataJson = cfg.cloud_user_data?.trim();
      const baseUrl = cfg.cloud_base_url?.trim() || undefined;
      const legacySession = cfg.cloud_session?.trim();

      if (!userDataJson && !legacySession) {
        log.warn({ entryId: entry.id }, 'Roborock: cloud entry missing credentials');
        continue;
      }

      if (!userDataJson) {
        log.warn(
          { entryId: entry.id },
          'Roborock: legacy cloud_session format detected. Please re-authenticate.',
        );
        this.lastError = 'Roborock session needs re-authentication (library upgraded)';
        continue;
      }

      let userData: Record<string, unknown>;
      try {
        userData = JSON.parse(userDataJson) as Record<string, unknown>;
      } catch {
        log.error({ entryId: entry.id }, 'Roborock: invalid cloud_user_data JSON');
        this.lastError = 'Invalid Roborock user data';
        continue;
      }

      let sessionToken: string;
      let devices: BridgeDevice[] = [];
      try {
        const result = await bridgeConnect(email || '', userData, baseUrl);
        sessionToken = result.session_token;
        devices = result.devices;
      } catch (err) {
        log.error({ err, entryId: entry.id }, 'Roborock: bridge connect failed');
        this.lastError = String(err);
        continue;
      }

      if (devices.length === 0) {
        log.warn({ entryId: entry.id }, 'Roborock: no devices on account');
        continue;
      }

      const extras = new Map<string, DeviceExtras>();
      for (const d of devices) extras.set(d.duid, emptyExtras());

      const ctx: CloudVacuumCtx = {
        kind: 'cloud',
        entryId: entry.id,
        sessionToken,
        devices,
        pollTimer: null,
        slowPollTimer: null,
        mapPollTimer: null,
        extras,
      };
      this.vacuums.set(`cloud:${entry.id}`, ctx);

      try {
        await this.poll(ctx);
        await this.pollSlow(ctx).catch(() => {});
        this.lastConnected = Date.now();
      } catch (err) {
        log.error({ err, entryId: entry.id }, 'Roborock: initial cloud poll failed');
        this.lastError = String(err);
      }

      ctx.pollTimer = setInterval(() => {
        if (this.stopping) return;
        this.poll(ctx).catch((err) => {
          this.lastError = String(err);
        });
      }, POLL_INTERVAL_MS);

      ctx.slowPollTimer = setInterval(() => {
        if (this.stopping) return;
        this.pollSlow(ctx).catch(() => {});
      }, SLOW_POLL_INTERVAL_MS);

      void this.pollMaps(ctx).catch(() => {});
      ctx.mapPollTimer = setInterval(() => {
        if (this.stopping) return;
        void this.pollMaps(ctx).catch(() => {});
      }, MAP_POLL_MS);
    }

    if (this.vacuums.size > 0 && this.lastConnected) {
      this.emitHealth('connected');
    }
    log.info({ instances: this.vacuums.size }, 'Roborock integration started');
    integrationDetailLog('roborock', 'Roborock: start() complete', {
      vacuumContexts: this.vacuums.size,
      keys: [...this.vacuums.keys()],
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.vacuums.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
      if (ctx.slowPollTimer) clearInterval(ctx.slowPollTimer);
      if (ctx.mapPollTimer) clearInterval(ctx.mapPollTimer);
      if (ctx.kind === 'cloud') {
        await bridgeDisconnect(ctx.sessionToken).catch(() => {});
      }
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
      log.info({ deviceId: cmd.deviceId, action: cmd.action }, 'Roborock: local miIO vacuum command');
      await this.runLocalCommand(localCtx, cmd);
      log.info({ deviceId: cmd.deviceId, action: cmd.action }, 'Roborock: local miIO command finished');
      setTimeout(() => void this.poll(localCtx).catch(() => {}), 3000);
      return;
    }

    if (cloudCtx) {
      let duid = duidFromId;
      if (!duid) {
        if (cloudCtx.devices.length === 1) duid = cloudCtx.devices[0].duid;
      }
      if (!duid) throw new Error('Roborock: device id must include duid when multiple vacuums are linked');
      log.info(
        { deviceId: cmd.deviceId, action: cmd.action, duid: duid.slice(0, 12) },
        'Roborock: vacuum command via bridge',
      );
      await this.runCloudCommand(cloudCtx, duid, cmd);
      log.info({ deviceId: cmd.deviceId, action: cmd.action }, 'Roborock: vacuum command finished');
      setTimeout(() => void this.poll(cloudCtx).catch(() => {}), 3000);
      return;
    }

    throw new Error('Roborock not found');
  }

  private async runCloudCommand(ctx: CloudVacuumCtx, duid: string, cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'vacuum') return;
    switch (cmd.action) {
      case 'start':
        await bridgeCommand(ctx.sessionToken, duid, 'start');
        break;
      case 'stop':
        await bridgeCommand(ctx.sessionToken, duid, 'stop');
        break;
      case 'pause':
        await bridgeCommand(ctx.sessionToken, duid, 'pause');
        break;
      case 'return_dock':
        await bridgeCommand(ctx.sessionToken, duid, 'return_dock');
        break;
      case 'find':
        await bridgeCommand(ctx.sessionToken, duid, 'find');
        break;
      case 'set_fan_speed': {
        const speed = FAN_SPEED_MAP[cmd.fanSpeed ?? ''] ?? 102;
        await bridgeCommand(ctx.sessionToken, duid, 'set_fan_speed', { fanSpeed: speed });
        break;
      }
      case 'reset_consumable':
        await bridgeCommand(ctx.sessionToken, duid, 'reset_consumable', { consumable: cmd.consumable });
        // Immediately refresh consumables
        setTimeout(() => void this.pollSlow(ctx).catch(() => {}), 1500);
        break;
      case 'segment_clean':
        await bridgeCommand(ctx.sessionToken, duid, 'segment_clean', { roomIds: cmd.roomIds });
        break;
      case 'zone_clean':
        await bridgeCommand(ctx.sessionToken, duid, 'zone_clean', { zones: cmd.zones });
        break;
      case 'goto_target':
        await bridgeCommand(ctx.sessionToken, duid, 'goto_target', { target: cmd.target });
        break;
      case 'set_mop_mode':
        await bridgeCommand(ctx.sessionToken, duid, 'set_mop_mode', {
          mopMode: resolveMopMode(cmd.mopMode) ?? cmd.mopMode,
        });
        break;
      case 'set_mop_intensity':
        await bridgeCommand(ctx.sessionToken, duid, 'set_mop_intensity', {
          mopIntensity: resolveMopIntensity(cmd.mopIntensity) ?? cmd.mopIntensity,
        });
        break;
      case 'set_dnd':
        await bridgeCommand(ctx.sessionToken, duid, 'set_dnd', { dndEnabled: cmd.dndEnabled });
        break;
      case 'set_child_lock':
        await bridgeCommand(ctx.sessionToken, duid, 'set_child_lock', { childLock: cmd.childLock });
        break;
      case 'set_volume':
        await bridgeCommand(ctx.sessionToken, duid, 'set_volume', { volume: cmd.volume });
        break;
      case 'start_dust_collection':
        await bridgeCommand(ctx.sessionToken, duid, 'start_dust_collection');
        break;
      case 'start_mop_wash':
        await bridgeCommand(ctx.sessionToken, duid, 'start_mop_wash');
        break;
      case 'stop_mop_wash':
        await bridgeCommand(ctx.sessionToken, duid, 'stop_mop_wash');
        break;
      default: {
        const a = (cmd as { action?: string }).action;
        throw new Error(`Roborock: unsupported vacuum action ${a ?? '(missing)'}`);
      }
    }
  }

  private async runLocalCommand(ctx: LocalVacuumCtx, cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'vacuum') return;
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
      case 'reset_consumable':
        if (cmd.consumable) {
          await ctx.client.resetConsumable(cmd.consumable);
          setTimeout(() => void this.pollSlow(ctx).catch(() => {}), 1500);
        }
        break;
      case 'segment_clean':
        if (cmd.roomIds?.length) await ctx.client.segmentClean(cmd.roomIds);
        break;
      case 'zone_clean':
        if (cmd.zones?.length) await ctx.client.zonedClean(cmd.zones);
        break;
      case 'goto_target':
        if (cmd.target && cmd.target.length === 2) {
          await ctx.client.gotoTarget(cmd.target[0], cmd.target[1]);
        }
        break;
      case 'set_mop_mode': {
        const code = resolveMopMode(cmd.mopMode);
        if (code != null) await ctx.client.setMopMode(code);
        break;
      }
      case 'set_mop_intensity': {
        const code = resolveMopIntensity(cmd.mopIntensity);
        if (code != null) await ctx.client.setMopIntensity(code);
        break;
      }
      case 'set_dnd':
        await ctx.client.setDnd(Boolean(cmd.dndEnabled));
        break;
      case 'set_child_lock':
        await ctx.client.setChildLock(Boolean(cmd.childLock));
        break;
      case 'set_volume':
        if (typeof cmd.volume === 'number') await ctx.client.setVolume(cmd.volume);
        break;
      case 'start_dust_collection':
        await ctx.client.startDustCollection();
        break;
      case 'start_mop_wash':
        await ctx.client.startMopWash();
        break;
      case 'stop_mop_wash':
        await ctx.client.stopMopWash();
        break;
      default: {
        const a = (cmd as { action?: string }).action;
        throw new Error(`Roborock: unsupported vacuum action (local) ${a ?? '(missing)'}`);
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
      const vacuum = mapVacuumState(ctx.entryId, ctx.label, status, undefined, {
        consumables: ctx.extras.consumables,
        cleanSummary: ctx.extras.cleanSummary,
        rooms: ctx.extras.rooms,
      });
      stateStore.update(vacuum);
      const sensors = mapConsumableSensors(ctx.entryId, vacuum.id, ctx.label, ctx.extras.consumables);
      for (const s of sensors) stateStore.update(s);
      if (status) this.lastConnected = Date.now();
      integrationDetailLog('roborock', 'Roborock: local miIO poll', {
        entryId: ctx.entryId,
        hasStatus: Boolean(status),
        battery: status?.battery,
        state: status?.state,
      });
      return;
    }

    let anyOk = false;
    for (const dev of ctx.devices) {
      try {
        const res = await bridgeStatus(ctx.sessionToken, dev.duid);
        const extras = ctx.extras.get(dev.duid) ?? emptyExtras();
        const vacuum = mapVacuumState(ctx.entryId, dev.name, res.status, dev.duid, {
          consumables: extras.consumables,
          cleanSummary: extras.cleanSummary,
          rooms: extras.rooms,
        });
        stateStore.update(vacuum);
        const sensors = mapConsumableSensors(ctx.entryId, vacuum.id, dev.name, extras.consumables, dev.duid);
        for (const s of sensors) stateStore.update(s);
        if (res.status) anyOk = true;
        integrationDetailLog('roborock', 'Roborock: cloud/bridge poll', {
          entryId: ctx.entryId,
          duidPrefix: dev.duid.slice(0, 16),
          transport: res.transport,
          battery: res.status?.battery,
          state: res.status?.state,
        });
      } catch (err) {
        log.warn(
          { err: String(err), duid: dev.duid.slice(0, 12) },
          'Roborock: status poll failed',
        );
        stateStore.update(mapVacuumState(ctx.entryId, dev.name, null, dev.duid));
      }
    }
    if (anyOk) this.lastConnected = Date.now();
  }

  /** Poll slow-changing data (consumables, clean summary, rooms) and publish. */
  private async pollSlow(ctx: VacuumCtx): Promise<void> {
    if (ctx.kind === 'local') {
      const [consumables, cleanSummary, roomMap] = await Promise.all([
        ctx.client.getConsumables().catch(() => null),
        ctx.client.getCleanSummary().catch(() => null),
        ctx.client.getRoomMapping().catch(() => [] as Array<[number, string]>),
      ]);
      ctx.extras.consumables = consumables;
      ctx.extras.cleanSummary = cleanSummary;
      ctx.extras.rooms = roomMap.map(([id, name]) => ({ id, name }));
      // Re-emit vacuum with updated extras & new sensors
      const prev = stateStore.get(vacuumDeviceId(ctx.entryId));
      const prevName = (prev?.type === 'vacuum' ? prev.name : ctx.label) || ctx.label;
      const status = await ctx.client.getStatus().catch(() => null);
      const vacuum = mapVacuumState(ctx.entryId, prevName, status, undefined, {
        consumables,
        cleanSummary,
        rooms: ctx.extras.rooms,
      });
      stateStore.update(vacuum);
      const sensors = mapConsumableSensors(ctx.entryId, vacuum.id, prevName, consumables);
      for (const s of sensors) stateStore.update(s);
      return;
    }

    for (const dev of ctx.devices) {
      try {
        const [consumables, cleanSummary, rooms] = await Promise.all([
          bridgeConsumables(ctx.sessionToken, dev.duid).catch(() => null),
          bridgeCleanSummary(ctx.sessionToken, dev.duid).catch(() => null),
          bridgeRooms(ctx.sessionToken, dev.duid).catch(() => [] as VacuumRoom[]),
        ]);
        const extras: DeviceExtras = {
          consumables,
          cleanSummary,
          rooms: (rooms ?? []).map((r) => ({ id: r.id, name: r.name })),
        };
        ctx.extras.set(dev.duid, extras);

        // Emit updated vacuum and sensors
        const id = vacuumDeviceId(ctx.entryId, dev.duid);
        const prev = stateStore.get(id);
        const prevName = (prev?.type === 'vacuum' ? prev.name : dev.name) || dev.name;
        try {
          const res = await bridgeStatus(ctx.sessionToken, dev.duid);
          const vacuum = mapVacuumState(ctx.entryId, prevName, res.status, dev.duid, {
            consumables,
            cleanSummary,
            rooms: extras.rooms,
          });
          stateStore.update(vacuum);
        } catch {
          // ignore — regular poll will retry
        }
        const sensors = mapConsumableSensors(ctx.entryId, id, prevName, consumables, dev.duid);
        for (const s of sensors) stateStore.update(s);
      } catch (err) {
        log.debug({ err, duid: dev.duid.slice(0, 12) }, 'Roborock: slow poll failed');
      }
    }
  }

  private async pollMaps(ctx: CloudVacuumCtx): Promise<void> {
    for (const dev of ctx.devices) {
      const id = vacuumDeviceId(ctx.entryId, dev.duid);
      try {
        const { png, rooms } = await bridgeMap(ctx.sessionToken, dev.duid);
        if (png && png.length > 200) {
          this.mapCache.set(id, png);
          const prev = stateStore.get(id);
          if (prev?.type === 'vacuum') {
            // Merge rooms from map parser if we didn't get them from room mapping
            const extras = ctx.extras.get(dev.duid) ?? emptyExtras();
            if (extras.rooms.length === 0 && rooms.length > 0) {
              extras.rooms = rooms.map((r) => ({ id: r.id, name: r.name }));
              ctx.extras.set(dev.duid, extras);
            }
            stateStore.update({
              ...prev,
              mapUpdatedAt: Date.now(),
              lastUpdated: Date.now(),
              rooms: extras.rooms.length > 0 ? extras.rooms : prev.rooms,
            });
          }
        }
      } catch (err) {
        log.debug({ err, duid: dev.duid }, 'Roborock map poll skipped');
      }
    }
  }

  /** Local-mode map: fetch raw bytes via miIO, render via bridge /v1/render-map */
  private async pollLocalMap(ctx: LocalVacuumCtx): Promise<void> {
    try {
      const raw = await ctx.client.getMap();
      if (!raw || raw.length < 200) return;
      // If already a PNG, use directly
      const isPng = raw.length > 8 && raw.readUInt32BE(0) === 0x89504e47;
      let png: Buffer | null = null;
      if (isPng) {
        png = raw;
      } else if (isRoborockBridgeConfigured()) {
        png = await bridgeRenderMap(raw.toString('base64'));
      }
      if (png && png.length > 200) {
        const id = vacuumDeviceId(ctx.entryId);
        this.mapCache.set(id, png);
        const prev = stateStore.get(id);
        if (prev?.type === 'vacuum') {
          stateStore.update({
            ...prev,
            mapUpdatedAt: Date.now(),
            lastUpdated: Date.now(),
          });
        }
      }
    } catch (err) {
      log.debug({ err, entryId: ctx.entryId }, 'Roborock local map render skipped');
    }
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
