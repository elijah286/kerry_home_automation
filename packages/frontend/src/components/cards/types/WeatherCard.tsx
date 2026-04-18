'use client';

// ---------------------------------------------------------------------------
// WeatherCard — multi-pane weather tile with compact/normal/expanded modes.
//
// Mode controls layout density (font/icon sizes, whether the current-pane stat
// grid collapses into a strip or shows as a 2x3 tile). Individual detail
// toggles on the descriptor (showHumidity, showWind, showPrecipitation, …)
// control content independently — so a user can have an expanded layout with
// just temperature and nothing else, or a compact layout crammed with stats.
// Each pane is its own subcomponent so themes (LCARS, etc.) can restyle one
// without touching the others.
// ---------------------------------------------------------------------------

import type {
  WeatherCard as WeatherCardDescriptor,
  WeatherState,
  WeatherForecastDay,
  WeatherForecastHour,
  WeatherAlert,
} from '@ha/shared';
import { AlertTriangle, Droplets, Wind, CloudRain, Thermometer } from 'lucide-react';
import { useDevice } from '@/hooks/useDevice';
import { token, severityVar } from '@/lib/tokens';
import { IconGlyph } from '@/lib/icons/IconGlyph';
import { weatherIconFor } from '@/lib/icons/weather';
import { withEntityBoundary } from '../EntityBoundary';

