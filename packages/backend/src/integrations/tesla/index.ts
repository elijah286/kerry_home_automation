// ---------------------------------------------------------------------------
// Tesla integration — Owner API (vehicle_data + streaming) + energy sites
// ---------------------------------------------------------------------------

import type {
  IntegrationHealth,
  DeviceCommand,
  IntegrationId,
  VehicleState,
  VehicleCommand,
  EnergySiteCommand,
  ConnectionState,
} from '@ha/shared';
import type { Integration } from '../registry.js';
import type { TeslaVehicleListItem, TeslaEnergySiteListItem, TeslaEnergySiteInfo } from './api-client.js';
import { TeslaApiClient } from './api-client.js';
import { mapVehicleData, mapVehicleStub, mapEnergySiteLive } from './mapper.js';
import { startOwnerStreaming, type OwnerStreamingHandle } from './owner-streaming.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import * as entryStore from '../../db/integration-entry-store.js';

const VEHICLE_POLL_IDLE_MS = 5 * 60_000;   // 5 minutes when parked/asleep
const VEHICLE_POLL_ACTIVE_MS = 30_000;      // 30 seconds when driving or charging
const ENERGY_POLL_MS = 30_000;              // 30 seconds

interface EntryContext {
  client: TeslaApiClient;
  entryId: string;
  label: string;
  vehicles: TeslaVehicleListItem[];
  energySites: TeslaEnergySiteListItem[];
  /** Cached site_info per site — fetched once at startup, refreshed on reconnect */
  siteInfoCache: Map<string, TeslaEnergySiteInfo>;
  /** Tracks which vehicles are actively driving/charging for adaptive polling */
  activeVehicles: Set<string>;
  /** TeslaMate-style Owner streaming WebSocket(s) for live GPS / drive fields */
  streaming?: OwnerStreamingHandle;
}

export class TeslaIntegration implements Integration {
  readonly id: IntegrationId = 'tesla';
  private entries = new Map<string, EntryContext>();
  private pollTimers: NodeJS.Timeout[] = [];
  private connectionState: ConnectionState = 'init';
  private lastError: string | null = null;
  private lastConnected: number | null = null;
  private failureCount = 0;

  private readonly log = logger.child({ integration: 'tesla' });

  // ---- Lifecycle ----------------------------------------------------------

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('tesla');
    if (entries.length === 0) {
      this.log.info('No Tesla entries configured, skipping');
      return;
    }

    this.connectionState = 'connecting';

    for (const entry of entries) {
      if (!entry.enabled) continue;
      try {
        await this.initEntry(entry.id, entry.label, entry.config);
      } catch (err) {
        this.log.error({ err, entryId: entry.id }, 'Failed to initialize Tesla entry');
        this.lastError = (err as Error).message;
        this.failureCount++;
      }
    }

