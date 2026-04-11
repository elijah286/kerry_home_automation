// ---------------------------------------------------------------------------
// LEAP TLS client: manages a single connection to a Lutron Caseta bridge
// ---------------------------------------------------------------------------

import tls from 'node:tls';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConnectionManager } from '../../connection/manager.js';
import { appConfig } from '../../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CERTS_DIR = resolve(__dirname, '../../../certs');

export interface LeapMessage {
  CommuniqueType: string;
  Header: Record<string, unknown>;
  Body?: Record<string, unknown>;
}

export type LeapMessageHandler = (msg: LeapMessage) => void;

export class LeapClient extends ConnectionManager {
  private socket: tls.TLSSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastDataTime = 0;
  private buffer = '';

  constructor(
    private readonly host: string,
    private readonly bridgeIndex: number,
    private readonly onMessage: LeapMessageHandler,
    private readonly onConnected: () => void,
    private readonly port?: number,
  ) {
    super({ name: `lutron-bridge-${bridgeIndex}` });
  }

  protected async doConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Clean up any existing socket
      this.destroySocket();

      const opts = this.buildTlsOptions();
      const socket = tls.connect(opts, () => {
        socket.setKeepAlive(true, 30_000);
        this.lastDataTime = Date.now();
        this.log.info({ host: this.host }, 'TLS connected');
        this.startPing();
        this.onConnected();
        resolve();
      });

      this.socket = socket;
      this.buffer = '';

      socket.on('data', (chunk: Buffer) => {
        this.lastDataTime = Date.now();
        this.buffer += chunk.toString('utf8');
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed) as LeapMessage;
            this.onMessage(msg);
          } catch {
            this.log.warn({ line: trimmed.substring(0, 100) }, 'Failed to parse LEAP message');
          }
        }
      });

      socket.on('error', (err) => {
        this.log.error({ err, host: this.host }, 'Socket error');
        if (this._state === 'connecting') reject(err);
      });

      socket.on('close', () => {
        this.stopPing();
        // Only reconnect if we were previously connected (unexpected close).
        // If we're in 'connecting' or 'reconnecting', the base class handles retry.
        if (this._state === 'connected') {
          this.log.warn({ host: this.host }, 'Socket closed unexpectedly');
          this._state = 'disconnected';
          void this.connect();
        }
      });
    });
  }

  protected async doDisconnect(): Promise<void> {
    this.stopPing();
    this.destroySocket();
  }

  write(msg: LeapMessage): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error(`LEAP client ${this.bridgeIndex} not connected`);
    }
    this.socket.write(JSON.stringify(msg) + '\r\n');
  }

  private destroySocket(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      if (!this.socket.destroyed) this.socket.destroy();
      this.socket = null;
    }
    this.buffer = '';
  }

  private startPing(): void {
    this.stopPing();
    const PING_MS = 60_000;
    const STALE_MS = 90_000;

    this.pingTimer = setInterval(() => {
      if (!this.socket || this.socket.destroyed) return;

      // Stale connection detection
      if (this.lastDataTime > 0 && Date.now() - this.lastDataTime > STALE_MS) {
        this.log.warn({ host: this.host, staleSecs: Math.round((Date.now() - this.lastDataTime) / 1000) },
          'Connection stale — destroying socket');
        this.destroySocket();
        return;
      }

      try {
        this.write({
          CommuniqueType: 'ReadRequest',
          Header: { Url: '/server/1/status/ping', ClientTag: `ping-${Date.now()}` },
        });
      } catch {
        this.log.warn({ host: this.host }, 'Ping write failed — destroying socket');
        this.destroySocket();
      }
    }, PING_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private buildTlsOptions(): tls.ConnectionOptions {
    const caPath = resolve(CERTS_DIR, `lutron_caseta-${this.host}-ca.pem`);
    const certPath = resolve(CERTS_DIR, `lutron_caseta-${this.host}-cert.pem`);
    const keyPath = resolve(CERTS_DIR, `lutron_caseta-${this.host}-key.pem`);

    const ca = existsSync(caPath) ? readFileSync(caPath) : undefined;
    const cert = existsSync(certPath) ? readFileSync(certPath) : undefined;
    const key = existsSync(keyPath) ? readFileSync(keyPath) : undefined;

    if (!cert || !key) {
      this.log.warn({ host: this.host }, 'No client certificates found — connection will likely be rejected');
    }

    return {
      host: this.host,
      port: this.port ?? appConfig.lutron.defaultPort,
      ca,
      cert,
      key,
      // Caseta bridges use self-signed certs; mutual TLS (client cert) provides security
      rejectUnauthorized: false,
    };
  }
}
