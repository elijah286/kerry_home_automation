'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useWebSocket } from '@/hooks/useWebSocket';
import { fetchDeviceHistory } from '@/lib/api';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import type { DeviceState, VehicleState } from '@ha/shared';

const LocationMap = dynamic(() => import('@/components/LocationMap'), { ssr: false });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocatableDevice {
  id: string;
  name: string;
  displayName?: string;
  latitude: number;
  longitude: number;
}

export interface HistoryPoint {
  lat: number;
  lng: number;
  time: number;
}

const TIME_WINDOWS = [
  { label: '1h', ms: 1 * 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '48h', ms: 48 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
];

function isLocatable(d: DeviceState): d is VehicleState & { latitude: number; longitude: number } {
  return d.type === 'vehicle' && (d as VehicleState).latitude != null && (d as VehicleState).longitude != null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LocationsPage() {
  const { devices } = useWebSocket();

  // Devices that report location
  const locatableDevices = useMemo<LocatableDevice[]>(
    () =>
      devices.filter(isLocatable).map((d) => ({
        id: d.id,
        name: d.name,
        displayName: d.displayName,
        latitude: d.latitude,
        longitude: d.longitude,
      })),
    [devices],
  );

  // Visibility toggles — default all on
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      for (const d of locatableDevices) {
        if (!prev.has(d.id) && prev.size === 0) next.add(d.id);
        else if (!prev.has(d.id) && !everSeen.has(d.id)) next.add(d.id);
      }
      return next;
    });
    for (const d of locatableDevices) everSeen.add(d.id);
  }, [locatableDevices]);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [timeWindowIdx, setTimeWindowIdx] = useState(0); // index into TIME_WINDOWS
  const [historyPaths, setHistoryPaths] = useState<Record<string, HistoryPoint[]>>({});

  const toggleDevice = useCallback((id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Fetch history when toggled on or time window changes
  useEffect(() => {
    if (!showHistory) {
      setHistoryPaths({});
      return;
    }

    const cutoff = Date.now() - TIME_WINDOWS[timeWindowIdx].ms;
    let cancelled = false;

    async function load() {
      const results: Record<string, HistoryPoint[]> = {};
      const visible = locatableDevices.filter((d) => visibleIds.has(d.id));
      await Promise.all(
        visible.map(async (d) => {
          try {
            const { history } = await fetchDeviceHistory(d.id, 1000);
            results[d.id] = history
              .filter((h) => {
                const t = new Date(h.changedAt).getTime();
                return t >= cutoff && h.state.latitude != null && h.state.longitude != null;
              })
              .map((h) => ({
                lat: h.state.latitude as number,
                lng: h.state.longitude as number,
                time: new Date(h.changedAt).getTime(),
              }))
              .reverse(); // oldest first for polyline
          } catch {
            results[d.id] = [];
          }
        }),
      );
      if (!cancelled) setHistoryPaths(results);
    }

    load();
    return () => { cancelled = true; };
  }, [showHistory, timeWindowIdx, locatableDevices, visibleIds]);

  const visibleDevices = useMemo(
    () => locatableDevices.filter((d) => visibleIds.has(d.id)),
    [locatableDevices, visibleIds],
  );

  return (
    <div className="w-full flex" style={{ height: '100vh' }}>
      {/* ---- Left sidebar: device list ---- */}
      <div
        className="flex flex-col border-r transition-all duration-200 overflow-hidden shrink-0"
        style={{
          width: sidebarOpen ? 220 : 0,
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-card-bg)',
        }}
      >
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
          Devices
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {locatableDevices.length === 0 && (
            <p className="text-xs px-2 py-4" style={{ color: 'var(--color-text-secondary)' }}>
              No devices reporting location
            </p>
          )}
          {locatableDevices.map((d) => (
            <label
              key={d.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer text-sm hover:opacity-80"
              style={{ color: 'var(--color-text)' }}
            >
              <input
                type="checkbox"
                checked={visibleIds.has(d.id)}
                onChange={() => toggleDevice(d.id)}
                className="accent-[var(--color-accent)] h-3.5 w-3.5"
              />
              <span className="truncate">{d.displayName || d.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ---- Sidebar toggle tab ---- */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className="shrink-0 flex items-center justify-center border-r"
        style={{
          width: 20,
          backgroundColor: 'var(--color-card-bg)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-secondary)',
        }}
      >
        {sidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {/* ---- Map + bottom bar ---- */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <div className="flex-1 relative">
          <LocationMap
            devices={visibleDevices}
            historyPaths={showHistory ? historyPaths : {}}
          />
        </div>

        {/* ---- Bottom bar ---- */}
        <div
          className="flex items-center gap-4 px-4 py-2 border-t shrink-0"
          style={{
            backgroundColor: 'var(--color-card-bg)',
            borderColor: 'var(--color-border)',
          }}
        >
          <label
            className="flex items-center gap-2 cursor-pointer text-sm"
            style={{ color: 'var(--color-text)' }}
          >
            <History className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
              className="accent-[var(--color-accent)] h-3.5 w-3.5"
            />
            Show History
          </label>

          {showHistory && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Window:</span>
              <input
                type="range"
                min={0}
                max={TIME_WINDOWS.length - 1}
                value={timeWindowIdx}
                onChange={(e) => setTimeWindowIdx(Number(e.target.value))}
                className="w-32 accent-[var(--color-accent)]"
              />
              <span className="text-xs font-mono min-w-[2.5rem]" style={{ color: 'var(--color-text)' }}>
                {TIME_WINDOWS[timeWindowIdx].label}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Track which device IDs we've seen to avoid re-adding after user unchecks
const everSeen = new Set<string>();
