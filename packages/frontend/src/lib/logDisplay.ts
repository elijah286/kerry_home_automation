// ---------------------------------------------------------------------------
// Human-readable primary line for system terminal logs (msg + structured ctx)
// ---------------------------------------------------------------------------

export interface LogPrimaryFields {
  msg: string;
  context?: Record<string, unknown>;
}

/** Fields needed for pino-style multiline rendering (system terminal). */
export interface LogTerminalFields extends LogPrimaryFields {
  ts: number;
  level: string;
  pid?: number;
}

export function formatTerminalTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function formatContextValueForTerminal(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (typeof v === 'symbol') return v.toString();
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Lines matching dev `pino-pretty` layout: `[HH:mm:ss.SSS] LEVEL (pid): msg` then `    key: value` per context field.
 */
export function formatTerminalLogLines(entry: LogTerminalFields): string[] {
  const t = formatTerminalTimestamp(entry.ts);
  const lv = (entry.level || 'info').toUpperCase();
  const pid = entry.pid != null ? ` (${entry.pid})` : '';
  const msg = entry.msg ?? '';
  const lines: string[] = [`[${t}] ${lv}${pid}: ${msg}`];
  const ctx = entry.context;
  if (ctx && typeof ctx === 'object') {
    for (const key of Object.keys(ctx)) {
      lines.push(`    ${key}: ${formatContextValueForTerminal(ctx[key])}`);
    }
  }
  return lines;
}

function msgReferencesIntegration(msg: string, integration: string): boolean {
  const m = msg.toLowerCase();
  const slug = integration.toLowerCase().replace(/_/g, ' ');
  if (m.includes(slug) || m.includes(integration.toLowerCase())) return true;
  const parts = integration.split('_').filter(Boolean);
  return parts.every((p) => m.includes(p.toLowerCase()));
}

export function formatIntegrationTitle(integration: string): string {
  return integration
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function shortId(id: string): string {
  if (id.length <= 28) return id;
  return `${id.slice(0, 12)}…${id.slice(-8)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shorten IDs for display (device ids, UUIDs, entry ids). */
function shortResourceId(id: string): string {
  if (!id) return '…';
  if (UUID_RE.test(id)) return `…${id.slice(-8)}`;
  if (id.includes('.')) {
    const parts = id.split('.');
    const head = parts[0] ?? id;
    const rest = parts.slice(1).join('.');
    const intg = formatIntegrationTitle(head);
    const tail = rest.length > 14 ? `…${rest.slice(-10)}` : rest;
    return `${intg} · ${tail}`;
  }
  return shortId(id);
}

function statusSuffix(status: number | undefined, ms: number | undefined): string {
  const parts: string[] = [];
  if (typeof status === 'number') {
    if (status >= 200 && status < 300) parts.push('ok');
    else if (status === 304) parts.push('cached');
    else parts.push(String(status));
  }
  if (typeof ms === 'number' && ms >= 0) parts.push(`${ms}ms`);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

/**
 * Turn API paths into a short sentence (no method/status timing).
 */
function summarizeHttpPath(method: string, pathname: string): string {
  const m = method.toUpperCase();
  const p = pathname.split('?')[0] ?? pathname;

  if (p === '/ws') return 'Live state stream (WebSocket)';

  if (p === '/api/health') return 'Health check';

  if (p === '/api/devices') return m === 'GET' ? 'Load all devices' : `Devices (${m})`;
  if (p === '/api/integrations') return 'Load integrations & status';
  if (p === '/api/cameras') return 'List cameras';
  if (p === '/api/cameras/recover') return 'Cameras · reconnect go2rtc / refresh list';
  if (p === '/api/settings') return 'Load settings';
  if (p === '/api/areas') return m === 'GET' ? 'Load rooms / areas' : `Areas (${m})`;
  if (p === '/api/alarms') return m === 'GET' ? 'Load alarms' : `Alarms (${m})`;
  if (p === '/api/automations' || p === '/api/automations/groups') return 'Load automations';
  if (p === '/api/automations/history') return 'Automation run history';
  if (p === '/api/automations/yaml') return m === 'GET' ? 'Load automations YAML' : 'Save automations YAML';
  if (p === '/api/automations/export-all') return 'Export all automations';
  if (p === '/api/helpers') return 'Load helpers';
  if (p === '/api/helpers/reload') return 'Reload helpers';
  if (p === '/api/helpers/yaml') return m === 'GET' ? 'Load helpers YAML' : 'Save helpers YAML';
  if (p === '/api/role-permissions') return 'Load role permissions';
  if (p === '/api/users') return 'Manage users';
  if (p === '/api/calendar/feeds') return 'Calendar feeds';
  if (p === '/api/device-settings/history') return 'Device settings history';
  if (p === '/api/screensaver/photos') return 'Screensaver photos';
  if (p === '/api/chat/test') return 'Test chat connection';
  if (p === '/api/paprika/status') return 'Paprika link status';
  if (p === '/api/paprika/refresh') return 'Refresh Paprika cache';
  if (p === '/api/paprika/recipes/full') return 'Load Paprika recipes';
  if (p === '/api/paprika/categories') return 'Paprika categories';
  if (p === '/api/paprika/groceries') return 'Paprika groceries';
  if (p === '/api/paprika/meals') return 'Paprika meals';

  if (p === '/api/system/stats') return 'System stats (CPU, memory, disk)';
  if (p === '/api/system/logs') return 'Status log snapshot';
  if (p === '/api/system/logs/stream') return 'Status log live stream';
  if (p === '/api/system/update-log') return 'System update log';
  if (p === '/api/system/restart/backend') return 'Restart backend';
  if (p === '/api/system/restart/frontend') return 'Restart frontend';
  if (p === '/api/system/restart/hardware') return 'Reboot server';
  if (p === '/api/system/reload/automations') return 'Reload automations';

  if (p === '/api/auth/login') return 'Sign in';
  if (p === '/api/auth/logout') return 'Sign out';
  if (p === '/api/auth/me') return 'Session / profile';

  if (p === '/api/roborock/request-code') return 'Roborock · request login code';
  if (p === '/api/roborock/login') return 'Roborock · complete login';
  if (p.startsWith('/api/roborock/map')) return 'Roborock · vacuum map';

  let mm: RegExpExecArray | null;

  mm = /^\/api\/cameras\/([^/]+)\/snapshot$/.exec(p);
  if (mm) return `Camera still · ${mm[1]?.replace(/_/g, ' ') ?? 'camera'}`;

  mm = /^\/api\/cameras\/([^/]+)\/mjpeg$/.exec(p);
  if (mm) return `Camera MJPEG · ${mm[1]}`;

  mm = /^\/api\/cameras\/([^/]+)\/stream$/.exec(p);
  if (mm) return `Camera live stream · ${mm[1]}`;

  mm = /^\/api\/cameras\/([^/]+)\/webrtc$/.exec(p);
  if (mm) return `Camera WebRTC · ${mm[1]}`;

  mm = /^\/api\/devices\/([^/]+)\/command$/.exec(p);
  if (mm) return `Send command · ${shortResourceId(mm[1]!)}`;

  mm = /^\/api\/devices\/([^/]+)\/history$/.exec(p);
  if (mm) return `Device history · ${shortResourceId(mm[1]!)}`;

  mm = /^\/api\/devices\/([^/]+)\/settings$/.exec(p);
  if (mm) return `Device settings · ${shortResourceId(mm[1]!)}`;

  mm = /^\/api\/devices\/([^/]+)$/.exec(p);
  if (mm) return `Device state · ${shortResourceId(mm[1]!)}`;

  mm = /^\/api\/integrations\/([^/]+)\/entries\/([^/]+)\/rebuild$/.exec(p);
  if (mm) {
    const intg = formatIntegrationTitle(mm[1]!);
    return `Rebuild devices · ${intg} · entry ${tailLabel(mm[2]!)}`;
  }

  mm = /^\/api\/integrations\/([^/]+)\/entries\/([^/]+)$/.exec(p);
  if (mm) {
    const intg = formatIntegrationTitle(mm[1]!);
    return `${m === 'DELETE' ? 'Delete' : m === 'PATCH' || m === 'PUT' ? 'Update' : 'Open'} account · ${intg} · ${tailLabel(mm[2]!)}`;
  }

  mm = /^\/api\/integrations\/([^/]+)\/entries$/.exec(p);
  if (mm) return `Integration accounts · ${formatIntegrationTitle(mm[1]!)}`;

  mm = /^\/api\/integrations\/([^/]+)\/config$/.exec(p);
  if (mm) return `${m === 'POST' || m === 'PUT' ? 'Save' : 'Open'} integration settings · ${formatIntegrationTitle(mm[1]!)}`;

  mm = /^\/api\/integrations\/([^/]+)\/restart$/.exec(p);
  if (mm) return `Restart integration · ${formatIntegrationTitle(mm[1]!)}`;

  mm = /^\/api\/integrations\/([^/]+)\/rebuild$/.exec(p);
  if (mm) return `Rebuild integration devices · ${formatIntegrationTitle(mm[1]!)}`;

  mm = /^\/api\/integrations\/([^/]+)$/.exec(p);
  if (mm) return `Integration detail · ${formatIntegrationTitle(mm[1]!)}`;

  mm = /^\/api\/automations\/([^/]+)\/trigger$/.exec(p);
  if (mm) return `Run automation · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/automations\/([^/]+)\/enable$/.exec(p);
  if (mm) return `Toggle automation · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/automations\/([^/]+)\/history$/.exec(p);
  if (mm) return `Automation history · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/automations\/([^/]+)\/yaml$/.exec(p);
  if (mm) return `Automation YAML · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/automations\/([^/]+)\/duplicate$/.exec(p);
  if (mm) return `Duplicate automation · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/automations\/([^/]+)$/.exec(p);
  if (mm) return `Automation · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/alarms\/([^/]+)\/duplicate$/.exec(p);
  if (mm) return `Duplicate alarm · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/alarms\/([^/]+)$/.exec(p);
  if (mm) return `Alarm · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/helpers\/([^/]+)$/.exec(p);
  if (mm) return `Helper · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/settings\/([^/]+)$/.exec(p);
  if (mm) return `Setting · ${mm[1]}`;

  mm = /^\/api\/users\/([^/]+)$/.exec(p);
  if (mm) return `User · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/role-permissions\/([^/]+)$/.exec(p);
  if (mm) return `Role permissions · ${mm[1]}`;

  mm = /^\/api\/screensaver\/photos\/([^/]+)$/.exec(p);
  if (mm) return `Screensaver photo · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/screensaver\/next\/([^/]+)$/.exec(p);
  if (mm) return `Screensaver next photo · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/paprika\/recipes\/([^/]+)\/photo$/.exec(p);
  if (mm) return `Paprika recipe photo · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/paprika\/recipes\/([^/]+)$/.exec(p);
  if (mm) return `Paprika recipe · ${tailLabel(mm[1]!)}`;

  mm = /^\/api\/installer\/(start|active|artifacts|cancel\/[^/]+|progress\/[^/]+|status\/[^/]+|download\/[^/]+)$/.exec(p);
  if (mm) return `Installer · ${mm[1]?.replace(/\//g, ' · ')}`;

  if (p === '/api/chat' || p.startsWith('/api/chat?')) return 'Chat message';

  // Fallback: shorten path noise
  const simplified = p
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '…')
    .replace(/\/[0-9a-f-]{36}(?=\/|$)/gi, '/…');
  return `API ${m} ${simplified.length > 56 ? `${simplified.slice(0, 54)}…` : simplified}`;
}

function tailLabel(id: string): string {
  if (UUID_RE.test(id)) return `…${id.slice(-8)}`;
  if (id.length > 24) return shortId(id);
  return id;
}

function digestErrorContext(c: Record<string, unknown>): string | null {
  const err = c.err;
  if (!err || typeof err !== 'object') return null;
  const o = err as Record<string, unknown>;
  if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
  return null;
}

/**
 * Text shown as the main log line when details are collapsed.
 * Uses `msg` when it is already descriptive; synthesizes from context when `msg` is generic (e.g. HTTP).
 */
export function formatLogPrimaryLine(entry: LogPrimaryFields): string {
  const msg = entry.msg ?? '';
  const c = entry.context;

  if (msg === 'ISO build progress' && c && typeof c.percent === 'number') {
    const detail =
      typeof c.message === 'string' && c.message.trim()
        ? c.message.trim().replace(/\s+/g, ' ')
        : '';
    const tail = detail.length > 120 ? `${detail.slice(0, 118)}…` : detail;
    return tail ? `ISO build · ${c.percent}% · ${tail}` : `ISO build · ${c.percent}%`;
  }

  if (msg === 'HTTP' && c && typeof c.method === 'string' && typeof c.path === 'string') {
    const status = typeof c.status === 'number' ? c.status : undefined;
    const ms = typeof c.ms === 'number' ? c.ms : undefined;
    const summary = summarizeHttpPath(c.method, c.path);
    return `${summary}${statusSuffix(status, ms)}`;
  }

  if (msg === 'Device command' && c && typeof c.deviceId === 'string' && c.type != null) {
    return `Device command · ${String(c.type)} · ${shortResourceId(c.deviceId)}`;
  }

  if (msg === 'Automation run finished' && c && typeof c.automation === 'string') {
    const st = typeof c.status === 'string' ? ` · ${c.status}` : '';
    return `Automation finished · ${c.automation}${st}`;
  }

  // Subsystem logs (pino child `module`, e.g. tesla-streaming) — surface payload, not only generic msg.
  if (msg && c && typeof c.module === 'string' && c.module.trim()) {
    const title = formatIntegrationTitle(c.module.replace(/-/g, '_'));
    if (typeof c.value === 'string' && c.value.trim()) {
      const v = c.value.trim().replace(/\s+/g, ' ');
      const excerpt = v.length > 140 ? `${v.slice(0, 138)}…` : v;
      return `${title} · ${msg} · ${excerpt}`;
    }
    return `${title}: ${msg}`;
  }

  if (msg && c && typeof c.integration === 'string') {
    if (!msgReferencesIntegration(msg, c.integration)) {
      return `${formatIntegrationTitle(c.integration)}: ${msg}`;
    }
  }

  if (!msg && c && typeof c.integration === 'string') {
    return formatIntegrationTitle(c.integration);
  }

  // Error/warn lines: merge headline with `err.message` when the headline doesn't repeat it.
  if (c) {
    const em = digestErrorContext(c);
    if (em && !msg.includes(em.slice(0, Math.min(48, em.length)))) {
      const looksLikeErrorLine =
        /failed|error|denied|unavailable|exception|timeout|refused|invalid/i.test(msg);
      if (looksLikeErrorLine) return `${msg} — ${em}`;
    }
  }

  return msg || '(no message)';
}
