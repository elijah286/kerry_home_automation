// ---------------------------------------------------------------------------
// Ring integration: cloud polling for doorbells and cameras
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { RingClient } from './ring-client.js';
import { mapDoorbell, mapCamera } from './mapper.js';

const POLL_INTERVAL_MS = 30_000;

interface RingCtx {
  entryId: string;
  label: string;
  client: RingClient;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class RingIntegration implements Integration {
  readonly id = 'ring' as const;
  readonly supportsMultipleEntries = false;

  private ctx: RingCtx | null = null;
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('ring');
    if (entries.length === 0) return;

    const entry = entries[0];
    if (!entry.enabled || !entry.config.refresh_token) return;

    this.stopping = false;
    this.emitHealth('connecting');

    const client = new RingClient(entry.config.refresh_token as string);
    this.ctx = {
      entryId: entry.id,
      label: entry.label || 'Ring',
      client,
      pollTimer: null,
    };

    try {
      await client.refreshAuth();
      await this.poll();
      this.lastConnected = Date.now();
      this.emitHealth('connected');
    } catch (err) {
      logger.error({ err }, 'Ring: initial poll failed');
      this.lastError = String(err);
      this.emitHealth('error');
    }

    this.ctx.pollTimer = setInterval(() => {
      if (this.stopping) return;
      this.poll().catch((err) => {
        this.lastError = String(err);
      });
    }, POLL_INTERVAL_MS);

    logger.info('Ring integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.ctx?.pollTimer) clearInterval(this.ctx.pollTimer);
    this.ctx = null;
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'doorbell') return;
    if (!this.ctx) throw new Error('Ring: not started');

    if (cmd.action === 'snapshot') {
      const deviceId = this.extractDeviceId(cmd.deviceId);
      const snapshot = await this.ctx.client.getSnapshot(deviceId);
      if (!snapshot) throw new Error('Ring: snapshot unavailable');
      // Snapshot data could be emitted via event bus or stored; for now log success
      logger.info({ deviceId, size: snapshot.length }, 'Ring: snapshot captured');
    }
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.ctx ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async poll(): Promise<void> {
    if (!this.ctx) return;
    const { client, entryId } = this.ctx;

    try {
      const devices = await client.getDevices();

      // Doorbells
      for (const doorbot of devices.doorbots) {
        let events: Awaited<ReturnType<RingClient['getHistory']>> = [];
        try {
          events = await client.getHistory(doorbot.id, 10);
        } catch {
          // history may fail independently
        }
        stateStore.update(mapDoorbell(entryId, doorbot, events));
      }

      // Stickup cameras
      for (const cam of devices.stickup_cams) {
        stateStore.update(mapCamera(entryId, cam));
      }

      this.lastConnected = Date.now();
    } catch (err) {
      // Re-auth on 401
      if (client.isAuthError(err)) {
        logger.warn('Ring: got 401, re-authenticating');
        try {
          await client.refreshAuth();
          return void (await this.poll());
        } catch (authErr) {
          this.lastError = String(authErr);
          throw authErr;
        }
      }
      this.lastError = String(err);
      throw err;
    }
  }

  private extractDeviceId(fullId: string): number {
    // ring.<entryId>.doorbell.<deviceId> or ring.<entryId>.camera.<deviceId>
    const parts = fullId.split('.');
    return parseInt(parts[3], 10);
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
