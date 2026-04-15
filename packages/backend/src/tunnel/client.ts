// ---------------------------------------------------------------------------
// Tunnel client — connects this home backend to the cloud proxy
// ---------------------------------------------------------------------------
//
// The cloud proxy (Railway) exposes a WebSocket endpoint at /tunnel.
// This client:
//  1. Opens an outbound WSS connection to the proxy
//  2. Authenticates with HMAC-SHA256 (homeId + timestamp + version)
//  3. Receives HTTP requests and injects them into the local Fastify server
//  4. Manages virtual WebSocket sessions for remote clients
//  5. Relays WebRTC signaling to the local go2rtc instance
//  6. Auto-reconnects with exponential backoff
//
// No inbound ports are opened on the home network.
// ---------------------------------------------------------------------------

import WebSocket from 'ws';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { TunnelMessage, TunnelUser, WsServerMessage, IntegrationId, IntegrationHealth } from '@ha/shared';
import { logger as rootLogger } from '../logger.js';
import { TUNNEL_INTERNAL_NONCE } from '../api/auth.js';
import { stateStore } from '../state/store.js';
import { eventBus } from '../state/event-bus.js';
import { registry } from '../integrations/registry.js';

const logger = rootLogger.child({ module: 'tunnel' });

const __dirname = dirname(fileURLToPath(import.meta.url));

// -- Constants ---------------------------------------------------------------

const INITIAL_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;
const AUTH_TIMEOUT_MS = 10_000;

// -- Virtual WS session (represents a remote client's real-time subscription) -

interface VirtualSession {
  sessionId: string;
  user: TunnelUser;
}

// -- Client class ------------------------------------------------------------

class TunnelClient {
  private ws: WebSocket | null = null;
  private authenticated = false;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private app: FastifyInstance | null = null;

  private proxyUrl = '';
  private tunnelSecret = '';
  private homeId = 'home-1';
  private version = 'unknown';

  /** Active virtual WS sessions keyed by sessionId */
  private sessions = new Map<string, VirtualSession>();

  /** Event bus listener cleanup */
  private eventBusCleanup: (() => void) | null = null;

  /**
   * Initialize and start the tunnel connection.
   * Call this after the Fastify server is listening.
   */
  async start(
    app: FastifyInstance,
    opts: { proxyUrl: string; tunnelSecret: string; homeId: string },
  ): Promise<void> {
    this.app = app;
    this.proxyUrl = opts.proxyUrl.replace(/\/$/, '');
    this.tunnelSecret = opts.tunnelSecret;
    this.homeId = opts.homeId;

    // Read app version for registration
    try {
      const versionPath = resolve(__dirname, '../../../frontend/src/lib/app-version.json');
      const raw = await readFile(versionPath, 'utf8');
      const v = JSON.parse(raw) as { major: number; minor: number; patch: number };
      this.version = `${v.major}.${v.minor}.${v.patch}`;
    } catch {
      // In Docker the frontend may not be adjacent — try the app root mount
      try {
        const appRoot = process.env.HA_APP_ROOT ?? '/opt/home-automation';
        const raw = await readFile(
          resolve(appRoot, 'packages/frontend/src/lib/app-version.json'),
          'utf8',
        );
        const v = JSON.parse(raw) as { major: number; minor: number; patch: number };
        this.version = `${v.major}.${v.minor}.${v.patch}`;
      } catch {
        logger.warn('Could not read app-version.json — using "unknown"');
      }
    }

    logger.info(
      { proxyUrl: this.proxyUrl, homeId: this.homeId, version: this.version },
      'Tunnel client starting',
    );

    this.connect();
  }

  stop(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.cleanupEventBus();
    if (this.ws) {
      this.ws.close(1000, 'shutdown');
      this.ws = null;
    }
    this.sessions.clear();
  }

  isConnected(): boolean {
    return this.authenticated && this.ws?.readyState === WebSocket.OPEN;
  }

  // -- Connection lifecycle ---------------------------------------------------

  private connect(): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;

