// ---------------------------------------------------------------------------
// WebSocket: push real-time state to frontend
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { WsServerMessage } from '@ha/shared';
import { stateStore } from '../state/store.js';
import { eventBus } from '../state/event-bus.js';
import { registry } from '../integrations/registry.js';
import { notificationBus } from '../notifications/bus.js';
import { notificationService } from '../notifications/service.js';
import { logger } from '../logger.js';

const clients = new Set<WebSocket>();

function broadcast(msg: WsServerMessage): void {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

export function registerWebSocket(app: FastifyInstance): void {
  // Push device updates to all clients
  eventBus.on('device_updated', ({ current }) => {
    broadcast({ type: 'device_updated', device: current });
  });

  eventBus.on('device_removed', ({ deviceId }) => {
    broadcast({ type: 'device_removed', deviceId });
  });

  eventBus.on('integration_health', ({ id, health }) => {
    broadcast({ type: 'integration_health', id, health });
  });

  eventBus.on('automation_executed', (event) => {
    broadcast({ type: 'automation_executed', ...event });
  });

  eventBus.on('session_refresh', ({ userId }) => {
    broadcast({ type: 'session_refresh', userId });
  });

  // Notifications: per-client audience filtering happens on the frontend — the
  // REST list endpoint enforces visibility, but the WS push goes to everyone
  // and the client drops rows that fail `isVisible`. This keeps the WS layer
  // stateless while still hiding sensitive notifications from non-admin users.
  notificationBus.on('created', (n) => {
    broadcast({ type: 'notification_created', notification: n });
  });
  notificationBus.on('updated', (n) => {
    broadcast({ type: 'notification_updated', notification: n });
  });
  notificationBus.on('removed', (id) => {
    broadcast({ type: 'notification_removed', id });
  });

  app.get('/ws', { websocket: true }, (socket) => {
    clients.add(socket);
    logger.info({ clients: clients.size }, 'WebSocket client connected');

    // Send full snapshot on connect
    const snapshot: WsServerMessage = {
      type: 'snapshot',
      devices: stateStore.getAll(),
      integrations: registry.getHealthAll(),
    };
    socket.send(JSON.stringify(snapshot));

    // And the current notification set; the client merges with device state.
    void notificationService.list().then((notifications) => {
      if (socket.readyState !== socket.OPEN) return;
      const msg: WsServerMessage = { type: 'notifications_snapshot', notifications };
      socket.send(JSON.stringify(msg));
    });

    socket.on('close', () => {
      clients.delete(socket);
      logger.info({ clients: clients.size }, 'WebSocket client disconnected');
    });

    socket.on('error', (err) => {
      logger.error({ err }, 'WebSocket client error');
      clients.delete(socket);
    });
  });
}
