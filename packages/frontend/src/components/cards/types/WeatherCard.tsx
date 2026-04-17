'use client';

// ---------------------------------------------------------------------------
// WeatherCard — multi-pane weather tile.
//
// Each pane is its own subcomponent so themes (LCARS, etc.) can restyle one
// without touching the others. The top-level card dispatches to the pane list
// from the descriptor and lays them out vertically.
//
// Radar pane uses RainViewer's free tile layer; we just embed their provided
// iframe URL so no Leaflet dep is required for the card to render. A future
// pass can swap to our own Leaflet instance if we want pin overlays.
// ---------------------------------------------------------------------------

import type {
  WeatherCard as WeatherCardDescriptor,
  WeatherState,
  WeatherForecastDay,
  WeatherForecastHour,
  WeatherAlert,
} from '@ha/shared';
import { AlertTriangle, Droplets, Wind } from 'lucide-react';
import { useDevice } from '@/hooks/useDevice';
import { token, severityVar } from '@/lib/tokens';
import { IconGlyph } from '@/lib/icons/IconGlyph';
import { weatherIconFor } from '@/lib/icons/weather';
import { withEntityBoundary } from '../EntityBoundary';

const SEVERITY_ORDER: Record<string, number> = {
  Minor: 1, Moderate: 2, Severe: 3, Extreme: 4, Unknown: 0,
};

