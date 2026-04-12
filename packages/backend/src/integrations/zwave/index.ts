// ---------------------------------------------------------------------------
// Z-Wave integration: connects to Z-Wave JS UI via WebSocket
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { ZwaveJsClient, type ZwaveNode } from './zwavejs-client.js';
import { mapZwaveNode } from './mapper.js';

export class ZwaveIntegration implements Integration {
  readonly id = 'zwave' as const;
  private client: ZwaveJsClient | null = null;
  private entryId: string | null = null;
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('zwave');
    if (entries.length === 0) return;

    // Z-Wave supports a single network entry
    const entry = entries[0];
    if (!entry.enabled || !entry.config.ws_url) return;

    this.stopping = false;
    this.entryId = entry.id;
    this.emitHealth('connecting');

    const client = new ZwaveJsClient(entry.config.ws_url as string);
    this.client = client;

    try {
      await client.connect();
      this.lastConnected = Date.now();

      // Initial full state load
      const nodes = await client.getNodes();
      for (const node of nodes) {
        this.applyNode(node);
      }

      // Subscribe to live updates (pushed by Z-Wave JS UI)
      client.onNodeUpdate((node) => {
        if (this.stopping) return;
        this.applyNode(node);
      });

      this.emitHealth('connected');
      logger.info({ nodes: nodes.length }, 'Z-Wave integration started');
    } catch (err) {
      this.lastError = String(err);
      logger.error({ err }, 'Z-Wave: failed to start');
      this.emitHealth('error');
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    if (!this.client) throw new Error('Z-Wave: not connected');

    // Parse nodeId from device ID: zwave.<entryId>.node<nodeId>.<cc>_<property>
    const parts = cmd.deviceId.split('.');
    const nodeSegment = parts[2]; // "node5"
    const nodeId = parseInt(nodeSegment.replace('node', ''), 10);
    if (isNaN(nodeId)) throw new Error(`Z-Wave: invalid device ID: ${cmd.deviceId}`);

    switch (cmd.type) {
      case 'light': {
        if (cmd.action === 'set_brightness') {
          // CC 38 Multilevel Switch, 0–99 range
          const zwaveLevel = Math.round(((cmd.brightness ?? 100) / 100) * 99);
          await this.client.setValue(nodeId, 38, 'targetValue', zwaveLevel);
        } else if (cmd.action === 'turn_on') {
          await this.client.setValue(nodeId, 38, 'targetValue', 99);
        } else if (cmd.action === 'turn_off') {
          await this.client.setValue(nodeId, 38, 'targetValue', 0);
        }
        break;
      }
      case 'switch': {
        const on = cmd.action === 'turn_on';
        await this.client.setValue(nodeId, 37, 'targetValue', on);
        break;
      }
      case 'cover': {
        if (cmd.action === 'set_position') {
          // Covers: 0 = closed, 100 = open in our model; Z-Wave 99 = open, 0 = closed
          // Invert: our position maps directly (0→0, 100→99)
          const zwaveLevel = Math.round(((cmd.position ?? 0) / 100) * 99);
          await this.client.setValue(nodeId, 38, 'targetValue', zwaveLevel);
        } else if (cmd.action === 'open') {
          await this.client.setValue(nodeId, 38, 'targetValue', 99);
        } else if (cmd.action === 'close') {
          await this.client.setValue(nodeId, 38, 'targetValue', 0);
        }
        break;
      }
      default:
        logger.warn({ type: cmd.type }, 'Z-Wave: unsupported command type');
    }
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : (this.client ? 'error' : 'disconnected'),
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private applyNode(node: ZwaveNode): void {
    if (!this.entryId) return;
    const devices = mapZwaveNode(this.entryId, node);
    for (const device of devices) {
      stateStore.update(device);
    }
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
