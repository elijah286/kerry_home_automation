// ---------------------------------------------------------------------------
// ESPHome integration: SSE-based real-time state via web_server v2
// Each entry = one ESPHome device
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { EsphomeClient } from './esphome-client.js';
import { mapEspStates } from './mapper.js';

interface DeviceCtx {
  entryId: string;
  label: string;
  client: EsphomeClient;
}

export class EsphomeIntegration implements Integration {
  readonly id = 'esphome' as const;
  private devices = new Map<string, DeviceCtx>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('esphome');
    if (entries.length === 0) return;

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled || !entry.config.host) continue;
      const client = new EsphomeClient(
        entry.config.host,
        entry.config.password as string | undefined,
        entry.config.port ? parseInt(entry.config.port, 10) : 80,
      );
      const ctx: DeviceCtx = {
        entryId: entry.id,
        label: entry.label || 'ESPHome Device',
        client,
      };
      this.devices.set(entry.id, ctx);

      // Start SSE stream — updates arrive in real time, no polling needed
      client.startStreaming((states, deviceInfo) => {
        const name = ctx.label !== 'ESPHome Device' ? ctx.label : deviceInfo.title || 'ESPHome Device';
        const mapped = mapEspStates(ctx.entryId, name, states, true);
        for (const device of mapped) {
          stateStore.update(device);
        }
        this.lastConnected = Date.now();
        if (!this.stopping) this.emitHealth('connected');
      });
    }

    logger.info({ devices: this.devices.size }, 'ESPHome integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.devices.values()) {
      ctx.client.disconnect();
    }
    this.devices.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    const parts = cmd.deviceId.split('.');
    const entryId = parts[1];
    const entitySlug = parts[3];
    const ctx = this.devices.get(entryId);
    if (!ctx) throw new Error('ESPHome device not found');

    switch (cmd.type) {
      case 'light': {
        if (cmd.action === 'set_brightness' && cmd.brightness != null) {
          const brightness255 = Math.round((cmd.brightness / 100) * 255);
          await ctx.client.setLightBrightness(entitySlug, brightness255);
        } else {
          await ctx.client.postCommand('light', entitySlug, cmd.action);
        }
        break;
      }
      case 'switch':
        await ctx.client.postCommand('switch', entitySlug, cmd.action);
        break;
      case 'fan':
        await ctx.client.postCommand('fan', entitySlug, cmd.action);
        break;
      case 'cover': {
        const action = cmd.action === 'set_position' ? 'set' : cmd.action;
        const body = cmd.action === 'set_position' && cmd.position != null
          ? { position: cmd.position / 100 }
          : undefined;
        await ctx.client.postCommand('cover', entitySlug, action, body);
        break;
      }
      default:
        throw new Error(`ESPHome: unsupported command type ${cmd.type}`);
    }
  }

  getHealth(): IntegrationHealth {
    if (this.devices.size === 0) {
      return { state: 'disconnected', lastConnected: null, lastError: null, failureCount: 0 };
    }
    const anyConnected = [...this.devices.values()].some((ctx) => ctx.client.isConnected());
    return {
      state: anyConnected ? 'connected' : this.lastConnected ? 'reconnecting' : 'error',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
