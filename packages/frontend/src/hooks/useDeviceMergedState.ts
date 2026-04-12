'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import type { DeviceState } from '@ha/shared';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

/**
 * Prefer whichever snapshot is newer (WebSocket vs REST GET /api/devices/:id).
 */
export function useDeviceMergedState(deviceId: string | undefined, liveDevice: DeviceState | undefined) {
  const [fetched, setFetched] = useState<DeviceState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/devices/${encodeURIComponent(deviceId)}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Not found' : `HTTP ${r.status}`);
        return r.json() as Promise<{ device: DeviceState }>;
      })
      .then((data) => setFetched(data.device))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    load();
  }, [deviceId, load]);

  const display = useMemo(() => {
    if (!liveDevice) return liveDevice;
    if (!fetched) return liveDevice;
    if (liveDevice.lastUpdated >= fetched.lastUpdated) return liveDevice;
    return fetched;
  }, [fetched, liveDevice]);

  return { display, loading, error, reload: load };
}
