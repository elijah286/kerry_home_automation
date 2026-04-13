'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useLCARSFrame } from '@/components/lcars/LCARSFrameContext';
import { useLocationsMap } from '@/providers/LocationsMapContext';
import { fetchDeviceHistory } from '@/lib/api';
import { History } from 'lucide-react';
import type { HistoryPoint } from '@/lib/locations-map';

const LocationMap = dynamic(() => import('@/components/LocationMap'), { ssr: false });

export type { LocatableDevice, HistoryPoint } from '@/lib/locations-map';

const TIME_WINDOWS = [
  { label: '1h', ms: 1 * 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '48h', ms: 48 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
];

export default function LocationsPage() {
  const lcarsFrame = useLCARSFrame();
  const { visibleLocatableDevices } = useLocationsMap();

  const [showHistory, setShowHistory] = useState(false);
  const [timeWindowIdx, setTimeWindowIdx] = useState(0);
  const [historyPaths, setHistoryPaths] = useState<Record<string, HistoryPoint[]>>({});

  useEffect(() => {
    if (!showHistory) {
      setHistoryPaths({});
      return;
    }

    const cutoff = Date.now() - TIME_WINDOWS[timeWindowIdx].ms;
    let cancelled = false;

    async function load() {
      const results: Record<string, HistoryPoint[]> = {};
      await Promise.all(
        visibleLocatableDevices.map(async (d) => {
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
              .reverse();
          } catch {
            results[d.id] = [];
          }
        }),
      );
      if (!cancelled) setHistoryPaths(results);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [showHistory, timeWindowIdx, visibleLocatableDevices]);

  /**
   * LCARS: `main.lcars-content` is `position:fixed` with overflow — fill that box with
   * `absolute inset-0`, not `100vh`, or the map is taller than the visible pane and Leaflet tiles break.
   * Non-LCARS: approximate viewport under the default app header.
   */
  return (
    <div
      className={
        lcarsFrame
          ? 'absolute inset-0 z-[1] flex min-h-0 w-full flex-col overflow-hidden'
          : 'flex min-h-0 w-full flex-col'
      }
      style={
        lcarsFrame
          ? undefined
          : { height: 'calc(100dvh - 3rem)', minHeight: 0 }
      }
    >
      <div className="relative min-h-0 flex-1">
        <LocationMap
          devices={visibleLocatableDevices}
          historyPaths={showHistory ? historyPaths : {}}
        />
      </div>

      <div
        className="flex shrink-0 items-center gap-4 border-t px-4 py-2"
        style={{
          backgroundColor: 'var(--color-card-bg)',
          borderColor: 'var(--color-border)',
        }}
      >
        <label
          className="flex cursor-pointer items-center gap-2 text-sm"
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
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Window:
            </span>
            <input
              type="range"
              min={0}
              max={TIME_WINDOWS.length - 1}
              value={timeWindowIdx}
              onChange={(e) => setTimeWindowIdx(Number(e.target.value))}
              className="w-32 accent-[var(--color-accent)]"
            />
            <span className="min-w-[2.5rem] font-mono text-xs" style={{ color: 'var(--color-text)' }}>
              {TIME_WINDOWS[timeWindowIdx].label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
