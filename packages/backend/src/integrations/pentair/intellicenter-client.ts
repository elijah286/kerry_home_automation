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
import { logger } from '../../logger.js';

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

export class IntelliCenterClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (v: ICResponse) => void; reject: (e: Error) => void }>();
  private onNotification: ICMessageHandler = () => {};
  private _connected = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: IntelliCenterConfig) {}

  get connected(): boolean {
    return this._connected;
  }

  async connect(onNotification: ICMessageHandler): Promise<void> {
    this.onNotification = onNotification;
    const url = `ws://${this.config.host}:${this.config.port}`;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error(`Connection timeout to ${url}`));
      }, 15_000);

      ws.on('open', () => {
        clearTimeout(timeout);
        this._connected = true;
        logger.info({ host: this.config.host }, 'IntelliCenter connected');
        this.startPing();
        resolve();
      });

      ws.on('message', (data) => {
        this.resetHeartbeat();
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
        logger.error({ err, host: this.config.host }, 'IntelliCenter WS error');
      });

      ws.on('close', () => {
        this._connected = false;
        this.stopPing();
        for (const [, p] of this.pending) {
          p.reject(new Error('WebSocket closed'));
        }
        this.pending.clear();
      });
    });
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

  /** Get the list of bodies and circuits (system configuration) */
  async getSystemConfig(): Promise<ICResponse> {
    const req = this.makeRequest('GetQuery');
    req.queryName = 'GetConfiguration';
    req.arguments = [''];
    return this.send(req);
  }

  /** Get status of all bodies (pool, spa) */
  async getBodyStatus(): Promise<ICResponse> {
    const req = this.makeRequest('GetParamList');
    req.condition = 'OBJTYP = BODY';
    req.objectList = [{ objnam: 'ALL', keys: BODY_KEYS }];
    return this.send(req);
  }

  /** Get status of all circuits (lights, aux, features) */
  async getCircuitStatus(): Promise<ICResponse> {
    const req = this.makeRequest('GetParamList');
    req.condition = 'OBJTYP = CIRCUIT';
    req.objectList = [{ objnam: 'ALL', keys: CIRCUIT_KEYS }];
    return this.send(req);
  }

  /** Get status of all pumps */
  async getPumpStatus(): Promise<ICResponse> {
    const req = this.makeRequest('GetParamList');
    req.condition = 'OBJTYP = PUMP';
    req.objectList = [{ objnam: 'ALL', keys: PUMP_KEYS }];
    return this.send(req);
  }

  /** Get chemistry data */
  async getChemStatus(): Promise<ICResponse> {
    const req = this.makeRequest('GetParamList');
    req.condition = 'OBJTYP = CHEM';
    req.objectList = [{ objnam: 'ALL', keys: CHEM_KEYS }];
    return this.send(req);
  }

  // ---- Control commands -----------------------------------------------------

  /** Turn a circuit/body on or off */
  async setObjectStatus(objnam: string, on: boolean): Promise<void> {
    const req = this.makeRequest('SetParamList');
    req.objectList = [{ objnam, keys: [], params: { STATUS: on ? 'ON' : 'OFF' } }];
    await this.send(req);
  }

  /** Set temperature setpoint for a body */
  async setSetPoint(objnam: string, temp: number): Promise<void> {
    const req = this.makeRequest('SetParamList');
    req.objectList = [{ objnam, keys: [], params: { LOTMP: String(temp) } }];
    await this.send(req);
  }

  /** Set heat mode for a body */
  async setHeatMode(objnam: string, mode: string): Promise<void> {
    const req = this.makeRequest('SetParamList');
    req.objectList = [{ objnam, keys: [], params: { HTMODE: mode } }];
    await this.send(req);
  }

  /** Subscribe to property changes on a specific object */
  async subscribeToUpdates(objnam: string, keys: string[]): Promise<void> {
    const req = this.makeRequest('RequestParamList');
    req.objectList = [{ objnam, keys }];
    await this.send(req);
  }

  // ---- Connection management ------------------------------------------------

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const req = this.makeRequest('PingReq');
        this.ws.send(JSON.stringify(req));
      }
    }, 60_000);
    this.resetHeartbeat();
  }

  private resetHeartbeat(): void {
    if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);
    this.heartbeatTimeout = setTimeout(() => {
      logger.warn({ host: this.config.host }, 'IntelliCenter heartbeat timeout');
      this.ws?.terminate();
    }, 65_000);
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.heartbeatTimeout) { clearTimeout(this.heartbeatTimeout); this.heartbeatTimeout = null; }
  }

  disconnect(): void {
    this._connected = false;
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    for (const [, p] of this.pending) {
      p.reject(new Error('Disconnected'));
    }
    this.pending.clear();
  }
}
