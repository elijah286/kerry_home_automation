// ---------------------------------------------------------------------------
// Rachio integration: cloud REST API
// One entry = one Rachio account (may have multiple controllers)
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { RachioClient, type RachioDevice } from './api-client.js';
import { mapSprinklerState } from './mapper.js';

const POLL_INTERVAL_MS = 60_000;

interface AccountCtx {
  entryId: string;
  client: RachioClient;
  personId: string;
  devices: RachioDevice[];
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class RachioIntegration implements Integration {
  readonly id = 'rachio' as const;
  private accounts = new Map<string, AccountCtx>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('rachio');
    if (entries.length === 0) return;

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled || !entry.config.api_key) continue;
      const client = new RachioClient(entry.config.api_key);

      try {
        const personId = await client.getPersonId();
        const devices = await client.getDevices(personId);
        const ctx: AccountCtx = { entryId: entry.id, client, personId, devices, pollTimer: null };
        this.accounts.set(entry.id, ctx);

        // Initial state
        await this.poll(ctx);
        this.lastConnected = Date.now();

        ctx.pollTimer = setInterval(() => {
          if (this.stopping) return;
          this.poll(ctx).catch((err) => {
            this.lastError = String(err);
          });
        }, POLL_INTERVAL_MS);

        logger.info({ entryId: entry.id, devices: devices.length }, 'Rachio: discovered controllers');
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'Rachio: failed to connect');
        this.lastError = String(err);
      }
    }

    if (this.accounts.size > 0 && this.lastConnected) {
      this.emitHealth('connected');
    }
    logger.info({ accounts: this.accounts.size }, 'Rachio integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.accounts.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    }
    this.accounts.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'sprinkler') return;
    const parts = cmd.deviceId.split('.');
    const entryId = parts[1];
    const rachioDeviceId = parts[2];
    const ctx = this.accounts.get(entryId);
    if (!ctx) throw new Error('Rachio account not found');

    switch (cmd.action) {
      case 'start_zone':
        if (cmd.zoneId) {
          await ctx.client.startZone(cmd.zoneId, cmd.duration ?? 300);
        }
        break;
      case 'stop':
        await ctx.client.stopWatering(rachioDeviceId);
        break;
      case 'standby_on':
        await ctx.client.standbyOn(rachioDeviceId);
        break;
      case 'standby_off':
        await ctx.client.standbyOff(rachioDeviceId);
        break;
      case 'rain_delay':
        await ctx.client.rainDelay(rachioDeviceId, cmd.rainDelayDays ?? 1);
        break;
    }

    setTimeout(() => void this.poll(ctx).catch(() => {}), 3000);
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.accounts.size > 0 ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async poll(ctx: AccountCtx): Promise<void> {
    for (const device of ctx.devices) {
      const schedule = await ctx.client.getCurrentSchedule(device.id);
      stateStore.update(mapSprinklerState(ctx.entryId, device, schedule));
    }
    this.lastConnected = Date.now();
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
