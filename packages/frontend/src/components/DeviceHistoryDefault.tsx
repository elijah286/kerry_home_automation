'use client';

// ---------------------------------------------------------------------------
// DeviceHistoryDefault — device-class-aware default history view.
//
// Shown inside the "History" collapsible on the device detail page. One view
// per device class:
//   - thermostat → multi-series graph (temperature + setpoints)
//   - light      → brightness over time
//   - cover      → position over time
//   - switch     → state timeline (on/off)
//   - vehicle    → map with trail, plus charge + speed signals
//   - (others)   → falls back to a plain state timeline of the primary field
//
// A shared time-window picker across the top feeds all renderers the same
// `from`/`to`. Windows: 15m, 30m, 1h, 2h, 3h, 6h, 12h, 24h, custom.
// ---------------------------------------------------------------------------

import dynamic from 'next/dynamic';
import { useMemo, useState, useEffect } from 'react';
import type { DeviceState, VehicleState } from '@ha/shared';
import { TimeSeriesGraph } from '@/components/viz/TimeSeriesGraph';
import { StateTimeline } from '@/components/viz/StateTimeline';
import { fetchDeviceHistoryRange } from '@/lib/api';
import type { HistoryPoint } from '@/lib/locations-map';
import { Loader2 } from 'lucide-react';

const LocationMap = dynamic(() => import('@/components/LocationMap'), { ssr: false });

// ---------------------------------------------------------------------------
// Time window presets
// ---------------------------------------------------------------------------

const WINDOW_PRESETS = [
  { label: '15m', ms: 15 * 60_000 },
  { label: '30m', ms: 30 * 60_000 },
  { label: '1h',  ms: 60 * 60_000 },
  { label: '2h',  ms: 2 * 60 * 60_000 },
  { label: '3h',  ms: 3 * 60 * 60_000 },
  { label: '6h',  ms: 6 * 60 * 60_000 },
  { label: '12h', ms: 12 * 60 * 60_000 },
  { label: '24h', ms: 24 * 60 * 60_000 },
] as const;

type WindowMode = { kind: 'preset'; ms: number } | { kind: 'custom'; from: Date; to: Date };

