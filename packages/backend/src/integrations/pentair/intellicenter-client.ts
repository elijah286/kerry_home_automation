// ---------------------------------------------------------------------------
// Pentair IntelliCenter WebSocket client
//
// IntelliCenter exposes a WebSocket at ws://<host>:6680/
// Messages are JSON with:
//   { command: string, messageID: string, objectList?: [...], condition?: string }
// Responses echo the messageID. Notifications use command "NotifyList".
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { ConnectionManager } from '../../connection/manager.js';

export interface IntelliCenterConfig {
  host: string;
  port: number;
}

interface ICRequestObj {
  objnam: string;
  keys: string[];
  params?: Record<string, string>;
}

interface ICRequest {
  command: string;
  messageID: string;
  condition?: string;
  queryName?: string;
  arguments?: string[];
  objectList?: ICRequestObj[];
}

export type ICResponse = Record<string, unknown>;
export type ICMessageHandler = (msg: ICResponse) => void;

const BODY_KEYS = [
  'OBJTYP', 'SUBTYP', 'SNAME', 'STATUS', 'TEMP', 'LOTMP', 'HITMP',
  'LSTTMP', 'HTSRC', 'HTMODE', 'HEATER', 'HNAME',
];

const CIRCUIT_KEYS = [
  'OBJTYP', 'SUBTYP', 'SNAME', 'STATUS', 'BODY', 'FREEZE', 'FEATR',
  'USAGE', 'LIMIT', 'USE', 'LISTORD',
];

const PUMP_KEYS = [
  'OBJTYP', 'SUBTYP', 'SNAME', 'STATUS', 'SPEED', 'RPM', 'PWR',
  'GPM', 'LISTORD',
];

const CHEM_KEYS = [
  'OBJTYP', 'SUBTYP', 'SNAME', 'PHVAL', 'PHSET', 'ORPVAL', 'ORPSET',
  'SALT', 'ALK', 'CALC', 'CYACID', 'QUALTY', 'BODY',
];

const CONNECT_TIMEOUT_MS = 20_000;
const PING_INTERVAL_MS = 60_000;
const STALE_TIMEOUT_MS = 90_000;

