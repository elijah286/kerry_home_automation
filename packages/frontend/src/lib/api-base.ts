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