type Mode = 'compact' | 'normal' | 'expanded';

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
  const mode: Mode = card.mode;
  const minSev = SEVERITY_ORDER[card.minAlertSeverity] ?? 1;
  const visibleAlerts = device.alerts.filter((a) => (SEVERITY_ORDER[a.severity] ?? 0) >= minSev);
  const panes = card.panes && card.panes.length > 0 ? card.panes : ['current'];

  const gap = mode === 'compact' ? 'gap-2' : mode === 'expanded' ? 'gap-4' : 'gap-3';
  const padding = mode === 'compact' ? 'p-2.5' : mode === 'expanded' ? 'p-4' : 'p-3';

  return (
    <div
      className={`flex flex-col ${gap} rounded-lg ${padding}`}
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="weather"
      data-weather-mode={mode}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {card.showAlertBadge && visibleAlerts.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                color: severityVar(alertTone(visibleAlerts)),
                background: token('--color-bg-hover'),
                border: `1px solid ${severityVar(alertTone(visibleAlerts))}`,
              }}
              title={`${visibleAlerts.length} active alert${visibleAlerts.length === 1 ? '' : 's'}`}
            >
              <AlertTriangle className="h-3 w-3" />
              {visibleAlerts.length}
            </span>
          )}
          {device.forecastUpdatedAt && (
            <span className="text-[10px]" style={{ color: token('--color-text-muted') }}>
              {timeAgo(device.forecastUpdatedAt)}
            </span>
          )}
        </div>
      </div>

      {panes.map((pane) => {
        switch (pane) {
          case 'current':
            return <CurrentPane key="current" device={device} card={card} />;
          case 'hourly':
            return <HourlyPane key="hourly" hours={device.hourly} card={card} />;
          case 'daily':
            return <DailyPane key="daily" days={device.forecast} card={card} />;
          case 'alerts':
            return <AlertsPane key="alerts" alerts={visibleAlerts} mode={mode} />;
          case 'radar':
            return card.radarProvider === 'none'
              ? null
              : <RadarPane key="radar" device={device} zoom={card.radarZoom} mode={mode} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

// --- Current ---------------------------------------------------------------

function CurrentPane({ device, card }: { device: WeatherState; card: WeatherCardDescriptor }) {
  const mode = card.mode;
  const isDaytime = device.hourly[0]?.isDaytime ?? device.forecast[0]?.isDaytime ?? true;
  const glyph = weatherIconFor(device.condition, isDaytime);

  const tempClass = mode === 'expanded' ? 'text-6xl' : mode === 'compact' ? 'text-2xl' : 'text-4xl';
  const iconPx = mode === 'expanded' ? 96 : mode === 'compact' ? 36 : 56;

  // Build the list of stat chips based on toggles + available data.
  const stats = collectStats(device, card);

  // Compact: single row. Normal: headline + inline stats. Expanded: hero + grid.
  if (mode === 'compact') {
    return (
      <div className="flex items-center gap-3">
        <IconGlyph name={glyph} size={iconPx} aria-label={device.condition} />
        <div className="flex flex-1 flex-col">
          <div className="flex items-baseline gap-2">
            <span className={`${tempClass} font-semibold leading-none tabular-nums`}>
              {device.temperature != null ? `${Math.round(device.temperature)}°` : '—'}
            </span>
            <span className="truncate text-xs" style={{ color: token('--color-text-secondary') }}>
              {device.condition}
            </span>
          </div>
          {stats.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2 text-[10px]" style={{ color: token('--color-text-muted') }}>
              {stats.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1">
                  {s.icon}
                  {s.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'expanded') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              width: iconPx + 24,
              height: iconPx + 24,
              background: token('--color-bg-hover'),
              color: token('--color-text'),
            }}
          >
            <IconGlyph name={glyph} size={iconPx} aria-label={device.condition} />
          </div>
          <div className="flex flex-1 flex-col">
            <div className={`${tempClass} font-semibold leading-none tabular-nums`}>
              {device.temperature != null ? `${Math.round(device.temperature)}°` : '—'}
              <span className="ml-2 text-xl font-normal" style={{ color: token('--color-text-muted') }}>
                {device.temperatureUnit}
              </span>
            </div>
            <div className="mt-2 text-base" style={{ color: token('--color-text-secondary') }}>
              {device.condition}
            </div>
          </div>
        </div>
        {stats.length > 0 && (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 3)}, minmax(0, 1fr))` }}
          >
            {stats.map((s) => (
              <div
                key={s.key}
                className="flex flex-col gap-0.5 rounded-md p-2 text-xs"
                style={{ background: token('--color-bg-hover') }}
              >
                <span className="inline-flex items-center gap-1" style={{ color: token('--color-text-muted') }}>
                  {s.icon}
                  <span className="uppercase tracking-wide text-[9px]">{s.label}</span>
                </span>
                <span className="text-sm font-medium tabular-nums" style={{ color: token('--color-text') }}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // normal
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
        {stats.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-3 text-xs" style={{ color: token('--color-text-muted') }}>
            {stats.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1">
                {s.icon}
                {s.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Stat = { key: string; label: string; value: string; icon: React.ReactNode };

function collectStats(device: WeatherState, card: WeatherCardDescriptor): Stat[] {
  const out: Stat[] = [];
  if (card.showHumidity && device.humidity != null) {
    out.push({
      key: 'humidity',
      label: 'Humidity',
      value: `${device.humidity}%`,
      icon: <Droplets className="h-3 w-3" />,
    });
  }
  if (card.showWind && device.windSpeed) {
    out.push({
      key: 'wind',
      label: 'Wind',
      value: `${device.windSpeed}${device.windDirection ? ` ${device.windDirection}` : ''}`,
      icon: <Wind className="h-3 w-3" />,
    });
  }
  if (card.showFeelsLike) {
    const feels = feelsLike(device);
    if (feels != null) {
      out.push({
        key: 'feelslike',
        label: 'Feels like',
        value: `${Math.round(feels)}°`,
        icon: <Thermometer className="h-3 w-3" />,
      });
    }
  }
  if (card.showDewpoint) {
    const dp = device.hourly[0]?.dewpoint;
    if (dp != null) {
      // Backend stores hourly dewpoint in Celsius per NWS; convert when the
      // displayed temperature unit is Fahrenheit.
      const shown = device.temperatureUnit === '°F' ? (dp * 9) / 5 + 32 : dp;
      out.push({
        key: 'dewpoint',
        label: 'Dew point',
        value: `${Math.round(shown)}°`,
        icon: <Droplets className="h-3 w-3" />,
      });
    }
  }
  if (card.showPrecipitation) {
    const nextPop = device.hourly.find((h) => h.probabilityOfPrecipitation != null)?.probabilityOfPrecipitation;
    if (nextPop != null && nextPop > 0) {
      out.push({
        key: 'precip',
        label: 'Precip',
        value: `${Math.round(nextPop)}%`,
        icon: <CloudRain className="h-3 w-3" />,
      });
    }
  }
  return out;
}

/** Approximate feels-like using the US NWS heat index (warm) / wind chill
 *  (cold) formulas. Returns in the same unit as `device.temperature`. */
function feelsLike(device: WeatherState): number | null {
  const t = device.temperature;
  if (t == null) return null;
  const isF = device.temperatureUnit === '°F';
  const tF = isF ? t : (t * 9) / 5 + 32;
  const rh = device.humidity;
  const windMph = parseFloat(device.windSpeed ?? '');
  let feelsF = tF;
  if (tF >= 80 && rh != null && rh >= 40) {
    // Rothfusz heat index.
    feelsF =
      -42.379 +
      2.04901523 * tF +
      10.14333127 * rh -
      0.22475541 * tF * rh -
      0.00683783 * tF * tF -
      0.05481717 * rh * rh +
      0.00122874 * tF * tF * rh +
      0.00085282 * tF * rh * rh -
      0.00000199 * tF * tF * rh * rh;
  } else if (tF <= 50 && !Number.isNaN(windMph) && windMph > 3) {
    feelsF =
      35.74 +
      0.6215 * tF -
      35.75 * Math.pow(windMph, 0.16) +
      0.4275 * tF * Math.pow(windMph, 0.16);
  } else {
    return null; // no meaningful adjustment
  }
  return isF ? feelsF : ((feelsF - 32) * 5) / 9;
}

function alertTone(alerts: WeatherAlert[]): 'critical' | 'warning' | 'info' {
  let top = 0;
  for (const a of alerts) top = Math.max(top, SEVERITY_ORDER[a.severity] ?? 0);
  if (top >= 4) return 'critical';
  if (top >= 3) return 'warning';
  return 'info';
}

// --- Hourly ----------------------------------------------------------------

function HourlyPane({ hours, card }: { hours: WeatherForecastHour[]; card: WeatherCardDescriptor }) {
  if (!hours || hours.length === 0) {
    return (
      <div className="text-xs" style={{ color: token('--color-text-muted') }}>
        Hourly forecast unavailable
      </div>
    );
  }
  const mode = card.mode;
  const slice = hours.slice(0, card.hoursToShow);
  const minW = mode === 'expanded' ? 68 : mode === 'compact' ? 48 : 56;
  const iconPx = mode === 'expanded' ? 28 : mode === 'compact' ? 20 : 24;
  return (
    <div
      className="flex gap-2 overflow-x-auto rounded-md p-2"
      style={{ background: token('--color-bg-hover') }}
      role="list"
      aria-label="Hourly forecast"
    >
      {slice.map((h) => (
        <div
          key={h.startTime}
          role="listitem"
          className="flex flex-col items-center gap-0.5"
          style={{ minWidth: minW }}
        >
          <span className="text-[10px]" style={{ color: token('--color-text-muted') }}>
            {formatHour(h.startTime)}
          </span>
          <IconGlyph
            name={weatherIconFor(h.shortForecast, h.isDaytime)}
            size={iconPx}
            style={{ color: token('--color-text-secondary') }}
          />
          <span className={`${mode === 'expanded' ? 'text-sm' : 'text-xs'} font-medium tabular-nums`}>
            {h.temperature != null ? `${Math.round(h.temperature)}°` : '—'}
          </span>
          {card.showPrecipitation
            && h.probabilityOfPrecipitation != null
            && h.probabilityOfPrecipitation > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] tabular-nums"
                style={{ color: severityVar('info') }}
              >
                <CloudRain className="h-2.5 w-2.5" />
                {Math.round(h.probabilityOfPrecipitation)}%
              </span>
            )}
          {mode === 'expanded' && card.showHumidity && h.relativeHumidity != null && (
            <span className="text-[10px] tabular-nums" style={{ color: token('--color-text-muted') }}>
              {h.relativeHumidity}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Daily -----------------------------------------------------------------

function DailyPane({ days, card }: { days: WeatherForecastDay[]; card: WeatherCardDescriptor }) {
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
  const slice = pairs.slice(0, card.daysToShow);
  const mode = card.mode;

  return (
    <div className="flex flex-col gap-1" role="list" aria-label="Daily forecast">
      {slice.map((pair) => {
        const primary = pair.day ?? pair.night;
        if (!primary) return null;
        const hi = pair.day?.temperature;
        const lo = pair.night?.temperature;
        const pop = Math.max(
          pair.day?.probabilityOfPrecipitation ?? 0,
          pair.night?.probabilityOfPrecipitation ?? 0,
        );
        const rowPad = mode === 'expanded' ? 'px-3 py-2' : 'px-2 py-1';
        return (
          <div
            key={pair.key}
            role="listitem"
            className={`flex items-center gap-2 rounded-md ${rowPad} text-xs`}
            style={{ background: token('--color-bg-hover') }}
          >
            <span className={`${mode === 'expanded' ? 'w-20' : 'w-16'} font-medium`}>
              {pair.day?.name ?? pair.night?.name}
            </span>
            <IconGlyph
              name={weatherIconFor(primary.shortForecast, primary.isDaytime)}
              size={mode === 'expanded' ? 24 : 20}
              style={{ color: token('--color-text-secondary') }}
            />
            <span className="flex-1 truncate" style={{ color: token('--color-text-secondary') }}>
              {primary.shortForecast}
            </span>
            {card.showPrecipitation && pop > 0 && (
              <span
                className="inline-flex items-center gap-0.5 tabular-nums"
                style={{ color: severityVar('info') }}
              >
                <CloudRain className="h-3 w-3" />
                {Math.round(pop)}%
              </span>
            )}
            {card.showHighLow && (
              <span className="tabular-nums" style={{ color: token('--color-text-muted') }}>
                {lo != null ? `${Math.round(lo)}°` : '—'}
                {' / '}
                <span style={{ color: token('--color-text') }}>
                  {hi != null ? `${Math.round(hi)}°` : '—'}
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Alerts ----------------------------------------------------------------

function AlertsPane({ alerts, mode }: { alerts: WeatherAlert[]; mode: Mode }) {
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
              {mode === 'expanded' && a.instruction && (
                <span className="mt-1" style={{ color: token('--color-text-muted') }}>{a.instruction}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Radar -----------------------------------------------------------------

function RadarPane({ device, zoom, mode }: { device: WeatherState; zoom: number; mode: Mode }) {
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
  const aspect = mode === 'expanded' ? '16 / 9' : mode === 'compact' ? '16 / 7' : '16 / 10';
  return (
    <div
      className="overflow-hidden rounded-md"
      style={{ aspectRatio: aspect, background: token('--color-bg-hover') }}
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