    const wsScheme = this.proxyUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const host = this.proxyUrl.replace(/^https?:\/\//, '');
    const url = `${wsScheme}${host}/tunnel`;

    logger.info({ url }, 'Connecting to proxy tunnel');
    this.ws = new WebSocket(url);
    this.authenticated = false;

    const authTimeout = setTimeout(() => {
      if (!this.authenticated && this.ws) {
        logger.warn('Tunnel auth timeout — closing connection');
        this.ws.close(4000, 'auth timeout');
      }
    }, AUTH_TIMEOUT_MS);

    this.ws.on('open', () => {
      logger.info('Tunnel WebSocket connected — sending registration');
      this.sendRegistration();
    });

    this.ws.on('message', (data) => {
      let msg: TunnelMessage;
      try {
        msg = JSON.parse(String(data)) as TunnelMessage;
      } catch {
        return;
      }

      if (!this.authenticated) {
        if (msg.type === 'home_registered') {
          this.authenticated = true;
          this.retryCount = 0;
          clearTimeout(authTimeout);
          logger.info('Tunnel authenticated — relay active');
          this.setupEventBusForwarding();
        }
        return;
      }

      this.handleMessage(msg);
    });

    this.ws.on('close', (code, reason) => {
      clearTimeout(authTimeout);
      this.authenticated = false;
      this.ws = null;
      this.cleanupEventBus();
      this.sessions.clear();
      logger.info({ code, reason: String(reason) }, 'Tunnel disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      logger.error({ err: err.message }, 'Tunnel WebSocket error');
      // The 'close' event will fire next and handle reconnection
    });

    this.ws.on('ping', () => {
      // Respond to proxy pings (ws library auto-sends pong)
    });
  }

  private scheduleReconnect(): void {
    const delay = Math.min(INITIAL_RETRY_MS * 2 ** this.retryCount, MAX_RETRY_MS);
    this.retryCount++;
    logger.info({ delayMs: delay, attempt: this.retryCount }, 'Scheduling tunnel reconnect');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  // -- Registration -----------------------------------------------------------

  private sendRegistration(): void {
    const timestamp = Date.now();
    const hmac = createHmac('sha256', this.tunnelSecret)
      .update(`${this.homeId}:${timestamp}:${this.version}`)
      .digest('hex');

    this.send({
      type: 'home_register',
      homeId: this.homeId,
      timestamp,
      version: this.version,
      hmac,
    });
  }

  // -- Message dispatch -------------------------------------------------------

  private handleMessage(msg: TunnelMessage): void {
    switch (msg.type) {
      case 'http_request':
        void this.handleHttpRequest(msg);
        break;
      case 'ws_open':
        this.handleWsOpen(msg);
        break;
      case 'ws_message':
        this.handleWsMessage(msg);
        break;
      case 'ws_close':
        this.handleWsClose(msg);
        break;
      case 'rtc_signal':
        if (msg.direction === 'to_home') {
          void this.handleRtcSignal(msg);
        }
        break;
      case 'ping':
        this.send({ type: 'pong' });
        break;
      default:
        break;
    }
  }

  // -- HTTP request relay (proxy → Fastify inject) ----------------------------

  private async handleHttpRequest(
    msg: TunnelMessage & { type: 'http_request' },
  ): Promise<void> {
    if (!this.app) return;

    try {
      const headers: Record<string, string> = { ...msg.headers };
      const injectOpts: InjectOptions = {
        method: msg.method as InjectOptions['method'],
        url: msg.path,
        headers,
      };

      // Set the internal nonce so the auth middleware recognizes this as a
      // trusted tunnel-forwarded request (external callers can't know the nonce).
      headers['x-tunnel-internal'] = TUNNEL_INTERNAL_NONCE;

      if (msg.body) {
        injectOpts.payload = msg.body;
        // Ensure content-type is set for body requests
        if (!headers['content-type']) {
          headers['content-type'] = 'application/json';
        }
      }

      const response = await this.app.inject(injectOpts);

      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers)) {
        if (typeof value === 'string') {
          responseHeaders[key] = value;
        } else if (Array.isArray(value)) {
          responseHeaders[key] = value.join(', ');
        }
      }

      this.send({
        type: 'http_response',
        id: msg.id,
        status: response.statusCode,
        headers: responseHeaders,
        body: response.payload,
      });
    } catch (err) {
      logger.error({ err, path: msg.path }, 'Failed to inject tunnel HTTP request');
      this.send({
        type: 'http_response',
        id: msg.id,
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'internal tunnel error' }),
      });
    }
  }

  // -- Virtual WebSocket sessions ---------------------------------------------

  private handleWsOpen(msg: TunnelMessage & { type: 'ws_open' }): void {
    const { sessionId, user } = msg;

    if (this.sessions.has(sessionId)) {
      logger.warn({ sessionId }, 'Duplicate ws_open — ignoring');
      return;
    }

    const session: VirtualSession = { sessionId, user };
    this.sessions.set(sessionId, session);

    logger.info(
      { sessionId, user: user.display_name, role: user.role },
      'Remote WS session opened',
    );

    // Send the same snapshot a local WebSocket client would get
    const snapshot: WsServerMessage = {
      type: 'snapshot',
      devices: stateStore.getAll(),
      integrations: registry.getHealthAll(),
    };
    this.send({
      type: 'ws_message',
      sessionId,
      data: JSON.stringify(snapshot),
    });
  }

  private handleWsMessage(msg: TunnelMessage & { type: 'ws_message' }): void {
    const session = this.sessions.get(msg.sessionId);
    if (!session) return;

    // Currently the WS protocol is server-push only (no client→server messages used).
    // If future client messages are added, handle them here.
    logger.debug({ sessionId: msg.sessionId }, 'Received WS message from remote client (no-op)');
  }

  private handleWsClose(msg: TunnelMessage & { type: 'ws_close' }): void {
    const session = this.sessions.get(msg.sessionId);
    if (!session) return;

    this.sessions.delete(msg.sessionId);
    logger.info({ sessionId: msg.sessionId }, 'Remote WS session closed');
  }

  // -- Event bus → remote clients (broadcast device updates to virtual sessions) --

  private setupEventBusForwarding(): void {
    this.cleanupEventBus();

    const forward = (wsMsg: WsServerMessage) => {
      if (this.sessions.size === 0) return;
      const data = JSON.stringify(wsMsg);
      for (const [sessionId] of this.sessions) {
        this.send({ type: 'ws_message', sessionId, data });
      }
    };

    const onDeviceUpdated = ({ current }: { current: any }) => {
      forward({ type: 'device_updated', device: current });
    };

    const onDeviceRemoved = ({ deviceId }: { deviceId: string }) => {
      forward({ type: 'device_removed', deviceId });
    };

    const onIntegrationHealth = ({ id, health }: { id: IntegrationId; health: IntegrationHealth }) => {
      forward({ type: 'integration_health', id, health });
    };

    const onAutomationExecuted = (event: any) => {
      forward({ type: 'automation_executed', ...event });
    };

    const onSessionRefresh = ({ userId }: { userId: string }) => {
      forward({ type: 'session_refresh', userId });
    };

    eventBus.on('device_updated', onDeviceUpdated);
    eventBus.on('device_removed', onDeviceRemoved);
    eventBus.on('integration_health', onIntegrationHealth);
    eventBus.on('automation_executed', onAutomationExecuted);
    eventBus.on('session_refresh', onSessionRefresh);

    this.eventBusCleanup = () => {
      eventBus.off('device_updated', onDeviceUpdated);
      eventBus.off('device_removed', onDeviceRemoved);
      eventBus.off('integration_health', onIntegrationHealth);
      eventBus.off('automation_executed', onAutomationExecuted);
      eventBus.off('session_refresh', onSessionRefresh);
    };
  }

  private cleanupEventBus(): void {
    if (this.eventBusCleanup) {
      this.eventBusCleanup();
      this.eventBusCleanup = null;
    }
  }

  // -- WebRTC signaling relay -------------------------------------------------

  private async handleRtcSignal(
    msg: TunnelMessage & { type: 'rtc_signal' },
  ): Promise<void> {
    if (!this.app) return;

    const { sessionId, payload } = msg;

    if (payload.type === 'offer' && payload.src && payload.sdp) {
      // Forward the SDP offer to go2rtc via the existing backend route
      try {
        const response = await this.app.inject({
          method: 'POST',
          url: `/api/cameras/${encodeURIComponent(payload.src)}/webrtc`,
          headers: {
            'content-type': 'application/sdp',
            'x-tunnel-internal': TUNNEL_INTERNAL_NONCE,
            'x-tunnel-user': JSON.stringify({
              id: 'rtc-relay',
              email: 'system@tunnel',
              display_name: 'RTC Relay',
              role: 'admin',
            }),
          },
          payload: payload.sdp,
        });

        if (response.statusCode === 200) {
          this.send({
            type: 'rtc_signal',
            sessionId,
            direction: 'to_remote',
            payload: {
              type: 'answer',
              sdp: response.payload,
            },
          });
        } else {
          logger.warn(
            { status: response.statusCode, src: payload.src },
            'WebRTC signaling failed at go2rtc',
          );
        }
      } catch (err) {
        logger.error({ err, src: payload.src }, 'WebRTC signaling error');
      }
    }

    // ICE candidates are typically handled by the browser directly via STUN/TURN
    // after the SDP exchange — no additional relay needed here.
  }

  // -- Helpers ----------------------------------------------------------------

  private send(msg: TunnelMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch (err) {
      logger.error({ err }, 'Failed to send tunnel message');
      return false;
    }
  }
}

export const tunnelClient = new TunnelClient();
