import { getApiBase, isRemoteAccess } from './api-base';

function getRemoteToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ha_remote_token');
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const base = getApiBase();
  const remote = typeof window !== 'undefined' && isRemoteAccess();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };

  const fetchOpts: RequestInit = { ...options, headers };

  if (remote) {
    const token = getRemoteToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } else {
    fetchOpts.credentials = 'include';
  }

  const res = await fetch(`${base}${path}`, fetchOpts);

  if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    if (remote) {
      localStorage.removeItem('ha_remote_token');
      localStorage.removeItem('ha_remote_refresh');
    }
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function sendCommand(deviceId: string, command: Record<string, unknown>): Promise<void> {
  await fetchApi(`/api/devices/${encodeURIComponent(deviceId)}/command`, {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

export async function updateDeviceSettings(
  deviceId: string,
  settings: {
    display_name?: string | null;
    area_id?: string | null;
    history_retention_days?: number | null;
    aliases?: string[];
  },
): Promise<{ ok: boolean }> {
  const { aliases, ...rest } = settings;
  if (aliases !== undefined) {
    await fetchApi(`/api/devices/${encodeURIComponent(deviceId)}/aliases`, {
      method: 'PUT',
      body: JSON.stringify({ aliases }),
    });
  }
  if (Object.keys(rest).length > 0) {
    return fetchApi(`/api/devices/${encodeURIComponent(deviceId)}/settings`, {
      method: 'PUT',
      body: JSON.stringify(rest),
    });
  }
  return { ok: true };
}

// Paprika
import type { PaprikaRecipe, PaprikaCategory, PaprikaGroceryItem, PaprikaMeal } from '@ha/shared';

export async function getPaprikaRecipesFull(): Promise<{ recipes: PaprikaRecipe[]; count: number }> {
  return fetchApi('/api/paprika/recipes/full');
}

export async function getPaprikaCategories(): Promise<{ categories: PaprikaCategory[] }> {
  return fetchApi('/api/paprika/categories');
}

export async function getPaprikaGroceries(): Promise<{ groceries: PaprikaGroceryItem[] }> {
  return fetchApi('/api/paprika/groceries');
}

export async function getPaprikaMeals(): Promise<{ meals: PaprikaMeal[] }> {
  return fetchApi('/api/paprika/meals');
}

export async function refreshPaprika(): Promise<{ ok: boolean; cleared: number }> {
  return fetchApi('/api/paprika/refresh', { method: 'POST' });
}

export async function getPaprikaStatus(): Promise<{ recipeCount: number; lastSync: number | null }> {
  return fetchApi('/api/paprika/status');
}

// Calendar (ICS feeds)
import type { IcalFeedSnapshot } from '@ha/shared';

export async function getCalendarFeeds(): Promise<{ feeds: IcalFeedSnapshot[] }> {
  return fetchApi('/api/calendar/feeds');
}

// Alarms
import type { Alarm, AlarmCreate, AlarmUpdate } from '@ha/shared';

export async function getAlarms(): Promise<{ alarms: Alarm[] }> {
  return fetchApi('/api/alarms');
}

export async function createAlarm(data: AlarmCreate): Promise<{ alarm: Alarm }> {
  return fetchApi('/api/alarms', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateAlarm(id: string, data: AlarmUpdate): Promise<{ alarm: Alarm }> {
  return fetchApi(`/api/alarms/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteAlarm(id: string): Promise<{ ok: boolean }> {
  return fetchApi(`/api/alarms/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function duplicateAlarm(id: string): Promise<{ alarm: Alarm }> {
  return fetchApi(`/api/alarms/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });
}

export async function disableAllAlarms(): Promise<{ ok: boolean }> {
  return fetchApi('/api/alarms/disable-all', { method: 'POST' });
}

export async function enableAllAlarms(): Promise<{ ok: boolean }> {
  return fetchApi('/api/alarms/enable-all', { method: 'POST' });
}

// Automations
import type { Automation, AutomationCreate, AutomationUpdate, AutomationExecutionLog } from '@ha/shared';

export async function getAutomations(): Promise<{ automations: Automation[] }> {
  return fetchApi('/api/automations');
}

export async function getAutomation(id: string): Promise<{ automation: Automation }> {
  return fetchApi(`/api/automations/${encodeURIComponent(id)}`);
}

export async function createAutomation(data: AutomationCreate): Promise<{ automation: Automation }> {
  return fetchApi('/api/automations', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateAutomation(id: string, data: AutomationUpdate): Promise<{ automation: Automation }> {
  return fetchApi(`/api/automations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteAutomation(id: string): Promise<{ ok: boolean }> {
  return fetchApi(`/api/automations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function triggerAutomation(id: string): Promise<{ ok: boolean }> {
  return fetchApi(`/api/automations/${encodeURIComponent(id)}/trigger`, { method: 'POST' });
}

export async function toggleAutomation(id: string, enabled: boolean): Promise<{ automation: Automation }> {
  return fetchApi(`/api/automations/${encodeURIComponent(id)}/enable`, { method: 'PUT', body: JSON.stringify({ enabled }) });
}

export async function getAutomationHistory(id: string, limit = 50, offset = 0): Promise<{ executions: AutomationExecutionLog[] }> {
  return fetchApi(`/api/automations/${encodeURIComponent(id)}/history?limit=${limit}&offset=${offset}`);
}

export async function getGlobalAutomationHistory(limit = 50, offset = 0): Promise<{ executions: AutomationExecutionLog[] }> {
  return fetchApi(`/api/automations/history?limit=${limit}&offset=${offset}`);
}

export async function getAutomationGroups(): Promise<{ groups: string[] }> {
  return fetchApi('/api/automations/groups');
}

export async function duplicateAutomation(id: string): Promise<{ automation: Automation }> {
  return fetchApi(`/api/automations/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });
}

export async function getAutomationsYaml(): Promise<{ yaml: string }> {
  return fetchApi('/api/automations/yaml');
}

export async function saveAutomationsYaml(yamlContent: string): Promise<{ ok: boolean; count: number }> {
  return fetchApi('/api/automations/yaml', { method: 'PUT', body: JSON.stringify({ yaml: yamlContent }) });
}

// Devices
import type { DeviceState } from '@ha/shared';

export async function getDevices(): Promise<{ devices: DeviceState[] }> {
  return fetchApi('/api/devices');
}

// Device history
export async function fetchDeviceHistory(
  deviceId: string,
  limit = 500,
): Promise<{ history: { state: Record<string, unknown>; changedAt: string }[] }> {
  return fetchApi(`/api/devices/${encodeURIComponent(deviceId)}/history?limit=${limit}`);
}

/** Fetch device history within a time range (returns ascending order for graphing) */
export async function fetchDeviceHistoryRange(
  deviceId: string,
  from: Date,
  to: Date = new Date(),
): Promise<{ history: { state: Record<string, unknown>; changedAt: string }[] }> {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return fetchApi(`/api/devices/${encodeURIComponent(deviceId)}/history?${params}`);
}

// Helpers
import type { HelperDefinition } from '@ha/shared';

export async function getHelpers(): Promise<HelperDefinition[]> {
  return fetchApi('/api/helpers');
}

export async function createHelper(def: HelperDefinition): Promise<HelperDefinition> {
  return fetchApi('/api/helpers', { method: 'POST', body: JSON.stringify(def) });
}

export async function updateHelper(id: string, partial: Partial<HelperDefinition>): Promise<HelperDefinition> {
  return fetchApi(`/api/helpers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(partial) });
}

export async function deleteHelper(id: string): Promise<{ ok: boolean }> {
  return fetchApi(`/api/helpers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reloadHelpers(): Promise<{ ok: boolean; count: number }> {
  return fetchApi('/api/helpers/reload', { method: 'POST' });
}

export async function getHelpersYaml(): Promise<string> {
  const res = await fetch(`${typeof window !== 'undefined' ? `http://${window.location.hostname}:3000` : 'http://localhost:3000'}/api/helpers/yaml`, { credentials: 'include' });
  return res.text();
}

export async function saveHelpersYaml(content: string): Promise<{ ok: boolean; count: number }> {
  const res = await fetch(`${typeof window !== 'undefined' ? `http://${window.location.hostname}:3000` : 'http://localhost:3000'}/api/helpers/yaml`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/yaml' },
    credentials: 'include',
    body: content,
  });
  return res.json();
}
