import {
  ENTITY_DOMAINS,
  type EntityDomain,
  type EntityState,
} from '@home-automation/shared';
import { readFileSync } from 'node:fs';
import tls from 'node:tls';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { stateManager } from '../state/manager.js';
import { Bridge, type BridgeConfig } from './base.js';

function asDomain(d: string): EntityDomain {
  return (ENTITY_DOMAINS as readonly string[]).includes(d) ? (d as EntityDomain) : 'sensor';
}

const LUTRON_PORT = parseInt(process.env.LUTRON_TLS_PORT ?? '8081', 10);

function loadTlsOptional(path: string | undefined): string | Buffer | undefined {
  if (!path) {
    return undefined;
  }
  try {
    return readFileSync(path);
  } catch (err) {
    logger.warn({ err, path }, 'Lutron TLS file read failed');
    return undefined;
  }
}

export class LutronBridge extends Bridge {
  private sockets = new Map<number, tls.TLSSocket>();
  private reconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private intentionalClose = false;

  constructor(bridgeConfig: BridgeConfig) {
    super(bridgeConfig);
  }

  async connect(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    this.intentionalClose = false;
    const hosts = config.lutron.bridges;
    if (hosts.length === 0) {
      logger.warn({ bridge: this.name }, 'No Lutron bridge hosts configured');
      return;
    }
    for (let i = 0; i < hosts.length; i++) {
      void this.connectBridge(i, hosts[i]);
    }
  }

  private tlsOptions(host: string): tls.ConnectionOptions {
    const ca = loadTlsOptional(process.env.LUTRON_CA_PATH);
    const cert = loadTlsOptional(process.env.LUTRON_CERT_PATH);
    const key = loadTlsOptional(process.env.LUTRON_KEY_PATH);
    const rejectUnauthorized = process.env.LUTRON_TLS_INSECURE !== '1';
    return {
      host,
      port: LUTRON_PORT,
      ca,
      cert,
      key,
      rejectUnauthorized,
      servername: host,
    };
  }