export class IntelliCenterClient extends ConnectionManager {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (v: ICResponse) => void; reject: (e: Error) => void }>();
  private onNotification: ICMessageHandler = () => {};
  private onDisconnect: (() => void) | null = null;
  private onReconnect: (() => void) | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastDataTime = 0;

  constructor(private readonly config: IntelliCenterConfig) {
    super({ name: `pentair-${config.host}` });
  }

  get connected(): boolean {
    return this.state === 'connected';
  }

  /** Start connecting with notification + lifecycle callbacks */
  async start(
    onNotification: ICMessageHandler,
    onDisconnect?: () => void,
    onReconnect?: () => void,
  ): Promise<void> {
    this.onNotification = onNotification;
    this.onDisconnect = onDisconnect ?? null;
    this.onReconnect = onReconnect ?? null;
    await this.connect();
  }

  protected async doConnect(): Promise<void> {
    this.destroySocket();
    const url = `ws://${this.config.host}:${this.config.port}`;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error(`Connection timeout to ${url}`));
      }, CONNECT_TIMEOUT_MS);

      ws.on('open', () => {
        clearTimeout(timeout);
        this.lastDataTime = Date.now();
        this.log.info({ host: this.config.host }, 'IntelliCenter connected');
        this.startPing();
        // If this is a reconnect (retryCount > 0 means we had prior failures),
        // notify the integration layer so it can re-poll and update health
        if (this.retryCount > 0 && this.onReconnect) {
          this.onReconnect();
        }
        resolve();
      });

      ws.on('message', (data) => {
        this.lastDataTime = Date.now();
        try {
          const msg = JSON.parse(data.toString()) as ICResponse;
          const messageID = msg.messageID as string | undefined;
          const command = (msg.command as string)?.toLowerCase();

          if (command === 'notifylist') {
            this.onNotification(msg);
          } else if (messageID && this.pending.has(messageID)) {
            const p = this.pending.get(messageID)!;
            this.pending.delete(messageID);
            p.resolve(msg);
          } else {
            this.onNotification(msg);
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('error', (err) => {
        this.log.error({ err, host: this.config.host }, 'IntelliCenter WS error');
        if (this._state === 'connecting') reject(err);
      });

      ws.on('close', () => {
        this.stopPing();
        this.rejectAllPending();
        // Only auto-reconnect on unexpected close (same pattern as LeapClient)
        if (this._state === 'connected') {
          this.log.warn({ host: this.config.host }, 'IntelliCenter WS closed unexpectedly');
          this._state = 'disconnected';
          if (this.onDisconnect) this.onDisconnect();
          void this.connect();
        }
      });
    });
  }

  protected async doDisconnect(): Promise<void> {
    this.stopPing();
    this.destroySocket();
  }

  private destroySocket(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState !== WebSocket.CLOSED) {
        this.ws.terminate();
      }
      this.ws = null;
    }
    this.rejectAllPending();
  }

  private rejectAllPending(): void {
    for (const [, p] of this.pending) {
      p.reject(new Error('WebSocket closed'));
    }
    this.pending.clear();
  }

  private send(req: ICRequest): Promise<ICResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(req.messageID);
        reject(new Error(`Timeout waiting for response to ${req.command}`));
      }, 10_000);

      this.pending.set(req.messageID, {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });

      this.ws!.send(JSON.stringify(req));
    });
  }

  private makeRequest(command: string): ICRequest {
    return { command, messageID: randomUUID() };
  }

  // ---- Query commands -------------------------------------------------------

  async getSystemConfig(): Promise<ICResponse> {
    const req = this.makeRequest('GetQuery');
    req.queryName = 'GetConfiguration';
    req.arguments = [''];
    return this.send(req);
  }

  async getBodyStatus(): Promise<ICResponse> {
    const req = this.makeRequest('GetParamList');
    req.condition = 'OBJTYP = BODY';
    req.objectList = [{ objnam: 'ALL', keys: BODY_KEYS }];
    return this.send(req);
  }

  async getCircuitStatus(): Promise<ICResponse> {
    const req = this.makeRequest('GetParamList');
    req.condition = 'OBJTYP = CIRCUIT';
    req.objectList = [{ objnam: 'ALL', keys: CIRCUIT_KEYS }];
    return this.send(req);
  }

  async getPumpStatus(): Promise<ICResponse> {
    const req = this.makeRequest('GetParamList');
    req.condition = 'OBJTYP = PUMP';
    req.objectList = [{ objnam: 'ALL', keys: PUMP_KEYS }];
    return this.send(req);
  }

  async getChemStatus(): Promise<ICResponse> {
    const req = this.makeRequest('GetParamList');
    req.condition = 'OBJTYP = CHEM';
    req.objectList = [{ objnam: 'ALL', keys: CHEM_KEYS }];
    return this.send(req);
  }

  // ---- Control commands -----------------------------------------------------

  async setObjectStatus(objnam: string, on: boolean): Promise<void> {
    const req = this.makeRequest('SetParamList');
    req.objectList = [{ objnam, keys: [], params: { STATUS: on ? 'ON' : 'OFF' } }];
    await this.send(req);
  }

  async setSetPoint(objnam: string, temp: number): Promise<void> {
    const req = this.makeRequest('SetParamList');
    req.objectList = [{ objnam, keys: [], params: { LOTMP: String(temp) } }];
    await this.send(req);
  }

  async setHeatMode(objnam: string, mode: string): Promise<void> {
    const req = this.makeRequest('SetParamList');
    req.objectList = [{ objnam, keys: [], params: { HTMODE: mode } }];
    await this.send(req);
  }

  async subscribeToUpdates(objnam: string, keys: string[]): Promise<void> {
    const req = this.makeRequest('RequestParamList');
    req.objectList = [{ objnam, keys }];
    await this.send(req);
  }

  // ---- Connection health ----------------------------------------------------

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      // Stale connection detection
      if (this.lastDataTime > 0 && Date.now() - this.lastDataTime > STALE_TIMEOUT_MS) {
        this.log.warn({ host: this.config.host, staleSecs: Math.round((Date.now() - this.lastDataTime) / 1000) },
          'Connection stale — terminating socket');
        this.destroySocket();
        return;
      }

      const req = this.makeRequest('PingReq');
      try {
        this.ws.send(JSON.stringify(req));
      } catch {
        this.log.warn({ host: this.config.host }, 'Ping write failed — terminating socket');
        this.destroySocket();
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
