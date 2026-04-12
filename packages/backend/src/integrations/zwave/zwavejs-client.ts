// ---------------------------------------------------------------------------
// Z-Wave JS UI WebSocket client
// Connects to Z-Wave JS UI (formerly ZwaveJS2MQTT) via WebSocket
// ---------------------------------------------------------------------------

import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { logger } from '../../logger.js';

export interface ZwaveNodeValue {
  value: number | boolean | string | null;
  label: string;
  propertyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface ZwaveNode {
  nodeId: number;
  name: string;
  location: string;
  status: 'alive' | 'dead' | 'asleep' | 'unknown';
  deviceClass?: {
    generic?: { key: number; label: string };
    specific?: { key: number; label: string };
  };
  values: Record<string, ZwaveNodeValue>;
}

type NodeUpdateCallback = (node: ZwaveNode) => void;

interface ZwaveMessage {
  messageId: string;
  command?: string;
  args?: unknown[];
  success?: boolean;
  result?: unknown;
  event?: string;
  data?: unknown;
}

const RECONNECT_DELAY_MS = 5_000;

export class ZwaveJsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private updateCallbacks: NodeUpdateCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  constructor(private wsUrl: string) {}

  async connect(): Promise<void> {
    this.shouldReconnect = true;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      let resolved = false;

      ws.on('open', () => {
        logger.info({ url: this.wsUrl }, 'Z-Wave JS: WebSocket connected');
        this.ws = ws;
        resolved = true;
        resolve();
      });

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString()) as ZwaveMessage;
          this.handleMessage(msg);
        } catch (err) {
          logger.error({ err }, 'Z-Wave JS: failed to parse message');
        }
      });

      ws.on('error', (err) => {
        logger.error({ err }, 'Z-Wave JS: WebSocket error');
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      ws.on('close', () => {
        logger.warn('Z-Wave JS: WebSocket closed');
        this.ws = null;
        // Reject all pending requests
        for (const [, pending] of this.pending) {
          pending.reject(new Error('WebSocket closed'));
        }
        this.pending.clear();
        this.scheduleReconnect();
      });
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async getNodes(): Promise<ZwaveNode[]> {
    const result = await this.send('getNodes');
    return (result ?? []) as ZwaveNode[];
  }

  async setValue(
    nodeId: number,
    commandClass: number,
    property: string,
    value: unknown,
  ): Promise<void> {
    await this.send('writeValue', [{ nodeId, commandClass, property }, value]);
  }

  onNodeUpdate(callback: NodeUpdateCallback): void {
    this.updateCallbacks.push(callback);
  }

  private async send(command: string, args: unknown[] = []): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Z-Wave JS: WebSocket not connected');
    }

    const messageId = randomUUID();
    const msg: ZwaveMessage = { messageId, command, args };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(messageId);
        reject(new Error(`Z-Wave JS: command "${command}" timed out`));
      }, 10_000);

      this.pending.set(messageId, {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });

      this.ws!.send(JSON.stringify(msg));
    });
  }

  private handleMessage(msg: ZwaveMessage): void {
    // Response to a command
    if (msg.messageId && this.pending.has(msg.messageId)) {
      const pending = this.pending.get(msg.messageId)!;
      this.pending.delete(msg.messageId);
      if (msg.success) {
        pending.resolve(msg.result);
      } else {
        pending.reject(new Error(`Z-Wave JS command failed: ${JSON.stringify(msg.result)}`));
      }
      return;
    }

    // Pushed event (node update)
    if (msg.event === 'node value updated' && msg.data) {
      const data = msg.data as { node?: ZwaveNode };
      if (data.node) {
        for (const cb of this.updateCallbacks) {
          try {
            cb(data.node);
          } catch (err) {
            logger.error({ err }, 'Z-Wave JS: node update callback error');
          }
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        logger.info('Z-Wave JS: attempting reconnect');
        await this.doConnect();
        logger.info('Z-Wave JS: reconnected');
      } catch {
        logger.warn('Z-Wave JS: reconnect failed, will retry');
        this.scheduleReconnect();
      }
    }, RECONNECT_DELAY_MS);
  }
}
