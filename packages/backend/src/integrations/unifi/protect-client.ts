// ---------------------------------------------------------------------------
// UniFi Protect API client — login + camera discovery
// Uses raw node:https for self-signed cert support (same pattern as unifi-client.ts)
// ---------------------------------------------------------------------------

import https from 'node:https';
import http from 'node:http';
import { logger } from '../../logger.js';

// -- HTTP helper (self-signed certs OK) ------------------------------------

function request(
  url: string,
  options: { method: string; headers?: Record<string, string>; body?: string; timeout?: number },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method,
        headers: options.headers,
        timeout: options.timeout ?? 30_000,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          });
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timeout')));

    if (options.body) req.write(options.body);
    req.end();
  });
}

// -- CSRF from TOKEN cookie (same pattern as unifi-client.ts) ---------------

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.trim().split('.');
  if (parts.length < 2) return null;
  let seg = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (seg.length % 4) seg += '=';
  try {
    return JSON.parse(Buffer.from(seg, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function csrfFromTokenCookie(cookieHeader: string): string | null {
  for (const piece of cookieHeader.split(';')) {
    const trimmed = piece.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name.toUpperCase() !== 'TOKEN') continue;
    const value = trimmed.slice(eq + 1);
    const payload = decodeJwtPayload(value);
    const tok = payload?.csrfToken;
    if (typeof tok === 'string' && tok.length > 0) return tok;
  }
  return null;
}

// -- Types ------------------------------------------------------------------

export interface ProtectChannel {
  id: number;
  name: string;
  rtspAlias: string;
  enabled: boolean;
  isRtspEnabled: boolean;
  width: number;
  height: number;
}

export interface ProtectCamera {
  id: string;
  name: string;
  type: string;
  state: string; // 'CONNECTED', 'DISCONNECTED', etc.
  channels: ProtectChannel[];
}

export interface DiscoveredCamera {
  /** Protect camera ID */
  protectId: string;
  /** Human name from Protect (e.g. "Back Door") */
  name: string;
  /** Normalized go2rtc stream name (e.g. "back_door") */
  streamName: string;
  /** Camera model (e.g. "UVC G4 Pro") */
  model: string;
  /** Whether Protect reports the camera as connected */
  connected: boolean;
  /** Full RTSP URL for the best-quality stream */
  rtspUrl: string;
}

// -- Client class -----------------------------------------------------------

export class ProtectClient {
  private cookies = '';
  private csrfToken = '';
  private baseUrl: string;
  /** True after a confirmed bad-credentials response (stops retrying until config changes). */
  badCredentials = false;

  constructor(
    private host: string,
    private username: string,
    private password: string,
  ) {
    // Ensure https://
    if (!/^https?:\/\//i.test(host)) {
      this.baseUrl = `https://${host}`;
    } else {
      this.baseUrl = host;
    }
    this.baseUrl = this.baseUrl.replace(/\/+$/, '');
  }

  async login(): Promise<void> {
    const res = await request(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Referer: `${this.baseUrl}/`,
      },
      body: JSON.stringify({ username: this.username, password: this.password }),
      timeout: 15_000,
    });

    if (res.status === 401 || res.status === 403) {
      this.badCredentials = true;
      throw new Error(`UniFi Protect login failed: invalid credentials (${res.status})`);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`UniFi Protect login failed: ${res.status} — ${res.body.slice(0, 300)}`);
    }

    // Extract cookies
    const setCookieRaw = res.headers['set-cookie'];
    const setCookies = Array.isArray(setCookieRaw) ? setCookieRaw : setCookieRaw ? [setCookieRaw] : [];
    this.cookies = setCookies.map((c) => c.split(';')[0]).join('; ');

    // Extract CSRF token from header or TOKEN cookie JWT
    const hdrCsrf = res.headers['x-csrf-token'];
    if (hdrCsrf) this.csrfToken = Array.isArray(hdrCsrf) ? hdrCsrf[0] : hdrCsrf;
    const fromCookie = csrfFromTokenCookie(this.cookies);
    if (fromCookie) this.csrfToken = fromCookie;

    this.badCredentials = false;
    logger.info({ host: this.host }, 'UniFi Protect: logged in');
  }

  /**
   * Discover cameras from the Protect bootstrap API.
   * Tries the UniFi OS path first (/proxy/protect/...), falls back to standalone NVR path.
   */
  async discoverCameras(): Promise<DiscoveredCamera[]> {
    const paths = ['/proxy/protect/api/bootstrap', '/api/bootstrap'];
    let lastErr: Error | null = null;

    for (const path of paths) {
      try {
        const cameras = await this.fetchBootstrapCameras(path);
        return cameras;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        // 404 → try next path; other errors → stop
        if (!lastErr.message.includes('404')) throw lastErr;
      }
    }

    throw lastErr ?? new Error('UniFi Protect bootstrap: no cameras found');
  }

  private async fetchBootstrapCameras(path: string): Promise<DiscoveredCamera[]> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Cookie: this.cookies,
      Referer: `${this.baseUrl}/`,
    };
    if (this.csrfToken) headers['x-csrf-token'] = this.csrfToken;

    const res = await request(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers,
      timeout: 30_000,
    });

    if (res.status === 401) {
      // Session expired — caller should re-login and retry
      const err = new Error('UniFi Protect session expired (401)');
      (err as { status?: number }).status = 401;
      throw err;
    }
    if (res.status === 404) {
      throw new Error(`UniFi Protect bootstrap 404 at ${path}`);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`UniFi Protect bootstrap ${res.status}: ${res.body.slice(0, 300)}`);
    }

    // Update CSRF if returned
    const csrf = res.headers['x-csrf-token'];
    if (csrf) this.csrfToken = Array.isArray(csrf) ? csrf[0] : csrf;
    const fromCookie = csrfFromTokenCookie(this.cookies);
    if (fromCookie) this.csrfToken = fromCookie;

    const data = JSON.parse(res.body) as { cameras?: ProtectCamera[] };
    const cameras = data.cameras ?? [];

    // Extract host for RTSP URLs (strip protocol/port from baseUrl)
    const protectHost = new URL(this.baseUrl).hostname;

    return cameras
      .map((cam) => {
        // Pick the highest-resolution enabled RTSP channel
        const channel = cam.channels
          .filter((ch) => ch.enabled && ch.isRtspEnabled && ch.rtspAlias)
          .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];

        if (!channel) return null;

        return {
          protectId: cam.id,
          name: cam.name,
          streamName: normalizeStreamName(cam.name),
          model: cam.type,
          connected: cam.state === 'CONNECTED',
          rtspUrl: `rtsp://${protectHost}:7447/${channel.rtspAlias}`,
        };
      })
      .filter((c): c is DiscoveredCamera => c !== null);
  }
}

/**
 * Normalize a camera name to a go2rtc-compatible stream name.
 * "Back Door" → "back_door", "Garage (Side)" → "garage_side"
 */
function normalizeStreamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
