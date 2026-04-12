// ---------------------------------------------------------------------------
// UniFi Network Controller API client
// Communicates with UniFi OS controllers via cookie-based auth + CSRF
// ---------------------------------------------------------------------------

import https from 'node:https';
import http from 'node:http';
import { logger } from '../../logger.js';

export interface UnifiDevice {
  mac?: string;
  mac_addr?: string;
  name?: string;
  model?: string;
  type: string;
  state: number;
  uptime?: number;
  num_sta?: number;
  'tx_bytes-r'?: number;
  'rx_bytes-r'?: number;
  tx_bytes?: number;
  rx_bytes?: number;
}

export interface UnifiClient {
  mac?: string;
  mac_address?: string;
  hostname?: string;
  name?: string;
  ip?: string;
  uptime?: number;
  tx_bytes?: number;
  rx_bytes?: number;
  network?: string;
}

/** Decode JWT payload segment (middle part); UniFi OS TOKEN cookie is a JWT whose payload includes csrfToken. */
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

/** Pull csrfToken from TOKEN=… cookie (see Art-of-WiFi UniFi-API-client create_x_csrf_token_header). */
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

function coerceDataArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of ['devices', 'list', 'items', 'results', 'sites']) {
      if (Array.isArray(o[k])) return o[k] as T[];
    }
  }
  return [];
}

/** Simple HTTPS request helper that accepts self-signed certs */
function request(
  url: string,
  options: { method: string; headers?: Record<string, string>; body?: string; timeout?: number },
): Promise<{ status: number; statusText: string; headers: http.IncomingHttpHeaders; body: string }> {
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
        timeout: options.timeout ?? 10_000,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode!,
            statusText: res.statusMessage ?? '',
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          });
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

export class UnifiNetworkClient {
  private cookies = '';
  private csrfToken = '';
  /** Site short name used in /api/s/{site}/… (resolved after login when possible). */
  private siteKey: string;

  constructor(
    private host: string,
    private username: string,
    private password: string,
    site: string = 'default',
  ) {
    if (!/^https?:\/\//i.test(this.host)) {
      this.host = `https://${this.host}`;
    }
    this.host = this.host.replace(/\/+$/, '');
    const s = (site || 'default').trim().toLowerCase();
    this.siteKey = s || 'default';
  }

  /** Effective site key after {@link login} (for logging). */
  getSiteKey(): string {
    return this.siteKey;
  }

  private refererHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Accept: 'application/json',
      Referer: `${this.host}/`,
      ...extra,
    };
  }

  private applyCsrfFromCookies(): void {
    const fromCookie = csrfFromTokenCookie(this.cookies);
    if (fromCookie) this.csrfToken = fromCookie;
  }

  async login(): Promise<void> {
    const res = await request(`${this.host}/api/auth/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Referer: `${this.host}/login`,
      },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`UniFi login failed: ${res.status} ${res.statusText} — ${res.body}`);
    }

    const setCookieRaw = res.headers['set-cookie'];
    const setCookies = Array.isArray(setCookieRaw) ? setCookieRaw : setCookieRaw ? [setCookieRaw] : [];
    this.cookies = setCookies
      .map((c) => c.split(';')[0])
      .join('; ');

    const hdrCsrf = res.headers['x-csrf-token'];
    if (hdrCsrf) this.csrfToken = Array.isArray(hdrCsrf) ? hdrCsrf[0] : hdrCsrf;

    this.applyCsrfFromCookies();

    await this.resolveSiteKey();

    logger.info({ site: this.siteKey, hasCsrf: Boolean(this.csrfToken) }, 'UniFi Network: logged in');
  }

  /**
   * Match configured site to controller sites; wrong site name yields empty device lists with HTTP 200.
   */
  private async resolveSiteKey(): Promise<void> {
    const configured = this.siteKey;
    try {
      const raw = await this.apiJsonUnknown('GET', '/proxy/network/api/self/sites');
      const sites = coerceDataArray<{ name?: string }>(raw);
      const names = sites.map((s) => s.name).filter((n): n is string => Boolean(n));
      if (names.length === 0) {
        logger.warn({ configured }, 'UniFi Network: /api/self/sites returned no sites; keeping configured key');
        return;
      }
      if (names.some((n) => n.toLowerCase() === configured)) {
        this.siteKey = names.find((n) => n.toLowerCase() === configured)!;
        return;
      }
      const fallback = names.find((n) => n === 'default') ?? names[0];
      logger.warn(
        { configured, fallback, available: names },
        'UniFi Network: configured site not found on controller; using fallback site key',
      );
      this.siteKey = fallback;
    } catch (err) {
      logger.warn({ err, configured }, 'UniFi Network: could not list sites; keeping configured site key');
    }
  }

  async getDevices(): Promise<UnifiDevice[]> {
    const path = `/proxy/network/api/s/${this.siteKey}/stat/device`;
    try {
      const post = coerceDataArray<UnifiDevice>(
        await this.apiJsonUnknown('POST', path, JSON.stringify({ macs: [] })),
      );
      if (post.length) return post.map(normalizeUnifiDevice);
    } catch (err) {
      logger.warn({ err }, 'UniFi Network: POST stat/device failed; trying GET fallbacks');
    }
    try {
      const basic = coerceDataArray<UnifiDevice>(
        await this.apiJsonUnknown('GET', `${path}-basic`),
      );
      if (basic.length) return basic.map(normalizeUnifiDevice);
    } catch (err) {
      logger.warn({ err }, 'UniFi Network: GET stat/device-basic failed');
    }
    const plain = coerceDataArray<UnifiDevice>(await this.apiJsonUnknown('GET', path));
    return plain.map(normalizeUnifiDevice);
  }

  async getClients(): Promise<UnifiClient[]> {
    const raw = await this.apiJsonUnknown(
      'GET',
      `/proxy/network/api/s/${this.siteKey}/stat/sta`,
    );
    return coerceDataArray<UnifiClient>(raw).map(normalizeUnifiClient);
  }

  private parseDataUnknown(raw: string): unknown {
    const json = JSON.parse(raw) as { data?: unknown; meta?: { rc?: string; msg?: string } };
    if (json.meta?.rc === 'error') {
      throw new Error(json.meta.msg ?? 'UniFi API returned meta.rc=error');
    }
    return json.data;
  }

  private async apiJsonUnknown(method: 'GET' | 'POST', path: string, body?: string): Promise<unknown> {
    this.applyCsrfFromCookies();

    const headers: Record<string, string> = this.refererHeaders({
      Cookie: this.cookies,
    });
    if (this.csrfToken) {
      headers['x-csrf-token'] = this.csrfToken;
    }
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await request(`${this.host}${path}`, { method, headers, body });

    if (res.status === 401) {
      const err = new Error('UniFi API 401 Unauthorized');
      (err as any).status = 401;
      throw err;
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`UniFi API ${res.status}: ${res.statusText} — ${res.body.slice(0, 200)}`);
    }

    const csrf = res.headers['x-csrf-token'];
    if (csrf) this.csrfToken = Array.isArray(csrf) ? csrf[0] : csrf;
    this.applyCsrfFromCookies();

    const data = this.parseDataUnknown(res.body);
    if (data === undefined || data === null) {
      return [];
    }
    return data;
  }
}

function normalizeUnifiDevice(d: UnifiDevice): UnifiDevice {
  const mac = d.mac ?? (d as { mac_addr?: string }).mac_addr;
  return { ...d, mac };
}

function normalizeUnifiClient(c: UnifiClient): UnifiClient {
  const mac = c.mac ?? c.mac_address;
  return { ...c, mac };
}
