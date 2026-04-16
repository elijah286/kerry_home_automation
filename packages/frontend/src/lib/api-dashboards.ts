// ---------------------------------------------------------------------------
// Dashboard API client. Thin wrapper over `fetchApi` for the /api/dashboards
// endpoints. Keeps types tight so cards-in-hand editor work is JS-safe.
// ---------------------------------------------------------------------------

import type {
  DashboardDoc,
  CreateDashboardRequest,
  UpdateDashboardRequest,
} from '@ha/shared';
import { getApiBase, isRemoteAccess } from './api-base';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const base = getApiBase();
  const remote = typeof window !== 'undefined' && isRemoteAccess();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };
  const init: RequestInit = { ...options, headers };
  if (remote) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('ha_remote_token') : null;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } else {
    init.credentials = 'include';
  }
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export async function listDashboards(): Promise<DashboardDoc[]> {
  return request<DashboardDoc[]>('/api/dashboards');
}

export async function loadDashboard(docPath: string): Promise<DashboardDoc> {
  return request<DashboardDoc>(`/api/dashboards/${encodeURIComponent(docPath)}`);
}

export async function createDashboard(body: CreateDashboardRequest): Promise<DashboardDoc> {
  return request<DashboardDoc>('/api/dashboards', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateDashboard(docPath: string, body: UpdateDashboardRequest): Promise<DashboardDoc> {
  return request<DashboardDoc>(`/api/dashboards/${encodeURIComponent(docPath)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteDashboard(docPath: string): Promise<void> {
  await request<void>(`/api/dashboards/${encodeURIComponent(docPath)}`, { method: 'DELETE' });
}
