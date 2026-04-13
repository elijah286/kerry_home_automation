// ---------------------------------------------------------------------------
// UniFi Network integration: AP, switch, gateway, and client tracking
// Each entry = one UniFi controller instance
// ---------------------------------------------------------------------------

import type {
  DeviceCommand,
  DeviceState,
  IntegrationHealth,
  ConnectionState,
  NetworkDeviceCommand,
  NetworkDeviceState,
} from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { UnifiNetworkClient, type UnifiClient, type UnifiDevice } from './unifi-client.js';
import { mapDevice, mapClient } from './mapper.js';
import { computeUnifiClientLinks } from './link-devices.js';

const POLL_INTERVAL_MS = 30_000;

interface ControllerCtx {
  entryId: string;
  label: string;
  client: UnifiNetworkClient;
  pollTimer: ReturnType<typeof setInterval> | null;
  badCredentials: boolean;
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

      const useUnifiOsProxy = entry.config.use_unifi_os_proxy !== 'false';

      const client = new UnifiNetworkClient(
        entry.config.host,
        entry.config.username,
        entry.config.password,
        (entry.config.site as string) || 'default',
        { useUnifiOsProxy },
      );

      const ctx: ControllerCtx = {
        entryId: entry.id,
        label: entry.label || 'UniFi Network',
        client,
        pollTimer: null,
        badCredentials: false,
      };
      this.controllers.set(entry.id, ctx);

      try {
        await client.login();
        await this.poll(ctx);
        this.lastConnected = Date.now();
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'UniFi Network: initial connection failed');
        this.lastError = String(err);
        if (this.isAuthError(err)) {
          ctx.badCredentials = true;
          logger.error({ entryId: entry.id }, 'UniFi Network: bad credentials — polling suspended until credentials are updated');
          this.emitHealth('error');
        }
      }

      ctx.pollTimer = setInterval(() => {
        if (this.stopping || ctx.badCredentials) return;
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

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (cmd.type !== 'network_device') return;
    const c = cmd as NetworkDeviceCommand;
    const dev = stateStore.get(c.deviceId);
    if (!dev || dev.type !== 'network_device' || dev.integration !== this.id) {
      throw new Error('Device not found or not a UniFi network entity');
    }
    if (dev.deviceType !== 'client') {
      throw new Error('Access control applies to client devices only (not APs/switches).');
    }

    const match = c.deviceId.match(/^unifi_network\.(.+)\.client\.([a-f0-9]{12})$/i);
    if (!match) {
      throw new Error('Invalid UniFi client device id');
    }
    const entryId = match[1];
    const macHex = match[2];
    const ctx = this.controllers.get(entryId);
    if (!ctx || ctx.badCredentials) {
      throw new Error('This UniFi instance is not connected');
    }

    const macColon = macHex
      .toLowerCase()
      .match(/.{2}/g)!
      .join(':');
    const block = c.action === 'block_network_access';

    await ctx.client.setClientBlocked(macColon, block);
    await this.poll(ctx);
  }

  getHealth(): IntegrationHealth {
    const anyBadCredentials = [...this.controllers.values()].some((c) => c.badCredentials);
    return {
      state: anyBadCredentials ? 'error' : this.lastConnected ? 'connected' : this.controllers.size > 0 ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: anyBadCredentials ? 'Bad credentials — update username/password to resume polling' : this.lastError,
      failureCount: 0,
    };
  }

  private upsertPollResults(ctx: ControllerCtx, devices: UnifiDevice[], clients: UnifiClient[]): void {
    const infraStates: NetworkDeviceState[] = [];
    for (const device of devices) {
      if (!device.mac) continue;
      infraStates.push(mapDevice(ctx.entryId, device));
    }
    const clientStates: NetworkDeviceState[] = [];
    for (const client of clients) {
      if (!client.mac) continue;
      clientStates.push(mapClient(ctx.entryId, client));
    }
    const entryPrefix = `unifi_network.${ctx.entryId}.`;
    const merged: DeviceState[] = [
      ...stateStore.getAll().filter((d) => !d.id.startsWith(entryPrefix)),
      ...infraStates,
      ...clientStates,
    ];
    const linkMap = computeUnifiClientLinks(ctx.entryId, merged);

    for (const s of infraStates) {
      stateStore.update(s);
    }
    for (const s of clientStates) {
      const links = linkMap.get(s.id);
      const next: NetworkDeviceState = {
        ...s,
        linkedDeviceIds: links && links.length > 0 ? links : undefined,
      };
      stateStore.update(next);
    }
  }

  private async poll(ctx: ControllerCtx): Promise<void> {
    try {
      const [devices, clients] = await Promise.all([
        ctx.client.getDevices(),
        ctx.client.getClients(),
      ]);

      this.upsertPollResults(ctx, devices, clients);

      this.lastConnected = Date.now();

      const site = ctx.client.getSiteKey();
      logger.info(
        { entryId: ctx.entryId, site, devices: devices.length, clients: clients.length },
        'UniFi Network: polled controller',
      );
      if (devices.length === 0 && clients.length === 0) {
        logger.warn(
          { entryId: ctx.entryId, site },
          'UniFi Network: API returned no devices or clients — confirm Site matches your UniFi site name (UniFi OS: Settings → System → Site, or the site list in the old UI). Wrong site names return HTTP 200 with empty lists.',
        );
      }
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
          this.upsertPollResults(ctx, devices, clients);
          this.lastConnected = Date.now();
          logger.info(
            { entryId: ctx.entryId, site: ctx.client.getSiteKey(), devices: devices.length, clients: clients.length },
            'UniFi Network: polled controller (after re-auth)',
          );
          return;
        } catch (reLoginErr) {
          logger.error({ err: reLoginErr, entryId: ctx.entryId }, 'UniFi Network: re-login failed');
          this.lastError = String(reLoginErr);
          if (this.isAuthError(reLoginErr)) {
            ctx.badCredentials = true;
            logger.error({ entryId: ctx.entryId }, 'UniFi Network: bad credentials — polling suspended until credentials are updated');
            this.emitHealth('error');
          }
        }
      }
      throw err;
    }
  }

  private isAuthError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as any;
    if (e.status === 401 || e.status === 403) return true;
    if (typeof e.message === 'string' && /login failed|401|403|unauthorized/i.test(e.message)) return true;
    return false;
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
