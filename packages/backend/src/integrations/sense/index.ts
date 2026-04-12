// ---------------------------------------------------------------------------
// Sense energy monitor
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { senseAuthenticate, senseRealtimeSnapshot } from './sense-client.js';
import { mapSense } from './mapper.js';

const POLL_MS = 60_000;

export class SenseIntegration implements Integration {
  readonly id = 'sense' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;
  private entryId: string | null = null;
  private accessToken: string | null = null;
  private monitorId: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('sense');
    if (entries.length === 0) return;
    const entry = entries[0];
    if (!entry.enabled) return;

    this.stopping = false;
    this.entryId = entry.id;
    this.emitHealth('connecting');

    const email = entry.config.email;
    const password = entry.config.password;
    if (!email || !password) return;

    const tick = async () => {
      if (this.stopping || !this.entryId) return;
      try {
        if (!this.accessToken || !this.monitorId) {
          const auth = await senseAuthenticate(email, password);
          this.accessToken = auth.access_token;
          this.monitorId = auth.monitor_id;
        }
        const rt = await senseRealtimeSnapshot(this.accessToken!, this.monitorId!);
        const now = Date.now();
        stateStore.update(mapSense(this.entryId, rt, now));
        this.lastConnected = now;
        this.lastError = null;
        this.emitHealth('connected');
      } catch (err) {
        this.accessToken = null;
        this.monitorId = null;
        this.lastError = err instanceof Error ? err.message : String(err);
        this.emitHealth('error');
        logger.warn({ err: this.lastError }, 'Sense poll failed');
      }
    };

    await tick();
    this.timer = setInterval(() => {
      tick().catch(() => {});
    }, POLL_MS);
    logger.info('Sense integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.entryId = null;
    this.accessToken = null;
    this.monitorId = null;
  }

  async handleCommand(_cmd: DeviceCommand): Promise<void> {}

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.timer ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
