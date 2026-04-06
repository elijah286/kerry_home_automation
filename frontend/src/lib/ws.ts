import type {
  EntityState,
  ModeChangedPayload,
  PresenceChangedPayload,
  StateChangedPayload,
} from '@/types';
import { getStoredToken } from '@/providers/AuthProvider';

const DEFAULT_WS_URL = 'ws://localhost:3002';

export type WSClientOutgoingType =
  | 'subscribe_entities'
  | 'subscribe_areas'
  | 'command'
  | 'get_states'
  | 'get_areas'
  | 'ping';

export type WSClientMessage = {
  id: number;
  type: WSClientOutgoingType;
  entity_ids?: string[];
  area_ids?: string[];
  domain?: string;
  service?: string;
  target?: { entity_id?: string | string[]; device_id?: string | string[]; area_id?: string | string[] };
  data?: Record<string, unknown>;
};

export type WSServerMessage = {
  id?: number;
  type:
    | 'state_changed'
    | 'state_snapshot'
    | 'areas'
    | 'mode_changed'
    | 'presence_changed'
    | 'result'
    | 'pong'
    | 'auth_ok'
    | 'error';
  payload?: unknown;
  success?: boolean;
  error?: string;
};

type PendingEntry = {
  resolve: (msg: WSServerMessage) => void;
  reject: (err: Error) => void;
};

function getDefaultUrl(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  return DEFAULT_WS_URL;
}

export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingEntry>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1000;
  private intentionalClose = false;
  private connectAttempt = 0;
  private authenticated = false;
  private authResolve: (() => void) | null = null;
  private authReject: ((err: Error) => void) | null = null;

  onStateChanged: ((payload: StateChangedPayload) => void) | null = null;
  onModeChanged: ((payload: ModeChangedPayload) => void) | null = null;
  onPresenceChanged: ((payload: PresenceChangedPayload) => void) | null = null;
  onConnectionChange: ((connected: boolean) => void) | null = null;

  constructor(url = getDefaultUrl()) {
    this.url = url;
  }

  setUrl(url: string): void {
    this.url = url;
  }

  connect(): void {
    this.intentionalClose = false;
    this.clearReconnectTimer();
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }
    this.authenticated = false;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    const socket = this.ws;
    socket.onopen = () => {
      this.backoffMs = 1000;
      this.connectAttempt = 0;
      this.sendAuth();
    };
    socket.onmessage = (ev) => {
      this.handleMessage(String(ev.data));
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      this.authenticated = false;
      this.onConnectionChange?.(false);
      this.rejectAllPending(new Error('WebSocket closed'));
      if (this.authReject) {
        this.authReject(new Error('WebSocket closed during auth'));
        this.authResolve = null;
        this.authReject = null;
      }
      this.ws = null;
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.authenticated = false;
    this.rejectAllPending(new Error('WebSocket disconnected'));
  }

  subscribe(entityIds: string[]): Promise<EntityState[]> {
    return this.request({
      type: 'subscribe_entities',
      entity_ids: entityIds,
    }).then((msg) => this.statesFromSnapshot(msg));
  }

  subscribeAreas(areaIds: string[]): Promise<EntityState[]> {
    return this.request({
      type: 'subscribe_areas',
      area_ids: areaIds,
    }).then((msg) => this.statesFromSnapshot(msg));
  }

  sendCommand(
    entityId: string,
    command: string,
    data?: Record<string, unknown>,
  ): Promise<WSServerMessage> {
    return this.request({
      type: 'command',
      target: { entity_id: entityId },
      service: command,
      data,
    });
  }

  getStates(domain?: string): Promise<EntityState[]> {
    return this.request({
      type: 'get_states',
      ...(domain !== undefined ? { domain } : {}),
    }).then((msg) => this.statesFromSnapshot(msg));
  }

  getAreas(): Promise<{ areas: unknown; floors: unknown }> {
    return this.request({ type: 'get_areas' }).then((msg) => {
      const p = msg.payload as { areas?: unknown; floors?: unknown } | undefined;
      return {
        areas: p?.areas,
        floors: p?.floors,
      };
    });
  }

  private sendAuth(): void {
    const token = getStoredToken();
    if (!token || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onConnectionChange?.(false);
      return;
    }
    this.ws.send(JSON.stringify({ type: 'auth', token }));
  }

  private statesFromSnapshot(msg: WSServerMessage): EntityState[] {
    if (msg.type !== 'state_snapshot') {
      throw new Error(`expected state_snapshot, got ${msg.type}`);
    }
    const p = msg.payload as { states?: EntityState[] } | undefined;
    return p?.states ?? [];
  }

  private request(partial: Omit<WSClientMessage, 'id'>): Promise<WSServerMessage> {
    return new Promise((resolve, reject) => {
      const socket = this.ws;
      if (!socket || socket.readyState !== WebSocket.OPEN || !this.authenticated) {
        reject(new Error('WebSocket is not connected'));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const msg: WSClientMessage = { id, ...partial };
      try {
        socket.send(JSON.stringify(msg));
      } catch (e) {
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return;
    }
    const msg = parsed as WSServerMessage & Record<string, unknown>;

    if (typeof msg.type === 'string') {
      // Handle auth_ok — marks connection as fully ready
      if (msg.type === 'auth_ok') {
        this.authenticated = true;
        this.onConnectionChange?.(true);
        if (this.authResolve) {
          this.authResolve();
          this.authResolve = null;
          this.authReject = null;
        }
        return;
      }

      // Handle auth error
      if (msg.type === 'error' && !this.authenticated) {
        if (this.authReject) {
          this.authReject(new Error(msg.error ?? 'auth failed'));
          this.authResolve = null;
          this.authReject = null;
        }
        return;
      }

      switch (msg.type) {
        case 'state_changed': {
          this.onStateChanged?.(msg.payload as StateChangedPayload);
          return;
        }
        case 'mode_changed': {
          this.onModeChanged?.(msg.payload as ModeChangedPayload);
          return;
        }
        case 'presence_changed': {
          this.onPresenceChanged?.(msg.payload as PresenceChangedPayload);
          return;
        }
        default:
          break;
      }
    }

    const id = msg.id;
    if (typeof id === 'number' && this.pending.has(id)) {
      const entry = this.pending.get(id)!;
      this.pending.delete(id);
      if (msg.type === 'error') {
        entry.reject(new Error(typeof msg.error === 'string' ? msg.error : 'WebSocket error'));
        return;
      }
      entry.resolve(msg);
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, entry] of this.pending) {
      entry.reject(err);
    }
    this.pending.clear();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = Math.min(this.backoffMs, 30_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectAttempt += 1;
      this.connect();
      this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    }, delay);
  }
}

let singleton: WebSocketClient | null = null;

export function getWebSocketClient(url?: string): WebSocketClient {
  if (!singleton) {
    singleton = new WebSocketClient(url ?? getDefaultUrl());
  } else if (url) {
    singleton.setUrl(url);
  }
  return singleton;
}
