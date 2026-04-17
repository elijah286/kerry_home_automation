// ---------------------------------------------------------------------------
// Device card API client.
//
//   - /api/devices/:id/card           → per-user CardDescriptor override
//   - /api/devices/:id/device-class   → admin-scoped device_class edit
//   - /api/devices/:id/infer-class    → single-device LLM inference (POST)
//   - /api/devices/infer-classes      → batch LLM inference (SSE progress)
//
// Thin wrapper over fetch to keep call sites readable — no state, no caching.
// ---------------------------------------------------------------------------

import type { CardDescriptor } from '@ha/shared';
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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// -- Override CRUD ---------------------------------------------------------

export function getDeviceCardOverride(deviceId: string): Promise<{ override: CardDescriptor | null }> {
  return request(`/api/devices/${encodeURIComponent(deviceId)}/card`);
}

export function setDeviceCardOverride(
  deviceId: string,
  descriptor: CardDescriptor,
): Promise<{ ok: boolean; override: CardDescriptor }> {
  return request(`/api/devices/${encodeURIComponent(deviceId)}/card`, {
    method: 'PUT',
    body: JSON.stringify(descriptor),
  });
}

export function clearDeviceCardOverride(deviceId: string): Promise<{ ok: boolean }> {
  return request(`/api/devices/${encodeURIComponent(deviceId)}/card`, {
    method: 'DELETE',
  });
}

// -- Device class ---------------------------------------------------------

export function setDeviceClass(
  deviceId: string,
  deviceClass: string | null,
  source: 'admin' | 'llm' = 'admin',
): Promise<{ ok: boolean; device_class: string | null; source: string | null }> {
  return request(`/api/devices/${encodeURIComponent(deviceId)}/device-class`, {
    method: 'PUT',
    body: JSON.stringify({ device_class: deviceClass, source }),
  });
}

// -- LLM inference --------------------------------------------------------

/**
 * Single-device inference. Returns the proposed class + a confidence hint.
 * Does NOT write to the device — caller decides whether to accept.
 */
export function inferDeviceClass(deviceId: string): Promise<{
  device_class: string;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}> {
  return request(`/api/devices/${encodeURIComponent(deviceId)}/infer-class`, {
    method: 'POST',
  });
}

export interface InferenceProgress {
  kind: 'progress' | 'done' | 'error';
  done?: number;
  total?: number;
  deviceId?: string;
  device_class?: string;
  error?: string;
}

/**
 * Batch inference with SSE progress. Returns an AsyncIterable the caller
 * pumps in a `for await` loop; UI renders each progress event as it arrives.
 *
 * Mode:
 *   - 'missing' — only devices with no device_class today (safe default)
 *   - 'all'     — every device, overwriting existing values (nuclear)
 */
export async function* inferDeviceClassesBulk(
  mode: 'missing' | 'all',
  signal?: AbortSignal,
): AsyncGenerator<InferenceProgress, void, void> {
  const base = getApiBase();
  const remote = typeof window !== 'undefined' && isRemoteAccess();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (remote) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('ha_remote_token') : null;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${base}/api/devices/infer-classes`, {
    method: 'POST',
    headers,
    credentials: remote ? 'omit' : 'include',
    body: JSON.stringify({ mode }),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Inference failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by blank lines; each event is `data: <json>\n`.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        try {
          yield JSON.parse(dataLine.slice(5).trim()) as InferenceProgress;
        } catch {
          // Malformed chunk — skip, continue stream.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