    if (this.entries.size > 0) {
      this.connectionState = 'connected';
      this.lastConnected = Date.now();
      this.startPolling();
    } else if (entries.length > 0) {
      this.connectionState = 'error';
    }
  }

  private async initEntry(
    entryId: string,
    label: string,
    config: Record<string, string>,
  ): Promise<void> {
    const client = new TeslaApiClient({
      entryId,
      refreshToken: config.refresh_token,
      onTokenRotated: async (id, newToken) => {
        const entry = await entryStore.getEntry(id);
        if (entry) {
          entry.config.refresh_token = newToken;
          await entryStore.saveEntry(entry);
        }
      },
    });

    await client.authenticate();
    this.log.info({ entryId, label }, 'Tesla entry authenticated');

    const ctx: EntryContext = {
      client, entryId, label,
      vehicles: [], energySites: [],
      siteInfoCache: new Map(),
      activeVehicles: new Set(),
    };

    // Discover vehicles
    if (config.include_vehicles !== 'false') {
      try {
        ctx.vehicles = await client.getVehicles();
        this.log.info({ entryId, count: ctx.vehicles.length }, 'Tesla vehicles discovered');
        // Register initial stubs (don't wake sleeping vehicles)
        for (const v of ctx.vehicles) {
          if (v.state === 'online') {
            const data = await client.getVehicleData(v.vin);
            if (data) {
              stateStore.update(mapVehicleData(entryId, v, data));
            } else {
              stateStore.update(mapVehicleStub(entryId, v));
            }
          } else {
            stateStore.update(mapVehicleStub(entryId, v));
          }
        }
      } catch (err) {
        this.log.error({ err, entryId }, 'Failed to discover vehicles');
      }
    }

    // Discover energy sites
    if (config.include_energy_sites !== 'false') {
      try {
        ctx.energySites = await client.getEnergySites();
        this.log.info({ entryId, count: ctx.energySites.length }, 'Tesla energy sites discovered');
        for (const site of ctx.energySites) {
          // Fetch site_info for static config (battery count, capacity, etc.)
          const siteInfo = await client.getEnergySiteInfo(site.energy_site_id);
          if (siteInfo) {
            ctx.siteInfoCache.set(site.energy_site_id, siteInfo);
            this.log.info(
              { entryId, siteId: site.energy_site_id, batteries: siteInfo.battery_count },
              'Energy site info loaded',
            );
          }
          const live = await client.getEnergySiteLiveStatus(site.energy_site_id);
          if (live) {
            stateStore.update(
              mapEnergySiteLive(entryId, site.energy_site_id, site.site_name, live, siteInfo),
            );
          }
        }
      } catch (err) {
        this.log.error({ err, entryId }, 'Failed to discover energy sites');
      }
    }

    if (ctx.vehicles.length > 0 && config.owner_streaming !== 'false') {
      ctx.streaming = startOwnerStreaming({ entryId, client, vehicles: ctx.vehicles });
      this.log.info({ entryId, vehicles: ctx.vehicles.length }, 'Tesla Owner API streaming started (live location)');
    }

    this.entries.set(entryId, ctx);
  }

  private startPolling(): void {
    // Vehicle poll — adaptive: 30s when driving/charging, 5min when idle/asleep
    // We use the faster interval and skip idle vehicles based on their state
    const vehicleTimer = setInterval(() => void this.pollVehicles(), VEHICLE_POLL_ACTIVE_MS);
    this.pollTimers.push(vehicleTimer);

    // Energy site poll — every 30s
    const energyTimer = setInterval(() => void this.pollEnergySites(), ENERGY_POLL_MS);
    this.pollTimers.push(energyTimer);
  }

  /** Tracks last full poll time per vehicle for idle throttling */
  private lastVehiclePoll = new Map<string, number>();

  private async pollVehicles(): Promise<void> {
    const nowMs = Date.now();
    for (const ctx of this.entries.values()) {
      if (ctx.vehicles.length === 0) continue;
      try {
        // Refresh vehicle list (safe — doesn't wake vehicles)
        const vehicles = await ctx.client.getVehicles();
        ctx.vehicles = vehicles;

        for (const v of vehicles) {
          const deviceId = `tesla.${ctx.entryId}.vehicle.${v.vin}`;
          const existing = stateStore.get(deviceId) as VehicleState | undefined;

          if (v.state === 'online') {
            const isActive = ctx.activeVehicles.has(v.vin);
            const lastPoll = this.lastVehiclePoll.get(v.vin) ?? 0;
            const elapsed = nowMs - lastPoll;

            // Skip this poll if vehicle is idle and we polled recently
            if (!isActive && elapsed < VEHICLE_POLL_IDLE_MS) continue;

            const data = await ctx.client.getVehicleData(v.vin);
            if (data) {
              const state = mapVehicleData(ctx.entryId, v, data);
              stateStore.update(state);
              this.lastVehiclePoll.set(v.vin, nowMs);

              // Determine if vehicle is active (driving or charging)
              const isDriving = state.shiftState === 'D' || state.shiftState === 'R';
              const isCharging = state.chargeState === 'charging';
              if (isDriving || isCharging) {
                ctx.activeVehicles.add(v.vin);
              } else {
                ctx.activeVehicles.delete(v.vin);
              }
            }
          } else {
            // Asleep/offline — update sleep state without waking
            ctx.activeVehicles.delete(v.vin);
            stateStore.update(mapVehicleStub(ctx.entryId, v, existing));
          }
        }
      } catch (err) {
        this.log.error({ err, entryId: ctx.entryId }, 'Vehicle poll failed');
      }
    }
  }

  private async pollEnergySites(): Promise<void> {
    for (const ctx of this.entries.values()) {
      for (const site of ctx.energySites) {
        try {
          const live = await ctx.client.getEnergySiteLiveStatus(site.energy_site_id);
          if (live) {
            const siteInfo = ctx.siteInfoCache.get(site.energy_site_id);
            stateStore.update(
              mapEnergySiteLive(ctx.entryId, site.energy_site_id, site.site_name, live, siteInfo),
            );
          }
        } catch (err) {
          this.log.error({ err, siteId: site.energy_site_id }, 'Energy site poll failed');
        }
      }
    }
  }

  // ---- Commands -----------------------------------------------------------

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    // Device ID format: tesla.{entryId}.vehicle.{vin} or tesla.{entryId}.site.{siteId}
    const parts = cmd.deviceId.split('.');
    if (parts.length < 4 || parts[0] !== 'tesla') {
      throw new Error(`Invalid Tesla device ID: ${cmd.deviceId}`);
    }
    const entryId = parts[1];
    const kind = parts[2]; // 'vehicle' or 'site'
    const targetId = parts.slice(3).join('.'); // vin or siteId

    const ctx = this.entries.get(entryId);
    if (!ctx) throw new Error(`Tesla entry not found: ${entryId}`);

    if (kind === 'vehicle' && cmd.type === 'vehicle') {
      await this.handleVehicleCommand(ctx, targetId, cmd as VehicleCommand);
    } else if (kind === 'site' && cmd.type === 'energy_site') {
      await this.handleEnergySiteCommand(ctx, targetId, cmd as EnergySiteCommand);
    } else {
      throw new Error(`Unknown Tesla device kind: ${kind}`);
    }
  }

  private async handleVehicleCommand(
    ctx: EntryContext,
    vin: string,
    cmd: VehicleCommand,
  ): Promise<void> {
    const { client } = ctx;

    switch (cmd.action) {
      case 'door_lock':
        await client.sendVehicleCommand(vin, 'door_lock');
        break;
      case 'door_unlock':
        await client.sendVehicleCommand(vin, 'door_unlock');
        break;
      case 'climate_start':
        await client.sendVehicleCommand(vin, 'auto_conditioning_start');
        break;
      case 'climate_stop':
        await client.sendVehicleCommand(vin, 'auto_conditioning_stop');
        break;
      case 'charge_start':
        await client.sendVehicleCommand(vin, 'charge_start');
        break;
      case 'charge_stop':
        await client.sendVehicleCommand(vin, 'charge_stop');
        break;
      case 'actuate_trunk':
        await client.sendVehicleCommand(vin, 'actuate_trunk', {
          which_trunk: cmd.trunk ?? 'rear',
        });
        break;
      case 'flash_lights':
        await client.sendVehicleCommand(vin, 'flash_lights');
        break;
      case 'honk_horn':
        await client.sendVehicleCommand(vin, 'honk_horn');
        break;
      case 'set_charge_limit':
        if (cmd.chargeLimit != null) {
          await client.sendVehicleCommand(vin, 'set_charge_limit', {
            percent: cmd.chargeLimit,
          });
        }
        break;
      case 'set_temps':
        await client.sendVehicleCommand(vin, 'set_temps', {
          driver_temp: cmd.driverTemp,
          passenger_temp: cmd.passengerTemp,
        });
        break;
      default:
        throw new Error(`Unknown vehicle action: ${(cmd as VehicleCommand).action}`);
    }

    // Refresh vehicle data after command (vehicle is now awake)
    this.log.info({ vin, action: cmd.action }, 'Vehicle command sent, refreshing state');
    setTimeout(async () => {
      try {
        const data = await client.getVehicleData(vin);
        const vItem = ctx.vehicles.find((v) => v.vin === vin);
        if (data && vItem) {
          stateStore.update(mapVehicleData(ctx.entryId, vItem, data));
        }
      } catch { /* ignore */ }
    }, 3000);
  }

  private async handleEnergySiteCommand(
    ctx: EntryContext,
    siteId: string,
    cmd: EnergySiteCommand,
  ): Promise<void> {
    const { client } = ctx;

    switch (cmd.action) {
      case 'set_backup_reserve':
        if (cmd.backupReservePercent != null) {
          await client.sendEnergySiteCommand(siteId, 'backup', {
            backup_reserve_percent: cmd.backupReservePercent,
          });
        }
        break;
      case 'set_operation_mode':
        if (cmd.operationMode) {
          await client.sendEnergySiteCommand(siteId, 'operation', {
            default_real_mode: cmd.operationMode,
          });
        }
        break;
      case 'set_storm_mode':
        if (cmd.stormModeEnabled != null) {
          await client.sendEnergySiteCommand(siteId, 'storm_mode', {
            enabled: cmd.stormModeEnabled,
          });
        }
        break;
      default:
        throw new Error(`Unknown energy site action: ${(cmd as EnergySiteCommand).action}`);
    }

    // Refresh after command
    setTimeout(async () => {
      try {
        const live = await client.getEnergySiteLiveStatus(siteId);
        const site = ctx.energySites.find((s) => s.energy_site_id === siteId);
        if (live && site) {
          stateStore.update(mapEnergySiteLive(ctx.entryId, siteId, site.site_name, live));
        }
      } catch { /* ignore */ }
    }, 2000);
  }

  // ---- Lifecycle ----------------------------------------------------------

  async stop(): Promise<void> {
    for (const timer of this.pollTimers) clearInterval(timer);
    this.pollTimers = [];
    for (const ctx of this.entries.values()) {
      ctx.streaming?.stop();
    }
    this.entries.clear();
    this.connectionState = 'disconnected';
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.connectionState,
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: this.failureCount,
    };
  }
}
