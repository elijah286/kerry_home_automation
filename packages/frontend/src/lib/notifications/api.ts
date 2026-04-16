// ---------------------------------------------------------------------------
// Thin REST client for notifications. Same auth pattern as api-dashboards.
// WS push is the primary channel; these calls are used for ack / seen / list
// bootstrap (fallback when the WS snapshot hasn't arrived yet).
// ---------------------------------------------------------------------------

import type {
  CreateNotificationRequest,
  Notification,
} from '@ha/shared';
import { getApiBase, isRemoteAccess } from '@/lib/api-base';

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

export async function listNotifications(): Promise<Notification[]> {
  return request<Notification[]>('/api/notifications');
}

export async function publishNotification(body: CreateNotificationRequest): Promise<Notification> {
  return request<Notification>('/api/notifications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function acknowledgeNotification(id: string): Promise<Notification> {
  return request<Notification>(`/api/notifications/${encodeURIComponent(id)}/ack`, { method: 'POST' });
}

export async function markNotificationSeen(id: string): Promise<Notification> {
  return request<Notification>(`/api/notifications/${encodeURIComponent(id)}/seen`, { method: 'POST' });
}

export async function deleteNotification(id: string): Promise<void> {
  await request<void>(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
