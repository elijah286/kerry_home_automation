import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { TunnelMessage } from '@home-automation/shared';
import { verifySupabaseToken } from '../auth/supabase.js';
import { mapToTunnelUser } from '../auth/user-mapping.js';
import { tunnelManager } from '../tunnel/manager.js';
import { logger } from '../logger.js';

const AUTH_TIMEOUT_MS = 10_000;

type ClientRecord = {
  ws: WebSocket;
  sessionId: string;
  authenticated: boolean;
};

const clients = new Map<string, ClientRecord>();

function extractTokenFromUrl(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}

export function setupClientWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const removeTunnelListener = tunnelManager.onMessage((msg: TunnelMessage) => {
    if (msg.type === 'ws_message') {
      const client = clients.get(msg.sessionId);
      if (client?.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg.data);
      }
      return;
    }

    if (msg.type === 'ws_close') {
      const client = clients.get(msg.sessionId);
      if (client) {
        client.ws.close(msg.code ?? 1000);
        clients.delete(msg.sessionId);
      }
      return;
    }
  });

  wss.on('close', () => {
    removeTunnelListener();
  });

  wss.on('connection', (ws, req) => {
    const sessionId = randomUUID();
    const rec: ClientRecord = { ws, sessionId, authenticated: false };
    clients.set(sessionId, rec);

    const tokenFromUrl = extractTokenFromUrl(req);

    const authTimeout = setTimeout(() => {
      if (!rec.authenticated) {
        ws.close(4000, 'auth timeout');
        clients.delete(sessionId);
      }
    }, AUTH_TIMEOUT_MS);

    async function authenticate(token: string): Promise<boolean> {
      const verified = await verifySupabaseToken(token);
      if (!verified) return false;
      const tunnelUser = await mapToTunnelUser(verified);
      if (!tunnelUser) return false;

      rec.authenticated = true;
      clearTimeout(authTimeout);

      if (!tunnelManager.isConnected()) {
        ws.send(JSON.stringify({ type: 'error', error: 'home instance not connected' }));
        ws.close(4002, 'home not connected');
        clients.delete(sessionId);
        return false;
      }

      tunnelManager.sendToTunnel({
        type: 'ws_open',
        sessionId,
        user: tunnelUser,
      });

      return true;
    }

    if (tokenFromUrl) {
      authenticate(tokenFromUrl).then((ok) => {
        if (!ok) {
          ws.close(4001, 'invalid token');
          clients.delete(sessionId);
        }
      }).catch(() => {
        ws.close(4001, 'auth error');
        clients.delete(sessionId);
      });
    }

    ws.on('message', async (data) => {
      const raw = String(data);

      if (!rec.authenticated) {
        try {
          const parsed = JSON.parse(raw) as { type?: string; token?: string };
          if (parsed.type === 'auth' && typeof parsed.token === 'string') {
            const ok = await authenticate(parsed.token);
            if (!ok) {
              ws.send(JSON.stringify({ type: 'error', error: 'invalid token' }));
              ws.close(4001, 'invalid token');
              clients.delete(sessionId);
            }
            return;
          }
        } catch { /* not a JSON auth message */ }

        ws.send(JSON.stringify({ type: 'error', error: 'not authenticated' }));
        return;
      }

      tunnelManager.sendToTunnel({
        type: 'ws_message',
        sessionId,
        data: raw,
      });
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (rec.authenticated) {
        tunnelManager.sendToTunnel({
          type: 'ws_close',
          sessionId,
        });
      }
      clients.delete(sessionId);
    });

    ws.on('error', (err) => {
      logger.error({ err, sessionId }, 'Remote client WS error');
    });
  });
}
