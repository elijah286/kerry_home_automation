import { WebSocketServer, WebSocket } from 'ws';
import type {
  WSClientMessage,
  WSServerMessage,
  StateChangedEvent,
  ModeChangedEvent,
  PresenceChangedEvent,
  EntityDomain,
  EntityState,
} from '@home-automation/shared';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { eventBus } from '../state/event-bus.js';
import { stateManager } from '../state/manager.js';
import { query } from '../db/pool.js';
import { verifyTokenStandalone, type JwtPayload } from '../auth/jwt.js';

const AUTH_TIMEOUT_MS = 10_000;

type WsClientRecord = {
  ws: WebSocket;
  user: JwtPayload | null;
  authenticated: boolean;
  authTimer: ReturnType<typeof setTimeout> | null;
  explicitEntityIds: Set<string>;
  areaIds: Set<string>;
  areaEntityIds: Set<string>;
  effectiveIds: Set<string>;
  pongDeadline: ReturnType<typeof setTimeout> | null;
  heartbeat: ReturnType<typeof setInterval> | null;
};

const clients = new Set<WsClientRecord>();

let listenersBound = false;

function safeSend(ws: WebSocket, msg: WSServerMessage): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    ws.send(JSON.stringify(msg));
  } catch (err) {
    logger.error({ err }, 'WebSocket send failed');
  }
}

function recomputeEffective(c: WsClientRecord): void {
  c.effectiveIds = new Set([...c.explicitEntityIds, ...c.areaEntityIds]);
}

async function collectAreaEntityIds(areaIds: Iterable<string>): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const aid of areaIds) {
    const states = await stateManager.getStatesByArea(aid);
    for (const s of states) {
      ids.add(s.entity_id);
    }
  }
  return ids;
}

async function snapshotForEntityIds(entityIds: string[]): Promise<EntityState[]> {
  const states: EntityState[] = [];
  for (const id of entityIds) {
    const s = await stateManager.getEntityState(id);
    if (s) {
      states.push(s);
    }
  }
  return states;
}

function parseCommandTarget(msg: WSClientMessage): { entityId: string; command: string } | null {
  const t = msg.target?.entity_id;
  const entityId =
    typeof t === 'string' ? t : Array.isArray(t) && t.length > 0 ? t[0] : undefined;
  const command = msg.service;
  if (!entityId || !command) {
    return null;
  }
  return { entityId, command };
}

function canUserAccessArea(user: JwtPayload | null, areaId: string | undefined): boolean {
  if (!user || user.role === 'admin' || user.allowed_areas === null) return true;
  if (!areaId) return true;
  return user.allowed_areas.includes(areaId);
}

function bindBusListeners(): void {
  if (listenersBound) {
    return;
  }
  listenersBound = true;

  eventBus.on('state_changed', (ev: StateChangedEvent) => {
    const msg: WSServerMessage = { type: 'state_changed', payload: ev };
    const raw = JSON.stringify(msg);
    for (const c of clients) {
      if (
        c.authenticated &&
        c.effectiveIds.has(ev.entity_id) &&
        c.ws.readyState === WebSocket.OPEN
      ) {
        c.ws.send(raw);
      }
    }
  });

  eventBus.on('mode_changed', (ev: ModeChangedEvent) => {
    broadcastToAuthenticated({ type: 'mode_changed', payload: ev });
  });

  eventBus.on('presence_changed', (ev: PresenceChangedEvent) => {
    broadcastToAuthenticated({ type: 'presence_changed', payload: ev });
  });
}

function clearHeartbeat(c: WsClientRecord): void {
  if (c.pongDeadline) {
    clearTimeout(c.pongDeadline);
    c.pongDeadline = null;
  }
  if (c.heartbeat) {
    clearInterval(c.heartbeat);
    c.heartbeat = null;
  }
}

