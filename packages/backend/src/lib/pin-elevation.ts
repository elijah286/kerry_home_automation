import { redis } from '../state/redis.js';

/** Sliding window: refreshed on authenticated API activity (except GET /api/auth/me polling). */
export const PIN_ELEVATION_TTL_SEC = 30;

const PIN_RE = /^\d{4,6}$/;

export function isValidPinFormat(pin: string): boolean {
  return PIN_RE.test(pin.trim());
}

function key(sessionId: string): string {
  return `pin_elevate:${sessionId}`;
}

export async function startPinElevation(sessionId: string): Promise<void> {
  await redis.set(key(sessionId), '1', 'EX', PIN_ELEVATION_TTL_SEC);
}

/** Returns true if the session was elevated and TTL was reset. */
export async function touchPinElevationIfActive(sessionId: string): Promise<boolean> {
  const n = await redis.expire(key(sessionId), PIN_ELEVATION_TTL_SEC);
  return n === 1;
}

export async function getPinElevationTtlSeconds(sessionId: string): Promise<number> {
  const t = await redis.ttl(key(sessionId));
  if (t < 0) return 0;
  return t;
}

export async function clearPinElevation(sessionId: string): Promise<void> {
  await redis.del(key(sessionId));
}