function TimeWindowPicker({ mode, onChange }: { mode: WindowMode; onChange: (m: WindowMode) => void }) {
  const [customOpen, setCustomOpen] = useState(mode.kind === 'custom');
  const [customFrom, setCustomFrom] = useState(() =>
    mode.kind === 'custom' ? mode.from : new Date(Date.now() - 60 * 60_000),
  );
  const [customTo, setCustomTo] = useState(() =>
    mode.kind === 'custom' ? mode.to : new Date(),
  );

  const toLocal = (d: Date) => {
    const tzOffset = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {WINDOW_PRESETS.map((preset) => {
          const active = mode.kind === 'preset' && mode.ms === preset.ms;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => { setCustomOpen(false); onChange({ kind: 'preset', ms: preset.ms }); }}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors border"
              style={{
                backgroundColor: active ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: active ? '#fff' : 'var(--color-text-secondary)',
                borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors border"
          style={{
            backgroundColor: mode.kind === 'custom' ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
            color: mode.kind === 'custom' ? '#fff' : 'var(--color-text-secondary)',
            borderColor: mode.kind === 'custom' ? 'var(--color-accent)' : 'var(--color-border)',
          }}
        >
          Custom
        </button>
      </div>

      {customOpen && (
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <label className="flex items-center gap-1">
            From
            <input
              type="datetime-local"
              value={toLocal(customFrom)}
              onChange={(e) => setCustomFrom(new Date(e.target.value))}
              className="rounded border px-2 py-1"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </label>
          <label className="flex items-center gap-1">
            To
            <input
              type="datetime-local"
              value={toLocal(customTo)}
              onChange={(e) => setCustomTo(new Date(e.target.value))}
              className="rounded border px-2 py-1"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => onChange({ kind: 'custom', from: customFrom, to: customTo })}
            className="rounded-md px-2.5 py-1 text-xs font-medium border transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vehicle map with trail (fetches lat/lng history in parallel)
// ---------------------------------------------------------------------------

function VehicleHistoryMap({ device, from, to }: { device: VehicleState; from: Date; to: Date }) {
  const [path, setPath] = useState<HistoryPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPath(null);
    setError(null);
    fetchDeviceHistoryRange(device.id, from, to)
      .then((res) => {
        if (cancelled) return;
        // Zip lat/lng from the single-device history stream — each row carries
        // the full state snapshot, so we just read both fields per sample.
        const points: HistoryPoint[] = [];
        for (const row of res.history ?? []) {
          const lat = (row.state as Record<string, unknown>).latitude;
          const lng = (row.state as Record<string, unknown>).longitude;
          if (typeof lat === 'number' && typeof lng === 'number') {
            points.push({ lat, lng, time: new Date(row.changedAt).getTime() });
          }
        }
        setPath(points);
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [device.id, from.getTime(), to.getTime()]);

  const lat = device.latitude;
  const lng = device.longitude;
  const hasLive = typeof lat === 'number' && typeof lng === 'number';

  return (
    <div className="space-y-3">
      <div
        className="relative overflow-hidden rounded-md"
        style={{ height: 320, border: '1px solid var(--color-border)' }}
      >
        {hasLive ? (
          <LocationMap
            devices={[{
              id: device.id,
              name: device.name,
              displayName: device.displayName,
              deviceType: device.type,
              latitude: lat!,
              longitude: lng!,
            }]}
            historyPaths={path ? { [device.id]: path } : {}}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No current location available.
          </div>
        )}
        {path === null && !error && (
          <div
            className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
            style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            <Loader2 className="h-3 w-3 animate-spin" /> Loading trail…
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Speed</div>
          <TimeSeriesGraph
            signals={[{ deviceId: device.id, field: 'speed', label: 'Speed', unit: 'mph' }]}
            from={from}
            to={to}
            height={140}
          />
        </div>
        <div className="space-y-1">
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Battery</div>
          <TimeSeriesGraph
            signals={[{ deviceId: device.id, field: 'batteryLevel', label: 'Charge', unit: '%' }]}
            from={from}
            to={to}
            height={140}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-class dispatch
// ---------------------------------------------------------------------------

interface DeviceHistoryDefaultProps {
  device: DeviceState;
}

export function DeviceHistoryDefault({ device }: DeviceHistoryDefaultProps) {
  const [mode, setMode] = useState<WindowMode>({ kind: 'preset', ms: 24 * 60 * 60_000 });

  const { from, to } = useMemo(() => {
    if (mode.kind === 'custom') return { from: mode.from, to: mode.to };
    return { from: new Date(Date.now() - mode.ms), to: new Date() };
  }, [mode]);

  const body = renderForDeviceClass(device, from, to);

  return (
    <div className="space-y-4">
      <TimeWindowPicker mode={mode} onChange={setMode} />
      <div>{body}</div>
    </div>
  );
}

function renderForDeviceClass(device: DeviceState, from: Date, to: Date) {
  switch (device.type) {
    case 'thermostat': {
      return (
        <TimeSeriesGraph
          signals={[
            { deviceId: device.id, field: 'temperature',  label: 'Temperature', unit: '°F' },
            { deviceId: device.id, field: 'heatSetpoint', label: 'Heat',        unit: '°F' },
            { deviceId: device.id, field: 'coolSetpoint', label: 'Cool',        unit: '°F' },
            { deviceId: device.id, field: 'humidity',     label: 'Humidity',    unit: '%' },
          ]}
          from={from}
          to={to}
          height={300}
        />
      );
    }
    case 'light': {
      return (
        <TimeSeriesGraph
          signals={[
            { deviceId: device.id, field: 'brightness', label: 'Brightness', unit: '%' },
          ]}
          from={from}
          to={to}
          height={240}
        />
      );
    }
    case 'cover':
    case 'garage_door': {
      return (
        <TimeSeriesGraph
          signals={[
            { deviceId: device.id, field: 'position', label: 'Position', unit: '%' },
          ]}
          from={from}
          to={to}
          height={240}
        />
      );
    }
    case 'switch':
    case 'fan': {
      return (
        <StateTimeline
          items={[{ deviceId: device.id, field: 'on', label: device.displayName ?? device.name }]}
          from={from}
          to={to}
          height={80}
        />
      );
    }
    case 'vehicle': {
      return <VehicleHistoryMap device={device as VehicleState} from={from} to={to} />;
    }
    case 'sensor':
    case 'helper_sensor':
    case 'helper_number':
    case 'helper_counter': {
      return (
        <TimeSeriesGraph
          signals={[{ deviceId: device.id, field: 'value', label: device.displayName ?? device.name }]}
          from={from}
          to={to}
          height={240}
        />
      );
    }
    case 'weather': {
      return (
        <TimeSeriesGraph
          signals={[
            { deviceId: device.id, field: 'temperature', label: 'Temperature', unit: '°F' },
            { deviceId: device.id, field: 'humidity',    label: 'Humidity',    unit: '%' },
          ]}
          from={from}
          to={to}
          height={280}
        />
      );
    }
    default: {
      // Fallback — show boolean-ish `on` timeline if present, otherwise a
      // generic message. Picking a field here would require schema reflection
      // we don't want to add inline; users can drill into Live state for
      // per-field graphs.
      return (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          No default history view for this device class yet. Expand “Details”
          and click a field to see its history.
        </p>
      );
    }
  }
}
