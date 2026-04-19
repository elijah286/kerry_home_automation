import { WebSocketServer, WebSocket } from 'ws';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { PassThrough, type Readable } from 'node:stream';
import type { TunnelMessage } from '@home-automation/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';

export type TunnelHttpResult =
  | {
      kind: 'buffered';
      status: number;
      headers: Record<string, string>;
      body?: string;
      bodyEncoding?: 'base64';
    }
  | {
      kind: 'streaming';
      status: number;
      headers: Record<string, string>;
      stream: Readable;
    };

type PendingBuffered = {
  kind: 'buffered';
  resolve: (result: TunnelHttpResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PendingStreaming = {
  kind: 'streaming';
  /** Has the caller already received the start frame (and the Readable)? */
  started: boolean;
  resolve: (result: TunnelHttpResult) => void;
  reject: (err: Error) => void;
  /** Time-to-first-byte timer — cleared when start frame arrives. */
  timer: ReturnType<typeof setTimeout>;
  /** PassThrough the proxy pipes to the client reply. Created on first chunk (or start). */
  stream: PassThrough | null;
};

type PendingRequest = PendingBuffered | PendingStreaming;

const REQUEST_TIMEOUT_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_DEADLINE_MS = 10_000;

class TunnelManager {
  private wss: WebSocketServer | null = null;
  private tunnel: WebSocket | null = null;
  private authenticated = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Last-known version reported by the home server during tunnel handshake.
   * Used by /api/system/app-version on the proxy so remote clients see the
   * HOME's version, never the proxy's Railway-deployed version.
   */
  private homeVersion: string | null = null;

  private wsMessageListeners = new Set<(msg: TunnelMessage) => void>();

  init(_server: HttpServer): void {
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on('connection', (ws) => {
      if (this.tunnel && this.tunnel.readyState === WebSocket.OPEN) {
        logger.warn('Rejecting second tunnel connection — already have one');
        ws.close(4001, 'tunnel already connected');
        return;
      }

      logger.info('Home tunnel WebSocket connected, awaiting registration');
      this.tunnel = ws;
      this.authenticated = false;

      const authTimeout = setTimeout(() => {
        if (!this.authenticated) {
          logger.warn('Tunnel auth timeout, closing');
          ws.close(4000, 'auth timeout');
        }
      }, 10_000);

      ws.on('message', (data) => {
        let msg: TunnelMessage;
        try {
          msg = JSON.parse(String(data)) as TunnelMessage;
        } catch {
          return;
        }

        if (!this.authenticated) {
          if (msg.type === 'home_register') {
            if (this.verifyRegistration(msg)) {
              this.authenticated = true;
              this.homeVersion = typeof msg.version === 'string' && msg.version.trim() ? msg.version.trim() : null;
              clearTimeout(authTimeout);
              this.sendToTunnel({ type: 'home_registered' });
              this.startHeartbeat(ws);
              logger.info({ homeId: msg.homeId, version: msg.version }, 'Home tunnel authenticated');
            } else {
              logger.warn('Tunnel registration HMAC verification failed');
              ws.close(4003, 'invalid credentials');
            }
          }
          return;
        }

        this.handleTunnelMessage(msg);
      });

      ws.on('close', () => {
        clearTimeout(authTimeout);
        this.stopHeartbeat();
        this.authenticated = false;
        this.homeVersion = null;
        if (this.tunnel === ws) {
          this.tunnel = null;
        }
        this.rejectAllPending(new Error('tunnel disconnected'));
        logger.info('Home tunnel disconnected');
      });

      ws.on('error', (err) => {
        logger.error({ err }, 'Tunnel WebSocket error');
      });

      ws.on('pong', () => {
        if (this.pongTimer) {
          clearTimeout(this.pongTimer);
          this.pongTimer = null;
        }
      });
    });
  }

  /** Handle an HTTP upgrade routed here by the central upgrade dispatcher. */
  handleUpgrade(request: import('node:http').IncomingMessage, socket: import('node:stream').Duplex, head: Buffer): void {
    this.wss!.handleUpgrade(request, socket, head, (ws) => {
      this.wss!.emit('connection', ws, request);
    });
  }

  isConnected(): boolean {
    return this.authenticated && this.tunnel?.readyState === WebSocket.OPEN;
  }

  /** Last-known version reported by the home server. Null if tunnel has never authenticated. */
  getHomeVersion(): string | null {
    return this.homeVersion;
  }

  sendToTunnel(msg: TunnelMessage): boolean {
    if (!this.tunnel || this.tunnel.readyState !== WebSocket.OPEN) return false;
    try {
      this.tunnel.send(JSON.stringify(msg));
      return true;
    } catch (err) {
      logger.error({ err }, 'Failed to send to tunnel');
      return false;
    }
  }

  /**
   * Send an HTTP request through the tunnel and wait for the first response
   * frame. For typical REST responses the home sends a single `http_response`
   * (buffered). For HLS/MJPEG the home sends `http_stream_start` + chunks +
   * `http_stream_end` — this method resolves on `http_stream_start` with a
   * Readable that the caller pipes to the client reply.
   */
  sendHttpRequest(
    id: string,
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<TunnelHttpResult> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error('tunnel not connected'));
        return;
      }

      const timer = setTimeout(() => {
        const p = this.pendingRequests.get(id);
        if (!p) return;
        this.pendingRequests.delete(id);
        // If a stream was created before TTFB expired we'd have cleared the timer
        // already — so reaching here always means nothing arrived from the home.
        reject(new Error('tunnel request timeout'));
      }, REQUEST_TIMEOUT_MS);

      // We don't know ahead of time whether the response will be buffered or
      // streamed — home decides based on route. Stash a dual-purpose pending
      // record and upgrade it in place when the first frame reveals the type.
      this.pendingRequests.set(id, {
        kind: 'buffered',
        resolve,
        reject,
        timer,
      });
      this.sendToTunnel({ type: 'http_request', id, method, path, headers, body });
    });
  }

  /** Called by the proxy route when the remote client disconnects mid-stream. */
  cancelStream(id: string): void {
    const p = this.pendingRequests.get(id);
    if (!p) return;
    if (p.kind === 'streaming' && p.stream && !p.stream.destroyed) {
      p.stream.destroy();
    }
    clearTimeout(p.timer);
    this.pendingRequests.delete(id);
    this.sendToTunnel({ type: 'http_stream_cancel', id });
  }

  /**
   * Register a listener for non-HTTP tunnel messages (ws_*, rtc_signal).
   */
  onMessage(listener: (msg: TunnelMessage) => void): () => void {
    this.wsMessageListeners.add(listener);
    return () => { this.wsMessageListeners.delete(listener); };
  }

  private handleTunnelMessage(msg: TunnelMessage): void {
    if (msg.type === 'http_response') {
      const pending = this.pendingRequests.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(msg.id);
      if (pending.kind !== 'buffered') {
        // Shouldn't happen — home decided late it's buffered. Resolve gracefully.
        if (pending.stream && !pending.stream.destroyed) pending.stream.destroy();
      }
      pending.resolve({
        kind: 'buffered',
        status: msg.status,
        headers: msg.headers,
        body: msg.body,
        bodyEncoding: msg.bodyEncoding,
      });
      return;
    }

    if (msg.type === 'http_stream_start') {
      const pending = this.pendingRequests.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      const stream = new PassThrough();
      // Upgrade the pending record in place to streaming mode. Reuse the
      // now-cleared timer handle — PendingStreaming's timer slot is never
      // rearmed (no TTFB timeout on chunks after start).
      const upgraded: PendingStreaming = {
        kind: 'streaming',
        started: true,
        resolve: pending.resolve,
        reject: pending.reject,
        timer: pending.timer,
        stream,
      };
      this.pendingRequests.set(msg.id, upgraded);
      upgraded.resolve({
        kind: 'streaming',
        status: msg.status,
        headers: msg.headers,
        stream,
      });
      return;
    }

    if (msg.type === 'http_stream_chunk') {
      const pending = this.pendingRequests.get(msg.id);
      if (!pending || pending.kind !== 'streaming' || !pending.stream) return;
      if (pending.stream.destroyed) return;
      try {
        const buf = Buffer.from(msg.data, 'base64');
        pending.stream.write(buf);
      } catch (err) {
        logger.error({ err, id: msg.id }, 'Failed to write streaming chunk');
      }
      return;
    }

    if (msg.type === 'http_stream_end') {
      const pending = this.pendingRequests.get(msg.id);
      if (!pending) return;
      this.pendingRequests.delete(msg.id);
      if (pending.kind === 'streaming' && pending.stream && !pending.stream.destroyed) {
        if (msg.error && msg.error !== 'cancelled') {
          pending.stream.destroy(new Error(msg.error));
        } else {
          pending.stream.end();
        }
      }
      return;
    }

    if (msg.type === 'pong') {
      return;
    }

    for (const listener of this.wsMessageListeners) {
      try {
        listener(msg);
      } catch (err) {
        logger.error({ err }, 'Tunnel message listener error');
      }
    }
  }

  private verifyRegistration(msg: TunnelMessage & { type: 'home_register' }): boolean {
    if (!config.tunnelSecret) return false;

    const maxAge = 60_000;
    if (Math.abs(Date.now() - msg.timestamp) > maxAge) {
      logger.warn('Tunnel registration timestamp too old/future');
      return false;
    }

    const expected = createHmac('sha256', config.tunnelSecret)
      .update(`${msg.homeId}:${msg.timestamp}:${msg.version}`)
      .digest('hex');

    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(msg.hmac));
    } catch {
      return false;
    }
  }

  private startHeartbeat(ws: WebSocket): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.ping();
      this.pongTimer = setTimeout(() => {
        logger.warn('Tunnel missed pong, terminating');
        ws.terminate();
      }, PONG_DEADLINE_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      if (pending.kind === 'streaming') {
        if (pending.started) {
          // Caller already has the stream — tear it down so the client sees EOF.
          if (pending.stream && !pending.stream.destroyed) pending.stream.destroy(err);
        } else {
          pending.reject(err);
        }
      } else {
        pending.reject(err);
      }
    }
    this.pendingRequests.clear();
  }
}

export const tunnelManager = new TunnelManager();
