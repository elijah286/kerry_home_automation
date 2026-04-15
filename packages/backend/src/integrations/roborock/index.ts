// ---------------------------------------------------------------------------
// Roborock: local miIO (UDP) or cloud session via bridge DeviceManager
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { integrationDetailLog } from '../../integration-debug.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { MiioClient } from './miio-client.js';
import { mapVacuumState } from './mapper.js';
import {
  bridgeCommand,
  bridgeConnect,
  bridgeDisconnect,
  bridgeMap,
  bridgeStatus,
  isRoborockBridgeConfigured,
  type BridgeDevice,
} from './bridge-client.js';

const log = logger.child({ integration: 'roborock' });

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
  /** Session token from bridge DeviceManager */
  sessionToken: string;
  devices: BridgeDevice[];
  pollTimer: ReturnType<typeof setInterval> | null;
  mapPollTimer: ReturnType<typeof setInterval> | null;
}

type VacuumCtx = LocalVacuumCtx | CloudVacuumCtx;

function isLocalEntry(config: Record<string, string>): boolean {
  if (config.local_miio === 'true') return true;
  // New session format: cloud_user_data (JSON) — or legacy cloud_session (pickle b64)
  if (config.cloud_user_data?.trim() || config.cloud_session?.trim()) return false;
  return Boolean(config.host?.trim() && config.token?.trim());
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
          log.error({ err, entryId: entry.id }, 'Roborock: initial poll failed');
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

      // Cloud via bridge DeviceManager
      if (!isRoborockBridgeConfigured()) {
        log.error(
          { entryId: entry.id },
          'Roborock: cloud entry requires the bridge (set ROBOROCK_BRIDGE_URL)',
        );
        this.lastError = 'Roborock bridge not available';
        continue;
      }

      // Support both new (cloud_user_data JSON) and legacy (cloud_session pickle) formats
      const email = cfg.cloud_email?.trim();
      const userDataJson = cfg.cloud_user_data?.trim();
      const baseUrl = cfg.cloud_base_url?.trim() || undefined;
      const legacySession = cfg.cloud_session?.trim();

      if (!userDataJson && !legacySession) {
        log.warn({ entryId: entry.id }, 'Roborock: cloud entry missing credentials');
        continue;
      }

      if (!userDataJson) {
        // Legacy pickle session — user must re-authenticate
        log.warn(
          { entryId: entry.id },
          'Roborock: legacy cloud_session format detected. Please re-authenticate via the Roborock integration card to upgrade to the new session format.',
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

      const ctx: CloudVacuumCtx = {
        kind: 'cloud',
        entryId: entry.id,
        sessionToken,
        devices,
        pollTimer: null,
        mapPollTimer: null,
      };
      this.vacuums.set(`cloud:${entry.id}`, ctx);

      try {
        await this.poll(ctx);
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
    integrationDetailLog(
      'roborock',
      'Roborock: start() complete',
      {
        vacuumContexts: this.vacuums.size,
        keys: [...this.vacuums.keys()],
      },
    );
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.vacuums.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
      if (ctx.kind === 'cloud') {
        if (ctx.mapPollTimer) clearInterval(ctx.mapPollTimer);
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
      switch (cmd.action) {
        case 'start':
          await bridgeCommand(cloudCtx.sessionToken, duid, 'start');
          break;
        case 'stop':
          await bridgeCommand(cloudCtx.sessionToken, duid, 'stop');
          break;
        case 'pause':
          await bridgeCommand(cloudCtx.sessionToken, duid, 'pause');
          break;
        case 'return_dock':
          await bridgeCommand(cloudCtx.sessionToken, duid, 'return_dock');
          break;
        case 'find':
          await bridgeCommand(cloudCtx.sessionToken, duid, 'find');
          break;
        case 'set_fan_speed': {
          const speed = FAN_SPEED_MAP[cmd.fanSpeed ?? ''] ?? 102;
          await bridgeCommand(cloudCtx.sessionToken, duid, 'set_fan_speed', { fanSpeed: speed });
          break;
        }
        default: {
          const a = (cmd as { action?: string }).action;
          throw new Error(`Roborock: unsupported vacuum action ${a ?? '(missing)'}`);
        }
      }
      log.info({ deviceId: cmd.deviceId, action: cmd.action }, 'Roborock: vacuum command finished');
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
        stateStore.update(
          mapVacuumState(ctx.entryId, dev.name, res.status, dev.duid),
        );
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

  private async pollMaps(ctx: CloudVacuumCtx): Promise<void> {
    for (const dev of ctx.devices) {
      const deviceId = `roborock.${ctx.entryId}.${dev.duid}.vacuum`;
      try {
        const { png } = await bridgeMap(ctx.sessionToken, dev.duid);
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
        log.debug({ err, duid: dev.duid }, 'Roborock map poll skipped');
      }
    }
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
