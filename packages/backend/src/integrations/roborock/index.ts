// ---------------------------------------------------------------------------
// Roborock integration: miIO local protocol
// Each entry = one robot vacuum
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { MiioClient } from './miio-client.js';
import { mapVacuumState } from './mapper.js';

const POLL_INTERVAL_MS = 30_000;

const FAN_SPEED_MAP: Record<string, number> = {
  quiet: 101, balanced: 102, turbo: 103, max: 104, gentle: 105, auto: 106,
};

interface VacuumCtx {
  entryId: string;
  label: string;
  client: MiioClient;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class RoborockIntegration implements Integration {
  readonly id = 'roborock' as const;
  private vacuums = new Map<string, VacuumCtx>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('roborock');
    if (entries.length === 0) return;

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled || !entry.config.host || !entry.config.token) continue;
      const client = new MiioClient(entry.config.host, entry.config.token);
      const ctx: VacuumCtx = {
        entryId: entry.id,
        label: entry.label || 'Roborock',
        client,
        pollTimer: null,
      };
      this.vacuums.set(entry.id, ctx);

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
    }

    if (this.vacuums.size > 0 && this.lastConnected) {
      this.emitHealth('connected');
    }
    logger.info({ vacuums: this.vacuums.size }, 'Roborock integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.vacuums.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
      ctx.client.disconnect();
    }
    this.vacuums.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'vacuum') return;
    const parts = cmd.deviceId.split('.');
    const entryId = parts[1];
    const ctx = this.vacuums.get(entryId);
    if (!ctx) throw new Error('Roborock not found');

    switch (cmd.action) {
      case 'start': await ctx.client.startCleaning(); break;
      case 'stop': await ctx.client.stopCleaning(); break;
      case 'pause': await ctx.client.pauseCleaning(); break;
      case 'return_dock': await ctx.client.returnToDock(); break;
      case 'find': await ctx.client.findMe(); break;
      case 'set_fan_speed': {
        const speed = FAN_SPEED_MAP[cmd.fanSpeed ?? ''] ?? 102;
        await ctx.client.setFanSpeed(speed);
        break;
      }
    }

    setTimeout(() => void this.poll(ctx).catch(() => {}), 3000);
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
    const status = await ctx.client.getStatus();
    stateStore.update(mapVacuumState(ctx.entryId, ctx.label, status));
    if (status) this.lastConnected = Date.now();
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
