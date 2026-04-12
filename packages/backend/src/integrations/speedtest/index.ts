// ---------------------------------------------------------------------------
// Speedtest integration: periodic internet speed tests via Ookla CLI
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { SpeedtestClient } from './speedtest-client.js';
import { mapSpeedtest } from './mapper.js';

export class SpeedtestIntegration implements Integration {
  readonly id = 'speedtest' as const;
  private client: SpeedtestClient | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;
  private entryId: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('speedtest');
    if (entries.length === 0) return;

    const entry = entries[0];
    if (!entry.enabled) return;

    this.stopping = false;
    this.entryId = entry.id;
    this.emitHealth('connecting');

    const serverId = entry.config.server_id || null;
    this.client = new SpeedtestClient(serverId);

    const intervalMinutes = Number(entry.config.interval_minutes) || 60;
    const intervalMs = intervalMinutes * 60_000;

    // Run initial test
    await this.runTest();

    // Set up recurring interval
    this.intervalTimer = setInterval(() => {
      if (this.stopping) return;
      this.runTest().catch(() => {});
    }, intervalMs);

    logger.info({ intervalMinutes }, 'Speedtest integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.client = null;
    this.entryId = null;
  }

  async handleCommand(_cmd: DeviceCommand): Promise<void> {
    // No commands supported for speedtest
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.client ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async runTest(): Promise<void> {
    if (!this.client || !this.entryId) return;

    const result = await this.client.runTest();
    if (result) {
      const now = Date.now();
      stateStore.update(mapSpeedtest(this.entryId, result, now));
      this.lastConnected = now;
      this.lastError = null;
      this.emitHealth('connected');
      logger.info(
        { down: result.downloadMbps.toFixed(1), up: result.uploadMbps.toFixed(1), ping: result.pingMs },
        'Speedtest completed',
      );
    } else {
      this.lastError = 'Speed test failed';
      this.emitHealth('error');
    }
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
