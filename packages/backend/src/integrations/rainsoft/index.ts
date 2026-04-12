// ---------------------------------------------------------------------------
// RainSoft Remind water softener (cloud API)
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { discoverDeviceId, fetchRainsoftSnapshot } from './rainsoft-client.js';
import { mapRainsoft } from './mapper.js';

const POLL_MS = 5 * 60_000;

export class RainsoftIntegration implements Integration {
  readonly id = 'rainsoft' as const;
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('rainsoft');
    this.stopping = false;

    for (const entry of entries) {
      if (!entry.enabled) continue;
      const email = entry.config.email;
      const password = entry.config.password;
      if (!email || !password) continue;

      let deviceId = entry.config.device_id?.trim() || '';
      if (!deviceId) {
        deviceId = (await discoverDeviceId(email, password)) ?? '';
        if (!deviceId) {
          logger.warn({ entryId: entry.id }, 'RainSoft: could not discover device id');
          continue;
        }
      }

      const run = async () => {
        if (this.stopping) return;
        try {
          const snap = await fetchRainsoftSnapshot(email, password, deviceId);
          if (!snap) {
            this.lastError = 'RainSoft status unavailable';
            this.emitHealth('error');
            return;
          }
          const now = Date.now();
          stateStore.update(mapRainsoft(entry.id, snap, now));
          this.lastConnected = now;
          this.lastError = null;
          this.emitHealth('connected');
        } catch (err) {
          this.lastError = err instanceof Error ? err.message : String(err);
          this.emitHealth('error');
          logger.warn({ err: this.lastError, entryId: entry.id }, 'RainSoft poll failed');
        }
      };

      await run();
      const t = setInterval(() => {
        run().catch(() => {});
      }, POLL_MS);
      this.timers.set(entry.id, t);
    }

    logger.info({ instances: this.timers.size }, 'RainSoft integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }

  async handleCommand(_cmd: DeviceCommand): Promise<void> {}

  getHealth(): IntegrationHealth {
    return {
      state: this.timers.size > 0 ? (this.lastError ? 'error' : 'connected') : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
