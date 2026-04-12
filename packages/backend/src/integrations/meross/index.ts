// ---------------------------------------------------------------------------
// Meross LAN integration: local HTTP control
// Each entry = one Meross device
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { MerossClient } from './meross-client.js';
import { mapGarageDoor, mapMotionSensor } from './mapper.js';

const POLL_INTERVAL_MS = 15_000;

interface DeviceCtx {
  entryId: string;
  label: string;
  deviceType: string; // MSG100, MS100, etc.
  client: MerossClient;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class MerossIntegration implements Integration {
  readonly id = 'meross' as const;
  private devices = new Map<string, DeviceCtx>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('meross');
    if (entries.length === 0) return;

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled || !entry.config.host || !entry.config.key) continue;
      const client = new MerossClient(entry.config.host, entry.config.key);
      const deviceType = (entry.config.device_type ?? '').toUpperCase();
      const ctx: DeviceCtx = {
        entryId: entry.id,
        label: entry.label || deviceType || 'Meross Device',
        deviceType,
        client,
        pollTimer: null,
      };
      this.devices.set(entry.id, ctx);

      try {
        await this.poll(ctx);
        this.lastConnected = Date.now();
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'Meross: initial poll failed');
        this.lastError = String(err);
      }

      ctx.pollTimer = setInterval(() => {
        if (this.stopping) return;
        this.poll(ctx).catch((err) => {
          this.lastError = String(err);
        });
      }, POLL_INTERVAL_MS);
    }

    if (this.devices.size > 0 && this.lastConnected) {
      this.emitHealth('connected');
    }
    logger.info({ devices: this.devices.size }, 'Meross integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.devices.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    }
    this.devices.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'garage_door') return;
    const parts = cmd.deviceId.split('.');
    const entryId = parts[1];
    const ctx = this.devices.get(entryId);
    if (!ctx) throw new Error('Meross device not found');

    await ctx.client.toggleGarage(cmd.action === 'open');
    setTimeout(() => void this.poll(ctx).catch(() => {}), 3000);
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.devices.size > 0 ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async poll(ctx: DeviceCtx): Promise<void> {
    const available = await ctx.client.isReachable();

    if (ctx.deviceType.startsWith('MSG')) {
      const state = await ctx.client.getGarageState();
      stateStore.update(mapGarageDoor(ctx.entryId, ctx.label, state, available));
    } else if (ctx.deviceType.startsWith('MS')) {
      const data = await ctx.client.getSensorData();
      stateStore.update(mapMotionSensor(ctx.entryId, ctx.label, data, available));
    }

    if (available) this.lastConnected = Date.now();
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
