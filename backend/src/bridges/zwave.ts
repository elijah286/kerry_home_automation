import {
  ENTITY_DOMAINS,
  type EntityDomain,
  type EntityState,
} from '@home-automation/shared';
import WebSocket from 'ws';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { stateManager } from '../state/manager.js';
import { Bridge, type BridgeConfig } from './base.js';

function asDomain(d: string): EntityDomain {
  return (ENTITY_DOMAINS as readonly string[]).includes(d) ? (d as EntityDomain) : 'sensor';
}

const SCHEMA_VERSION = parseInt(process.env.ZWAVE_API_SCHEMA_VERSION ?? '33', 10);

export class ZWaveBridge extends Bridge {
  private ws: WebSocket | null = null;
  private messageId = 1;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1000;
  private readonly maxBackoffMs = 60_000;
  private intentionalClose = false;

  constructor(bridgeConfig: BridgeConfig) {
    super(bridgeConfig);
  }

  async connect(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    this.intentionalClose = false;
    await this.openSocket();
  }

  private async openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = config.zwave.url;
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.once('open', () => {
        this.connected = true;
        this.backoffMs = 1000;
        this.sendRaw({ messageId: this.nextId(), command: 'set_api_schema', schemaVersion: SCHEMA_VERSION });
        this.sendRaw({ messageId: this.nextId(), command: 'start_listening' });
        logger.info({ bridge: this.name, url }, 'Z-Wave WebSocket connected');
        resolve();
      });

      socket.on('message', (data, isBinary) => {
        const text = isBinary ? data.toString() : String(data);
        void this.onSocketMessage(text);
      });

      socket.once('error', (err) => {
        logger.error({ err, bridge: this.name }, 'Z-Wave WebSocket error');
        if (!this.connected) {
          reject(err);
        }
      });

      socket.on('close', () => {
        this.connected = false;
        logger.warn({ bridge: this.name }, 'Z-Wave WebSocket closed');
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket().catch((err) => {
        logger.error({ err, bridge: this.name }, 'Z-Wave reconnect failed');
        this.scheduleReconnect();
      });
    }, delay);
  }

  private nextId(): number {
    return this.messageId++;
  }

  private sendRaw(msg: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  private async onSocketMessage(text: string): Promise<void> {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = msg.type;
    if (type === 'event') {
      const ev = msg.event as Record<string, unknown> | undefined;
      if (!ev) {
        return;
      }
      const source = String(ev.source ?? '');
      const eventName = String(ev.event ?? '');
      if (source === 'node' && eventName === 'value updated') {
        const st = this.valueEventToState(ev);
        if (st) {
          await stateManager.applyState(st);
        }
      }
    }
  }

  private valueEventToState(ev: Record<string, unknown>): EntityState | null {
    const nodeId = typeof ev.nodeId === 'number' ? ev.nodeId : Number(ev.nodeId);
    if (!Number.isFinite(nodeId)) {
      return null;
    }
    const args = ev.args;
    const first =
      Array.isArray(args) && args.length > 0 && typeof args[0] === 'object' && args[0] !== null
        ? (args[0] as Record<string, unknown>)
        : null;
    if (!first) {
      return null;
    }
    const commandClass =
      typeof first.commandClass === 'number'
        ? first.commandClass
        : Number(first.commandClass ?? NaN);
    if (!Number.isFinite(commandClass)) {
      return null;
    }
    const endpoint = typeof first.endpoint === 'number' ? first.endpoint : Number(first.endpoint ?? 0);
    const property = String(first.property ?? 'value');
    const propertyKey =
      first.propertyKey !== undefined && first.propertyKey !== null ? String(first.propertyKey) : '';
    const value =
      first.value !== undefined
        ? first.value
        : first.newValue !== undefined
          ? first.newValue
          : first.state;
    const entity_id =
      propertyKey !== ''
        ? `zwave.${nodeId}.${commandClass}.${endpoint}.${property}.pk.${propertyKey}`
        : `zwave.${nodeId}.${commandClass}.${endpoint}.${property}`;
    const domain: EntityDomain =
      commandClass === 37 || commandClass === 38 ? asDomain('light') : asDomain('sensor');
    const t = Date.now();
    return {
      entity_id,
      domain,
      state: value === undefined || value === null ? 'unknown' : String(value),
      attributes: {
        nodeId,
        commandClass,
        endpoint,
        property,
        propertyKey: propertyKey || undefined,
        metadata: first,
      },
      last_changed: t,
      last_updated: t,
    };
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  async sendCommand(entityId: string, command: string, data?: Record<string, unknown>): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Z-Wave bridge not connected');
    }
    const parts = entityId.split('.');
    if (parts[0] !== 'zwave' || parts.length < 5) {
      throw new Error(`Invalid Z-Wave entity id: ${entityId}`);
    }
    const nodeId = Number(parts[1]);
    const commandClass = Number(parts[2]);
    const endpoint = Number(parts[3]);
    const tail = parts.slice(4);
    const pkAt = tail.indexOf('pk');
    let property: string;
    let propertyKey: string | undefined;
    if (pkAt >= 1 && tail[pkAt + 1] !== undefined) {
      property = tail.slice(0, pkAt).join('.') || 'targetValue';
      propertyKey = tail[pkAt + 1];
    } else {
      property = tail.join('.') || 'targetValue';
    }
    let value: unknown =
      data?.value !== undefined
        ? data.value
        : command === 'turn_on'
          ? true
          : command === 'turn_off'
            ? false
            : data?.brightness !== undefined
              ? data.brightness
              : undefined;
    if (value === undefined && data?.state !== undefined) {
      value = data.state;
    }
    if (value === undefined) {
      throw new Error('Z-Wave setValue requires value, brightness, or turn_on/turn_off');
    }
    const valueId: Record<string, unknown> = {
      commandClass,
      endpoint,
      property,
    };
    if (propertyKey !== undefined && propertyKey !== '') {
      valueId.propertyKey = propertyKey;
    }
    this.sendRaw({
      messageId: this.nextId(),
      command: 'node.set_value',
      args: [nodeId, valueId, value],
    });
  }
}
