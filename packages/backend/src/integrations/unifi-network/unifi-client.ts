// ---------------------------------------------------------------------------
// UniFi Network Controller API client
// UniFi OS: cookie auth + CSRF; paths prefixed with /proxy/network
// Standalone Network app (Cloud Key / software): same auth, paths /api/... only
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
  state: number | string;
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

/** Pull array from UniFi JSON `data` (shape varies by endpoint / version). */
function extractItems(data: unknown): unknown[] {
  if (data === undefined || data === null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of ['devices', 'list', 'items', 'results', 'sites', 'data', 'sta']) {
      const v = o[k];
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const inner = extractItems(v);
        if (inner.length) return inner;
      }
    }
  }
  return [];
}

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
        timeout: options.timeout ?? 30_000,
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
  private siteKey: string;
  /** '' = legacy standalone app; '/proxy/network' = UniFi OS (UDM, UCG, Dream Router, …) */
  private readonly networkApiBase: string;

  constructor(
    private host: string,
    private username: string,
    private password: string,
    site: string = 'default',
    options?: { useUnifiOsProxy?: boolean },
  ) {
    if (!/^https?:\/\//i.test(this.host)) {
      this.host = `https://${this.host}`;
    }
    this.host = this.host.replace(/\/+$/, '');
    const s = (site || 'default').trim();
    this.siteKey = s || 'default';
    const useProxy = options?.useUnifiOsProxy !== false;
    this.networkApiBase = useProxy ? '/proxy/network' : '';
  }

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
      throw new Error(`UniFi login failed: ${res.status} ${res.statusText} — ${res.body.slice(0, 300)}`);
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

    logger.info(
      { site: this.siteKey, hasCsrf: Boolean(this.csrfToken), proxy: Boolean(this.networkApiBase) },
      'UniFi Network: logged in',
    );
  }

  /**
   * Resolve site key for `/api/s/{site}/…`. Wrong name → empty device lists with HTTP 200.
   */
  private async resolveSiteKey(): Promise<void> {
    const configured = this.siteKey.toLowerCase();
    try {
      const raw = await this.apiJsonUnknown('GET', `${this.networkApiBase}/api/self/sites`);
      const sites = extractItems(raw) as { name?: string; desc?: string }[];
      const names = sites
        .map((s) => s.name)
        .filter((n): n is string => typeof n === 'string' && n.length > 0);

      if (names.length === 0) {
        logger.warn({ configured }, 'UniFi Network: site list empty — using configured site key as-is');
        return;
      }

      const exact = names.find((n) => n.toLowerCase() === configured);
      if (exact) {
        this.siteKey = exact;
        return;
      }

      const fallback = names.find((n) => n === 'default') ?? names[0];
      logger.warn(
        { configured, fallback, available: names },
        'UniFi Network: configured site not found on controller; using fallback site key',
      );
      this.siteKey = fallback;
    } catch (err) {
      logger.warn({ err, configured }, 'UniFi Network: could not list sites; using configured site key');
    }
  }

  private sitePath(suffix: string): string {
    return `${this.networkApiBase}/api/s/${encodeURIComponent(this.siteKey)}${suffix}`;
  }

  /**
   * Fetch infrastructure devices. Tries GET first (works reliably on many UniFi OS builds), then POST with filters.
   */
  async getDevices(): Promise<UnifiDevice[]> {
    const attempts: { label: string; method: 'GET' | 'POST'; path: string; body?: string }[] = [
      { label: 'GET stat/device', method: 'GET', path: this.sitePath('/stat/device') },
      { label: 'GET stat/device-basic', method: 'GET', path: this.sitePath('/stat/device-basic') },
      { label: 'POST stat/device macs[]', method: 'POST', path: this.sitePath('/stat/device'), body: JSON.stringify({ macs: [] }) },
      { label: 'POST stat/device {}', method: 'POST', path: this.sitePath('/stat/device'), body: JSON.stringify({}) },
    ];

    let lastErr: unknown;
    for (const a of attempts) {
      try {
        const raw = await this.apiJsonUnknown(a.method, a.path, a.body);
        const items = extractItems(raw).map((x) => x as UnifiDevice);
        const normalized = items.map(normalizeUnifiDevice).filter((d) => Boolean(d.mac));
        if (normalized.length > 0) {
          logger.info({ label: a.label, count: normalized.length }, 'UniFi Network: loaded devices');
          return normalized;
        }
        if (items.length > 0 && normalized.length === 0) {
          logger.warn(
            { label: a.label, sample: items[0] },
            'UniFi Network: devices returned but none had a usable MAC — check API format',
          );
        }
      } catch (err) {
        lastErr = err;
      }
    }

    if (lastErr) {
      logger.warn({ err: lastErr }, 'UniFi Network: all device fetch strategies failed');
    }
    return [];
  }

  async getClients(): Promise<UnifiClient[]> {
    const raw = await this.apiJsonUnknown('GET', this.sitePath('/stat/sta'));
    const items = extractItems(raw).map((x) => x as UnifiClient);
    return items.map(normalizeUnifiClient).filter((c) => Boolean(c.mac));
  }

  /**
   * Block or unblock a client (Wi‑Fi / LAN client) via stamgr. Primarily for wireless clients.
   */
  async setClientBlocked(macColon: string, blocked: boolean): Promise<void> {
    const cmd = blocked ? 'block-sta' : 'unblock-sta';
    await this.apiJsonUnknown(
      'POST',
      this.sitePath('/cmd/stamgr'),
      JSON.stringify({ cmd, mac: macColon.toLowerCase() }),
    );
  }

  private parseDataUnknown(raw: string): unknown {
    const json = JSON.parse(raw) as { data?: unknown; meta?: { rc?: string; msg?: string } };
    if (json.meta?.rc === 'error') {
      throw new Error(json.meta.msg ?? 'UniFi API returned meta.rc=error');
    }
    if ('data' in json) return json.data;
    return json;
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
      (err as { status?: number }).status = 401;
      throw err;
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`UniFi API ${res.status}: ${res.statusText} — ${res.body.slice(0, 400)}`);
    }

    const csrf = res.headers['x-csrf-token'];
    if (csrf) this.csrfToken = Array.isArray(csrf) ? csrf[0] : csrf;
    this.applyCsrfFromCookies();

    const trimmed = res.body.trim();
    if (!trimmed) return [];

    const data = this.parseDataUnknown(trimmed);
    if (data === undefined || data === null) {
      return [];
    }
    return data;
  }
}

function pickMac(d: Record<string, unknown>): string | undefined {
  const direct = d.mac ?? d.mac_addr;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const et = d.ethernet_table;
  if (Array.isArray(et) && et[0] && typeof et[0] === 'object') {
    const m = (et[0] as { mac?: string }).mac;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  return undefined;
}

function normalizeUnifiDevice(d: UnifiDevice): UnifiDevice {
  const o = d as unknown as Record<string, unknown>;
  const mac = pickMac(o);
  return { ...d, mac };
}

function normalizeUnifiClient(c: UnifiClient): UnifiClient {
  const mac = c.mac ?? c.mac_address;
  return { ...c, mac };
}
