// ---------------------------------------------------------------------------
// Wyze cloud integration: cameras, lights, plugs, sensors
// One account per instance (supportsMultipleEntries = false)
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { WyzeClient } from './wyze-client.js';
import { mapWyzeDevice } from './mapper.js';

const POLL_INTERVAL_MS = 30_000;

export class WyzeIntegration implements Integration {
  readonly id = 'wyze' as const;
  private client: WyzeClient | null = null;
  private entryId: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('wyze');
    if (entries.length === 0) return;

    const entry = entries[0]; // single account
    if (!entry.enabled || !entry.config.email || !entry.config.password || !entry.config.key_id || !entry.config.api_key) return;

    this.stopping = false;
    this.entryId = entry.id;
    this.emitHealth('connecting');

    this.client = new WyzeClient(
      entry.config.email as string,
      entry.config.password as string,
      entry.config.key_id as string,
      entry.config.api_key as string,
    );

    try {
      await this.client.login();
      await this.poll();
      this.lastConnected = Date.now();
      this.emitHealth('connected');
    } catch (err) {
      logger.error({ err }, 'Wyze: initial poll failed');
      this.lastError = String(err);
      this.emitHealth('error');
    }

    this.pollTimer = setInterval(() => {
      if (this.stopping) return;
      this.poll().catch((err) => {
        this.lastError = String(err);
      });
    }, POLL_INTERVAL_MS);

    logger.info('Wyze integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.client = null;
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (!this.client || !this.entryId) return;

    const parts = cmd.deviceId.split('.');
    // deviceId format: wyze.<entryId>.<type>.<mac>
    const mac = parts[3];
    if (!mac) return;

    try {
      if (cmd.type === 'light') {
        if (cmd.action === 'turn_on') {
          await this.client.runAction(mac, '', 'set_mesh_property', { P3: '1' });
        } else if (cmd.action === 'turn_off') {
          await this.client.runAction(mac, '', 'set_mesh_property', { P3: '0' });
        } else if (cmd.action === 'set_brightness' && 'brightness' in cmd) {
          await this.client.runAction(mac, '', 'set_mesh_property', {
            P3: '1',
            P1501: (cmd as { brightness: number }).brightness,
          });
        }
      } else if (cmd.type === 'switch') {
        if (cmd.action === 'turn_on') {
          await this.client.runAction(mac, '', 'set_property', { P3: '1' });
        } else if (cmd.action === 'turn_off') {
          await this.client.runAction(mac, '', 'set_property', { P3: '0' });
        }
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
        logger.warn('Wyze: 401 on command, re-authenticating');
        await this.client.login();
        // Retry once after re-auth
        await this.handleCommand(cmd);
        return;
      }
      throw err;
    }

    // Refresh state after command
    setTimeout(() => void this.poll().catch(() => {}), 3000);
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.client ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async poll(): Promise<void> {
    if (!this.client || !this.entryId) return;

    try {
      const devices = await this.client.getDeviceList();
      for (const raw of devices) {
        const state = mapWyzeDevice(this.entryId, raw);
        if (state) stateStore.update(state);
      }
      this.lastConnected = Date.now();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
        logger.warn('Wyze: 401 during poll, re-authenticating');
        await this.client.login();
        const devices = await this.client.getDeviceList();
        for (const raw of devices) {
          const state = mapWyzeDevice(this.entryId, raw);
          if (state) stateStore.update(state);
        }
        this.lastConnected = Date.now();
      } else {
        throw err;
      }
    }
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
