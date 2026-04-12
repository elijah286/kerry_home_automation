// ---------------------------------------------------------------------------
// UniFi Network integration: AP, switch, gateway, and client tracking
// Each entry = one UniFi controller instance
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { UnifiNetworkClient } from './unifi-client.js';
import { mapDevice, mapClient } from './mapper.js';

const POLL_INTERVAL_MS = 30_000;

interface ControllerCtx {
  entryId: string;
  label: string;
  client: UnifiNetworkClient;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class UnifiNetworkIntegration implements Integration {
  readonly id = 'unifi_network' as const;
  readonly supportsMultipleEntries = true;
  private controllers = new Map<string, ControllerCtx>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('unifi_network');
    if (entries.length === 0) return;

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled || !entry.config.host || !entry.config.username || !entry.config.password) continue;

      const client = new UnifiNetworkClient(
        entry.config.host,
        entry.config.username,
        entry.config.password,
        (entry.config.site as string) || 'default',
      );

      const ctx: ControllerCtx = {
        entryId: entry.id,
        label: entry.label || 'UniFi Network',
        client,
        pollTimer: null,
      };
      this.controllers.set(entry.id, ctx);

      try {
        await client.login();
        await this.poll(ctx);
        this.lastConnected = Date.now();
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'UniFi Network: initial connection failed');
        this.lastError = String(err);
      }

      ctx.pollTimer = setInterval(() => {
        if (this.stopping) return;
        this.poll(ctx).catch((err) => {
          this.lastError = String(err);
        });
      }, POLL_INTERVAL_MS);
    }

    if (this.controllers.size > 0 && this.lastConnected) {
      this.emitHealth('connected');
    }
    logger.info({ controllers: this.controllers.size }, 'UniFi Network integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.controllers.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    }
    this.controllers.clear();
  }

  async handleCommand(_cmd: DeviceCommand): Promise<void> {
    // Network devices don't support commands
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.controllers.size > 0 ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async poll(ctx: ControllerCtx): Promise<void> {
    try {
      const [devices, clients] = await Promise.all([
        ctx.client.getDevices(),
        ctx.client.getClients(),
      ]);

      for (const device of devices) {
        if (!device.mac) continue;
        stateStore.update(mapDevice(ctx.entryId, device));
      }
      for (const client of clients) {
        if (!client.mac) continue;
        stateStore.update(mapClient(ctx.entryId, client));
      }

      this.lastConnected = Date.now();
    } catch (err: any) {
      // Re-login on 401
      if (err?.status === 401) {
        logger.warn({ entryId: ctx.entryId }, 'UniFi Network: 401, re-authenticating');
        try {
          await ctx.client.login();
          // Retry poll after re-login
          const [devices, clients] = await Promise.all([
            ctx.client.getDevices(),
            ctx.client.getClients(),
          ]);
          for (const device of devices) {
            if (!device.mac) continue;
            stateStore.update(mapDevice(ctx.entryId, device));
          }
          for (const client of clients) {
            if (!client.mac) continue;
            stateStore.update(mapClient(ctx.entryId, client));
          }
          this.lastConnected = Date.now();
          return;
        } catch (reLoginErr) {
          logger.error({ err: reLoginErr, entryId: ctx.entryId }, 'UniFi Network: re-login failed');
          this.lastError = String(reLoginErr);
        }
      }
      throw err;
    }
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
