// ---------------------------------------------------------------------------
// Map system log entries to in-app screens (devices, integrations, settings)
// ---------------------------------------------------------------------------

import type { LogPrimaryFields } from '@/lib/logDisplay';

export interface LogInvestigationLink {
  label: string;
  href: string;
}

const AUTOMATION_STATIC_SEGMENTS = new Set(['groups', 'history', 'export-all', 'yaml']);

function addLink(
  out: LogInvestigationLink[],
  seen: Set<string>,
  label: string,
  href: string,
): void {
  if (seen.has(href)) return;
  seen.add(href);
  out.push({ label, href });
}

/** Derive navigation targets from HTTP `path` (query string stripped). */
function linksFromApiPath(pathname: string, add: (label: string, href: string) => void): void {
  const p = (pathname.split('?')[0] ?? pathname).replace(/\/$/, '') || pathname;

  if (p === '/api/devices') {
    add('Devices', '/devices');
    return;
  }

  let m = /^\/api\/devices\/([^/]+)/.exec(p);
  if (m) {
    add('Device', `/devices/${encodeURIComponent(m[1]!)}`);
    return;
  }

  if (p === '/api/integrations') {
    add('Integrations', '/integrations');
    return;
  }

  m = /^\/api\/integrations\/([^/]+)/.exec(p);
  if (m) {
    add('Integration', `/integrations/${encodeURIComponent(m[1]!)}`);
    return;
  }

  if (p === '/api/automations') {
    add('Automations', '/settings/automations');
    return;
  }

  m = /^\/api\/automations\/([^/]+)/.exec(p);
  if (m) {
    const seg = m[1]!;
    if (AUTOMATION_STATIC_SEGMENTS.has(seg)) {
      add('Automations', '/settings/automations');
    } else {
      add('Automation', `/settings/automations/${encodeURIComponent(seg)}`);
    }
    return;
  }

  if (p === '/api/alarms') {
    add('Alarms', '/alarms');
    return;
  }

  m = /^\/api\/alarms\/([^/]+)/.exec(p);
  if (m) {
    add('Alarms', '/alarms');
    return;
  }

  if (p.startsWith('/api/helpers')) {
    add('Helpers', '/settings/helpers');
    return;
  }

  if (p.startsWith('/api/system')) {
    add('System', '/settings/system');
    return;
  }

  if (p === '/api/settings') {
    add('Settings', '/settings');
    return;
  }

  m = /^\/api\/settings\/([^/]+)/.exec(p);
  if (m) {
    const key = m[1]!.toLowerCase();
    if (key === 'llm' || key.startsWith('llm_')) {
      add('LLM', '/settings/llm');
    } else {
      add('Settings', '/settings');
    }
    return;
  }

  if (p.startsWith('/api/users') || p.startsWith('/api/role-permissions')) {
    add('Users', '/settings/users');
    return;
  }

  if (p.startsWith('/api/areas')) {
    add('Areas', '/areas');
    return;
  }

  if (p.startsWith('/api/cameras')) {
    add('Cameras', '/cameras');
    return;
  }

  if (p.startsWith('/api/calendar')) {
    add('Calendar', '/calendar');
    return;
  }

  if (p.startsWith('/api/paprika')) {
    add('Recipes', '/recipes');
    return;
  }

  if (p.startsWith('/api/chat')) {
    add('LLM', '/settings/llm');
    return;
  }

  if (p.startsWith('/api/device-settings')) {
    add('History', '/settings/history');
    return;
  }

  if (p.startsWith('/api/screensaver')) {
    add('Appearance', '/settings/appearance');
    return;
  }

  if (p.startsWith('/api/roborock')) {
    add('Roborock', '/integrations/roborock');
    return;
  }

  if (p.startsWith('/api/installer')) {
    add('Installer', '/settings/server-installer');
    return;
  }
}

/**
 * In-app links for investigating a log line (structured context + HTTP path).
 */
export function getLogInvestigationLinks(entry: LogPrimaryFields): LogInvestigationLink[] {
  const out: LogInvestigationLink[] = [];
  const seen = new Set<string>();
  const add = (label: string, href: string) => addLink(out, seen, label, href);

  const c = entry.context;
  const msg = entry.msg ?? '';

  if (c && typeof c.deviceId === 'string' && c.deviceId.trim()) {
    add('Device', `/devices/${encodeURIComponent(c.deviceId.trim())}`);
  }

  if (c && typeof c.integration === 'string' && c.integration.trim()) {
    add('Integration', `/integrations/${encodeURIComponent(c.integration.trim())}`);
  }

  if (c && typeof c.parentDeviceId === 'string' && c.parentDeviceId.trim()) {
    add('Parent device', `/devices/${encodeURIComponent(c.parentDeviceId.trim())}`);
  }

  if (msg === 'Automation run finished' && c && typeof c.automation === 'string' && c.automation.trim()) {
    add('Automation', `/settings/automations/${encodeURIComponent(c.automation.trim())}`);
  }

  if (msg === 'HTTP' && c && typeof c.path === 'string') {
    linksFromApiPath(c.path, add);
  }

  return out;
}
