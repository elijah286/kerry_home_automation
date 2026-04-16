import { Capacitor } from '@capacitor/core';

/** True when the page is served through the cloud proxy (HTTPS on a non-local domain). */
export function isRemoteAccess(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'https:';
}

/** Backend origin for browser fetches (must match cookie scope for auth). */
export function getApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }
  if (Capacitor.isNativePlatform()) {
    // Capacitor WebView has no meaningful LAN hostname; set NEXT_PUBLIC_API_URL for real devices.
    return 'http://localhost:3000';
  }
  // When accessed via HTTPS (cloud proxy), use the same origin — the proxy
  // forwards /api/* through the tunnel to the home backend.
  if (isRemoteAccess()) {
    return window.location.origin;
  }
  return `http://${window.location.hostname}:3000`;
}

/** WebSocket origin matching {@link getApiBase} (same host/port as the API). */
export function getWsBase(): string {
  const b = getApiBase();
  if (b.startsWith('https://')) return `wss://${b.slice('https://'.length)}`;
  if (b.startsWith('http://')) return `ws://${b.slice('http://'.length)}`;
  return b;
}

// -- Remote auth helpers for components that make direct fetch calls ----------

/**
 * Returns a query-string token param for URLs that can't send headers
 * (e.g. `<img src>`, `new WebSocket()`). Empty string in local mode.
 *
 * Usage: ``src={`${url}/snapshot${authQueryParam()}`}``
 */
export function authQueryParam(existingQuery = false): string {
  if (!isRemoteAccess()) return '';
  const token = typeof window !== 'undefined' ? localStorage.getItem('ha_remote_token') : null;
  if (!token) return '';
  return `${existingQuery ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

/** Returns auth headers for the current mode (Bearer token for remote, empty for local). */
export function authHeaders(): Record<string, string> {
  if (!isRemoteAccess()) return {};
  const token = typeof window !== 'undefined' ? localStorage.getItem('ha_remote_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Returns the right credentials setting for fetch (include for local, omit for remote). */
export function authCredentials(): RequestCredentials {
  return isRemoteAccess() ? 'omit' : 'include';
}

/**
 * Drop-in replacement for `fetch()` that automatically handles auth.
 * - Local mode: sends `credentials: 'include'` (cookie-based JWT)
 * - Remote mode: sends `Authorization: Bearer <token>` header
 *
 * Also auto-redirects to /login on 401 (session expired).
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const remote = isRemoteAccess();
  const merged: RequestInit = { ...init };

  if (remote) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('ha_remote_token') : null;
    if (token) {
      const existing = (merged.headers ?? {}) as Record<string, string>;
      merged.headers = { ...existing, Authorization: `Bearer ${token}` };
    }
  } else {
    merged.credentials = 'include';
  }

  const res = await fetch(input, merged);

  if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    if (remote) {
      localStorage.removeItem('ha_remote_token');
      localStorage.removeItem('ha_remote_refresh');
    }
    window.location.href = '/login';
  }

  return res;
}