  private connectBridge(bridgeIndex: number, host: string): void {
    const prev = this.sockets.get(bridgeIndex);
    if (prev && !prev.destroyed) {
      prev.destroy();
    }
    const opts = this.tlsOptions(host);
    const socket = tls.connect(opts, () => {
      this.updateConnected();
      logger.info({ bridge: this.name, host, bridgeIndex }, 'Lutron TLS connected');
    });
    this.sockets.set(bridgeIndex, socket);

    let acc = '';
    socket.on('data', (chunk: Buffer) => {
      acc += chunk.toString('utf8');
      const lines = acc.split(/\r?\n/);
      acc = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          this.handleLine(bridgeIndex, host, trimmed);
        }
      }
    });

    socket.on('error', (err) => {
      logger.error({ err, bridge: this.name, host, bridgeIndex }, 'Lutron socket error');
    });

    socket.on('close', () => {
      this.updateConnected();
      logger.warn({ bridge: this.name, host, bridgeIndex }, 'Lutron socket closed');
      if (!this.intentionalClose) {
        this.scheduleReconnect(bridgeIndex, host);
      }
    });
  }

  private scheduleReconnect(bridgeIndex: number, host: string): void {
    if (this.reconnectTimers.has(bridgeIndex)) {
      return;
    }
    const t = setTimeout(() => {
      this.reconnectTimers.delete(bridgeIndex);
      this.connectBridge(bridgeIndex, host);
    }, 5000);
    this.reconnectTimers.set(bridgeIndex, t);
  }

  private handleLine(bridgeIndex: number, host: string, line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    const header = msg.Header as Record<string, unknown> | undefined;
    const body = msg.Body as Record<string, unknown> | undefined;
    const url = header?.Url != null ? String(header.Url) : header?.URL != null ? String(header.URL) : '';
    const zoneMatch = /\/zone\/(\d+)/i.exec(url);
    if (zoneMatch && body) {
      const zoneId = zoneMatch[1];
      const level =
        readNested(body, ['ZoneStatus', 'Level']) ??
        readNested(body, ['Zone', 'Level']) ??
        body.Level ??
        body.level;
      const entity_id = `lutron.b${bridgeIndex}.zone.${zoneId}`;
      const domain = level !== undefined && level !== null ? asDomain('light') : asDomain('sensor');
      const t = Date.now();
      const state =
        level !== undefined && level !== null
          ? String(level)
          : JSON.stringify(body);
      void stateManager.applyState({
        entity_id,
        domain,
        state,
        attributes: {
          host,
          bridgeIndex,
          zoneId,
          url,
          body,
        },
        last_changed: t,
        last_updated: t,
      });
      return;
    }
    const btn = readNested(body ?? {}, ['ButtonStatus', 'ButtonEvent']);
    if (btn !== undefined || url.toLowerCase().includes('button')) {
      const entity_id = `lutron.b${bridgeIndex}.button.${hashId(url)}`;
      const t = Date.now();
      void stateManager.applyState({
        entity_id,
        domain: asDomain('event'),
        state: String(btn ?? 'press'),
        attributes: { host, bridgeIndex, url, body },
        last_changed: t,
        last_updated: t,
      });
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    for (const t of this.reconnectTimers.values()) {
      clearTimeout(t);
    }
    this.reconnectTimers.clear();
    for (const s of this.sockets.values()) {
      if (!s.destroyed) {
        s.destroy();
      }
    }
    this.sockets.clear();
    this.connected = false;
  }

  private updateConnected(): void {
    this.connected = [...this.sockets.values()].some((s) => !s.destroyed);
  }

  async sendCommand(entityId: string, command: string, data?: Record<string, unknown>): Promise<void> {
    const leap = data?.leap as Record<string, unknown> | undefined;
    if (leap) {
      const line = `${JSON.stringify(leap)}\r\n`;
      const idx = this.pickBridge(entityId, data);
      this.writeBridge(idx, line);
      return;
    }
    const parts = entityId.split('.');
    if (parts[0] !== 'lutron' || parts.length < 4) {
      throw new Error(`Invalid Lutron entity id: ${entityId}`);
    }
    const bridgeIndex = parseInt(parts[1].replace(/^b/, ''), 10);
    const kind = parts[2];
    const resourceId = parts[3];
    if (kind !== 'zone') {
      throw new Error('Lutron sendCommand supports zone entities or data.leap');
    }
    const zoneHref = data?.zoneHref != null ? String(data.zoneHref) : `/zone/${resourceId}/commandprocessor`;
    let level = 0;
    if (command === 'turn_on') {
      level = typeof data?.brightness_pct === 'number' ? data.brightness_pct : 100;
    } else if (command === 'turn_off') {
      level = 0;
    } else if (command === 'set_level' && typeof data?.brightness_pct === 'number') {
      level = data.brightness_pct;
    } else if (typeof data?.brightness_pct === 'number') {
      level = data.brightness_pct;
    }
    const comm = {
      CommuniqueType: 'CreateRequest',
      Header: {
        Url: zoneHref,
        ClientTag: `ha-${Date.now()}`,
      },
      Body: {
        Command: {
          CommandType: 'GoToDimmedLevel',
          DimmedLevelParameters: { Level: level },
        },
      },
    };
    const line = `${JSON.stringify(comm)}\r\n`;
    this.writeBridge(bridgeIndex, line);
  }

  private pickBridge(entityId: string, data?: Record<string, unknown>): number {
    if (typeof data?.bridgeIndex === 'number') {
      return data.bridgeIndex;
    }
    const m = /^lutron\.b(\d+)\./.exec(entityId);
    if (m) {
      return parseInt(m[1], 10);
    }
    return 0;
  }

  private writeBridge(bridgeIndex: number, line: string): void {
    const s = this.sockets.get(bridgeIndex);
    if (!s || s.destroyed) {
      throw new Error(`Lutron bridge socket ${bridgeIndex} not connected`);
    }
    s.write(line);
  }
}

function readNested(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur === null || typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return String(h);
}