export function WeatherCard({ card }: { card: WeatherCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(
    card.entity,
    device,
    (d) => {
      if (d.type !== 'weather') return <div />;
      return <WeatherBody card={card} device={d as WeatherState} />;
    },
    { title: card.name },
  );
}

function WeatherBody({ card, device }: { card: WeatherCardDescriptor; device: WeatherState }) {
  const label = card.name ?? device.displayName ?? device.name;
  const panes = card.panes && card.panes.length > 0 ? card.panes : ['current', 'hourly', 'daily'];
  const minSev = SEVERITY_ORDER[card.minAlertSeverity] ?? 1;
  const visibleAlerts = device.alerts.filter((a) => (SEVERITY_ORDER[a.severity] ?? 0) >= minSev);

  return (
    <div
      className="flex flex-col gap-3 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="weather"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        {device.forecastUpdatedAt && (
          <span className="text-[10px]" style={{ color: token('--color-text-muted') }}>
            {timeAgo(device.forecastUpdatedAt)}
          </span>
        )}
      </div>

      {panes.map((pane) => {
        switch (pane) {
          case 'current':
            return <CurrentPane key="current" device={device} size={card.size} />;
          case 'hourly':
            return <HourlyPane key="hourly" hours={device.hourly} max={card.hoursToShow} />;
          case 'daily':
            return <DailyPane key="daily" days={device.forecast} max={card.daysToShow} />;
          case 'alerts':
            return <AlertsPane key="alerts" alerts={visibleAlerts} />;
          case 'radar':
            return card.radarProvider === 'none'
              ? null
              : <RadarPane key="radar" device={device} zoom={card.radarZoom} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

// --- Current ---------------------------------------------------------------

function CurrentPane({ device, size }: { device: WeatherState; size: 'compact' | 'default' | 'hero' }) {
  const tempClass = size === 'hero' ? 'text-5xl' : size === 'compact' ? 'text-2xl' : 'text-4xl';
  const iconPx = size === 'hero' ? 72 : size === 'compact' ? 40 : 56;
  // Infer day/night from the first upcoming period so the sun / moon glyph
  // pair swaps cleanly at dusk.
  const isDaytime = device.hourly[0]?.isDaytime ?? device.forecast[0]?.isDaytime ?? true;
  const glyph = weatherIconFor(device.condition, isDaytime);
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex items-center justify-center rounded-md"
        style={{
          width: iconPx + 16,
          height: iconPx + 16,
          background: token('--color-bg-hover'),
          color: token('--color-text'),
        }}
      >
        <IconGlyph name={glyph} size={iconPx} aria-label={device.condition} />
      </div>
      <div className="flex flex-col">
        <div className={`${tempClass} font-semibold leading-none tabular-nums`}>
          {device.temperature != null ? `${Math.round(device.temperature)}°` : '—'}
          <span className="ml-1 text-base font-normal" style={{ color: token('--color-text-muted') }}>
            {device.temperatureUnit}
          </span>
        </div>
        <div className="mt-1 text-sm" style={{ color: token('--color-text-secondary') }}>
          {device.condition}
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-xs" style={{ color: token('--color-text-muted') }}>
          {device.humidity != null && (
            <span className="inline-flex items-center gap-1">
              <Droplets className="h-3 w-3" />
              {device.humidity}%
            </span>
          )}
          {device.windSpeed && (
            <span className="inline-flex items-center gap-1">
              <Wind className="h-3 w-3" />
              {device.windSpeed} {device.windDirection ?? ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Hourly ----------------------------------------------------------------

function HourlyPane({ hours, max }: { hours: WeatherForecastHour[]; max: number }) {
  if (!hours || hours.length === 0) {
    return (
      <div className="text-xs" style={{ color: token('--color-text-muted') }}>
        Hourly forecast unavailable
      </div>
    );
  }
  const slice = hours.slice(0, max);
  return (
    <div
      className="flex gap-2 overflow-x-auto rounded-md p-2"
      style={{ background: token('--color-bg-hover') }}
      role="list"
      aria-label="Hourly forecast"
    >
      {slice.map((h) => (
        <div key={h.startTime} role="listitem" className="flex min-w-[56px] flex-col items-center gap-0.5">
          <span className="text-[10px]" style={{ color: token('--color-text-muted') }}>
            {formatHour(h.startTime)}
          </span>
          <IconGlyph
            name={weatherIconFor(h.shortForecast, h.isDaytime)}
            size={24}
            style={{ color: token('--color-text-secondary') }}
          />
          <span className="text-xs font-medium tabular-nums">
            {h.temperature != null ? `${Math.round(h.temperature)}°` : '—'}
          </span>
          {h.probabilityOfPrecipitation != null && h.probabilityOfPrecipitation > 0 && (
            <span className="text-[10px] tabular-nums" style={{ color: severityVar('info') }}>
              {Math.round(h.probabilityOfPrecipitation)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Daily -----------------------------------------------------------------

function DailyPane({ days, max }: { days: WeatherForecastDay[]; max: number }) {
  if (!days || days.length === 0) return null;
  // NWS returns 2 periods per day (day + night). Pair them.
  const pairs: Array<{ key: string; day?: WeatherForecastDay; night?: WeatherForecastDay }> = [];
  for (const p of days) {
    const key = p.startTime?.slice(0, 10) ?? p.name;
    const existing = pairs.find((x) => x.key === key);
    const slot = existing ?? { key };
    if (p.isDaytime) slot.day = p;
    else slot.night = p;
    if (!existing) pairs.push(slot);
  }
  const slice = pairs.slice(0, max);

  return (
    <div className="flex flex-col gap-1" role="list" aria-label="Daily forecast">
      {slice.map((pair) => {
        const primary = pair.day ?? pair.night;
        if (!primary) return null;
        const hi = pair.day?.temperature;
        const lo = pair.night?.temperature;
        return (
          <div
            key={pair.key}
            role="listitem"
            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
            style={{ background: token('--color-bg-hover') }}
          >
            <span className="w-16 font-medium">{pair.day?.name ?? pair.night?.name}</span>
            <IconGlyph
              name={weatherIconFor(primary.shortForecast, primary.isDaytime)}
              size={20}
              style={{ color: token('--color-text-secondary') }}
            />
            <span className="flex-1 truncate" style={{ color: token('--color-text-secondary') }}>
              {primary.shortForecast}
            </span>
            <span className="tabular-nums" style={{ color: token('--color-text-muted') }}>
              {lo != null ? `${Math.round(lo)}°` : '—'} / <span style={{ color: token('--color-text') }}>{hi != null ? `${Math.round(hi)}°` : '—'}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Alerts ----------------------------------------------------------------

function AlertsPane({ alerts }: { alerts: WeatherAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {alerts.map((a) => {
        const sev = SEVERITY_ORDER[a.severity] ?? 0;
        const color = sev >= 4 ? severityVar('critical')
          : sev >= 3 ? severityVar('warning')
          : sev >= 2 ? severityVar('info')
          : token('--color-text-muted');
        return (
          <div
            key={a.id}
            role="alert"
            className="flex items-start gap-2 rounded-md p-2 text-xs"
            style={{ background: token('--color-bg-hover'), border: `1px solid ${color}` }}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
            <div className="flex flex-col gap-0.5">
              <span className="font-medium" style={{ color }}>{a.event}</span>
              <span style={{ color: token('--color-text-secondary') }}>{a.headline}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Radar -----------------------------------------------------------------

function RadarPane({ device, zoom }: { device: WeatherState; zoom: number }) {
  if (device.latitude == null || device.longitude == null) {
    return (
      <div className="text-xs" style={{ color: token('--color-text-muted') }}>
        Radar unavailable (no location)
      </div>
    );
  }
  // RainViewer's embed renderer. It maintains its own tile cache and animates
  // the most recent ~2 hours of precipitation. Free, no API key.
  const src = `https://www.rainviewer.com/map.html?loc=${device.latitude},${device.longitude},${zoom}&oCS=1&oAP=1&c=3&o=83&lm=1&layer=radar&sm=1&sn=1`;
  return (
    <div
      className="overflow-hidden rounded-md"
      style={{ aspectRatio: '16 / 10', background: token('--color-bg-hover') }}
    >
      <iframe
        src={src}
        title="Precipitation radar"
        loading="lazy"
        style={{ width: '100%', height: '100%', border: 0 }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}

// --- helpers ---------------------------------------------------------------

function formatHour(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16);
  const h = d.getHours();
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}