function scheduleHeartbeat(c: WsClientRecord): void {
  clearHeartbeat(c);
  c.heartbeat = setInterval(() => {
    if (c.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    c.ws.ping();
    if (c.pongDeadline) {
      clearTimeout(c.pongDeadline);
    }
    c.pongDeadline = setTimeout(() => {
      logger.warn('WebSocket client missed pong; terminating');
      c.ws.terminate();
    }, 10_000);
  }, 30_000);
}

function handleAuthMessage(c: WsClientRecord, token: string): void {
  const payload = verifyTokenStandalone(token);
  if (!payload) {
    safeSend(c.ws, { type: 'error', error: 'invalid token' });
    c.ws.close(4001, 'invalid token');
    return;
  }
  c.user = payload;
  c.authenticated = true;
  if (c.authTimer) {
    clearTimeout(c.authTimer);
    c.authTimer = null;
  }
  safeSend(c.ws, {
    type: 'auth_ok' as WSServerMessage['type'],
    payload: {
      id: payload.id,
      username: payload.username,
      display_name: payload.display_name,
      role: payload.role,
    },
  } as WSServerMessage);
}

async function handleClientMessage(
  c: WsClientRecord,
  raw: WSClientMessage,
): Promise<WSServerMessage | WSServerMessage[]> {
  const { id, type } = raw;

  switch (type) {
    case 'ping': {
      return { id, type: 'pong' };
    }
    case 'get_areas': {
      const { rows: floors } = await query('SELECT id, name, level FROM floors ORDER BY level NULLS LAST, name');
      const { rows: areas } = await query(
        `SELECT a.id, a.name, a.floor_id, a.icon FROM areas a
         LEFT JOIN floors f ON a.floor_id = f.id
         ORDER BY f.level NULLS LAST, a.name`,
      );
      return { id, type: 'areas', payload: { areas, floors } };
    }
    case 'get_states': {
      const states = raw.domain
        ? await stateManager.getStatesByDomain(raw.domain as EntityDomain)
        : await stateManager.getAllStates();
      return { id, type: 'state_snapshot', payload: { states } };
    }
    case 'subscribe_entities': {
      const ids = raw.entity_ids ?? [];
      for (const eid of ids) {
        c.explicitEntityIds.add(eid);
      }
      recomputeEffective(c);
      const states = await snapshotForEntityIds(ids);
      return { id, type: 'state_snapshot', payload: { states } };
    }
    case 'subscribe_areas': {
      const aids = raw.area_ids ?? [];
      const filteredAids = aids.filter((aid) => canUserAccessArea(c.user, aid));
      const snapshotIds = [...(await collectAreaEntityIds(filteredAids))];
      for (const aid of filteredAids) {
        c.areaIds.add(aid);
      }
      c.areaEntityIds = await collectAreaEntityIds(c.areaIds);
      recomputeEffective(c);
      const states = await snapshotForEntityIds(snapshotIds);
      return { id, type: 'state_snapshot', payload: { states } };
    }
    case 'command': {
      if (config.readOnly) {
        return { id, type: 'error', success: false, error: 'read-only mode: commands disabled' };
      }
      if (c.user && c.user.role === 'guest') {
        return { id, type: 'error', success: false, error: 'guests cannot send commands' };
      }
      const parsed = parseCommandTarget(raw);
      if (!parsed) {
        return {
          id,
          type: 'error',
          success: false,
          error: 'command requires target.entity_id and service',
        };
      }
      stateManager.handleCommand(parsed.entityId, parsed.command, raw.data);
      return { id, type: 'result', success: true, payload: { ok: true } };
    }
    default: {
      return { id, type: 'error', success: false, error: 'unknown message type' };
    }
  }
}

function broadcastToAuthenticated(msg: WSServerMessage): void {
  const raw = JSON.stringify(msg);
  for (const c of clients) {
    if (c.authenticated && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(raw);
    }
  }
}

export function broadcastToAll(msg: WSServerMessage): void {
  broadcastToAuthenticated(msg);
}

export function getConnectedClientCount(): number {
  return clients.size;
}

export function startWebSocketServer(): WebSocketServer {
  bindBusListeners();

  const wss = new WebSocketServer({
    host: config.ws.host,
    port: config.ws.port,
  });

  wss.on('connection', (ws) => {
    const rec: WsClientRecord = {
      ws,
      user: null,
      authenticated: false,
      authTimer: null,
      explicitEntityIds: new Set(),
      areaIds: new Set(),
      areaEntityIds: new Set(),
      effectiveIds: new Set(),
      pongDeadline: null,
      heartbeat: null,
    };
    clients.add(rec);

    rec.authTimer = setTimeout(() => {
      if (!rec.authenticated) {
        safeSend(ws, { type: 'error', error: 'auth timeout' });
        ws.close(4000, 'auth timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('pong', () => {
      if (rec.pongDeadline) {
        clearTimeout(rec.pongDeadline);
        rec.pongDeadline = null;
      }
    });

    scheduleHeartbeat(rec);

    ws.on('message', async (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        safeSend(ws, { type: 'error', error: 'invalid JSON' });
        return;
      }

      if (typeof parsed !== 'object' || parsed === null) {
        safeSend(ws, { type: 'error', error: 'invalid message shape' });
        return;
      }

      const obj = parsed as Record<string, unknown>;

      // Handle auth message (must be first message)
      if (obj.type === 'auth' && typeof obj.token === 'string') {
        handleAuthMessage(rec, obj.token);
        return;
      }

      // All other messages require authentication
      if (!rec.authenticated) {
        safeSend(ws, { type: 'error', error: 'not authenticated — send auth message first' });
        return;
      }

      if (
        typeof obj.id !== 'number' ||
        typeof obj.type !== 'string'
      ) {
        safeSend(ws, { type: 'error', error: 'invalid message shape' });
        return;
      }
      const msg = parsed as WSClientMessage;
      try {
        const out = await handleClientMessage(rec, msg);
        const batch = Array.isArray(out) ? out : [out];
        for (const m of batch) {
          safeSend(ws, m);
        }
      } catch (err) {
        logger.error({ err }, 'WebSocket handler error');
        safeSend(ws, {
          id: msg.id,
          type: 'error',
          success: false,
          error: err instanceof Error ? err.message : 'handler error',
        });
      }
    });

    ws.on('close', () => {
      if (rec.authTimer) {
        clearTimeout(rec.authTimer);
      }
      clearHeartbeat(rec);
      clients.delete(rec);
    });

    ws.on('error', (err) => {
      logger.error({ err }, 'WebSocket client error');
    });
  });

  wss.on('listening', () => {
    logger.info(
      { host: config.ws.host, port: config.ws.port },
      'WebSocket server listening',
    );
  });

  return wss;
}
