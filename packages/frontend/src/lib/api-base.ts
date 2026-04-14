import { Capacitor } from '@capacitor/core';

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
  return `http://${window.location.hostname}:3000`;
}

/** WebSocket origin matching {@link getApiBase} (same host/port as the API). */
export function getWsBase(): string {
  const b = getApiBase();
  if (b.startsWith('https://')) return `wss://${b.slice('https://'.length)}`;
  if (b.startsWith('http://')) return `ws://${b.slice('http://'.length)}`;
  return b;
}
