'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useWebSocket } from '@/hooks/useWebSocket';
import { fetchDeviceHistory } from '@/lib/api';
import { ChevronLeft, ChevronRight, History, MapPinned } from 'lucide-react';
import type { DeviceState } from '@ha/shared';

const LocationMap = dynamic(() => import('@/components/LocationMap'), { ssr: false });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocatableDevice {
  id: string;
  name: string;
  displayName?: string;
  /** Device discriminant — any type that exposes coordinates */
  deviceType: DeviceState['type'];
  latitude: number;
  longitude: number;
}

export interface HistoryPoint {
  lat: number;
  lng: number;
  time: number;
}

const LS_HIDDEN_IDS = 'ha-locations-map-hidden-ids';
const LS_PANEL_OPEN = 'ha-locations-map-devices-panel-open';

const TIME_WINDOWS = [
  { label: '1h', ms: 1 * 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '48h', ms: 48 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
];

/** Any integration that puts numeric latitude/longitude on state (vehicles, future phone trackers, etc.). */
function getDeviceLatLng(d: DeviceState): { lat: number; lng: number } | null {
  const o = d as unknown as Record<string, unknown>;
  const lat = o.latitude;
  const lng = o.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function isLocatable(d: DeviceState): boolean {
  return getDeviceLatLng(d) != null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LocationsPage() {
  const { devices } = useWebSocket();

  // Devices that report location
  const locatableDevices = useMemo<LocatableDevice[]>(() => {
    const out: LocatableDevice[] = [];
    for (const d of devices) {
      const pos = getDeviceLatLng(d);
      if (!pos) continue;
      out.push({
        id: d.id,
        name: d.name,
        displayName: d.displayName,
        deviceType: d.type,
        latitude: pos.lat,
        longitude: pos.lng,
      });
    }
    return out;
  }, [devices]);

  /** Device IDs hidden from the map (persisted). New locators default to visible. */
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [devicesPanelOpen, setDevicesPanelOpen] = useState(true);
  const [prefsHydrated, setPrefsHydrated] = useState(false);

  useEffect(() => {
    try {
      const rawHidden = localStorage.getItem(LS_HIDDEN_IDS);
      if (rawHidden) setHiddenIds(new Set(JSON.parse(rawHidden) as string[]));
      const rawOpen = localStorage.getItem(LS_PANEL_OPEN);
      if (rawOpen != null) setDevicesPanelOpen(rawOpen === '1');
    } catch {
      /* ignore */
    }
    setPrefsHydrated(true);
  }, []);

  useEffect(() => {
    if (!prefsHydrated) return;
    try {
      localStorage.setItem(LS_HIDDEN_IDS, JSON.stringify([...hiddenIds]));
    } catch {
      /* ignore */
    }
  }, [hiddenIds, prefsHydrated]);

  const currentLocatableIds = useMemo(
    () => new Set(locatableDevices.map((d) => d.id)),
    [locatableDevices],
  );

  useEffect(() => {
    setHiddenIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (currentLocatableIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [currentLocatableIds]);

  useEffect(() => {
    if (!prefsHydrated) return;
    try {
      localStorage.setItem(LS_PANEL_OPEN, devicesPanelOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [devicesPanelOpen, prefsHydrated]);

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [timeWindowIdx, setTimeWindowIdx] = useState(0); // index into TIME_WINDOWS
  const [historyPaths, setHistoryPaths] = useState<Record<string, HistoryPoint[]>>({});

  const toggleDeviceOnMap = useCallback((id: string) => {
    setHiddenIds((prev) => {
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
      const visible = locatableDevices.filter((d) => !hiddenIds.has(d.id));
      await Promise.all(
        visible.map(async (d) => {
          try {
            const { history } = await fetchDeviceHistory(d.id, 1000);
            results[d.id] = history
              .filter((h) => {
                const t = new Date(h.changedAt).getTime();
                const st = h.state as Record<string, unknown>;
                const lat = st.latitude;
                const lng = st.longitude;
                return t >= cutoff && typeof lat === 'number' && typeof lng === 'number';
              })
              .map((h) => {
                const st = h.state as Record<string, unknown>;
                return {
                  lat: st.latitude as number,
                  lng: st.longitude as number,
                  time: new Date(h.changedAt).getTime(),
                };
              })
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
  }, [showHistory, timeWindowIdx, locatableDevices, hiddenIds]);

  const visibleDevices = useMemo(
    () => locatableDevices.filter((d) => !hiddenIds.has(d.id)),
    [locatableDevices, hiddenIds],
  );

  return (
    <div className="w-full flex" style={{ height: '100vh' }}>
      {/* ---- Map + bottom bar ---- */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <div className="flex-1 relative">
          <LocationMap
            devices={visibleDevices}
            historyPaths={showHistory ? historyPaths : {}}
          />
          {!devicesPanelOpen && (
            <button
              type="button"
              onClick={() => setDevicesPanelOpen(true)}
              className="absolute top-3 right-3 z-[1000] flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-md"
              style={{
                backgroundColor: 'var(--color-card-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
              aria-label="Open map devices panel"
            >
              <MapPinned className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
              Map devices
            </button>
          )}
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

      {/* ---- Right panel: toggle tab ---- */}
      <button
        type="button"
        onClick={() => setDevicesPanelOpen((v) => !v)}
        className="shrink-0 flex items-center justify-center border-l"
        style={{
          width: 20,
          backgroundColor: 'var(--color-card-bg)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-secondary)',
        }}
        aria-label={devicesPanelOpen ? 'Collapse map devices panel' : 'Expand map devices panel'}
      >
        {devicesPanelOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* ---- Right sidebar: devices on map ---- */}
      <div
        className="flex flex-col border-l transition-all duration-200 overflow-hidden shrink-0"
        style={{
          width: devicesPanelOpen ? 240 : 0,
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-card-bg)',
        }}
      >
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
          Map devices
        </div>
        <p className="px-3 pb-2 text-[11px] leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
          Choose which locators appear on the map. Your choices are saved in this browser.
        </p>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
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
                checked={!hiddenIds.has(d.id)}
                onChange={() => toggleDeviceOnMap(d.id)}
                className="accent-[var(--color-accent)] h-3.5 w-3.5"
              />
              <span className="truncate">
                {d.displayName || d.name}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
