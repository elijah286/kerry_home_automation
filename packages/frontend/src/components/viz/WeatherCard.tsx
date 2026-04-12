'use client';

import { useState } from 'react';
import type { WeatherState, WeatherForecastDay } from '@ha/shared';
import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, Wind, Droplets,
  CloudFog, ChevronDown, ChevronUp, MapPin, Radar,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Icon mapper (reused from original WeatherDisplay)
// ---------------------------------------------------------------------------

function conditionIcon(condition: string) {
  const c = condition.toLowerCase();
  if (c.includes('thunder') || c.includes('lightning')) return CloudLightning;
  if (c.includes('snow') || c.includes('sleet') || c.includes('ice')) return CloudSnow;
  if (c.includes('rain') || c.includes('shower')) return CloudRain;
  if (c.includes('drizzle')) return CloudDrizzle;
  if (c.includes('fog') || c.includes('haze') || c.includes('mist')) return CloudFog;
  if (c.includes('wind')) return Wind;
  if (c.includes('cloud') || c.includes('overcast')) return Cloud;
  return Sun;
}

function conditionGradient(condition: string): string {
  const c = condition.toLowerCase();
  if (c.includes('thunder') || c.includes('lightning')) return 'linear-gradient(135deg, #1e293b, #475569)';
  if (c.includes('snow') || c.includes('sleet') || c.includes('ice')) return 'linear-gradient(135deg, #e0e7ff, #c7d2fe)';
  if (c.includes('rain') || c.includes('shower') || c.includes('drizzle')) return 'linear-gradient(135deg, #334155, #64748b)';
  if (c.includes('fog') || c.includes('haze')) return 'linear-gradient(135deg, #94a3b8, #cbd5e1)';
  if (c.includes('cloud') || c.includes('overcast')) return 'linear-gradient(135deg, #64748b, #94a3b8)';
  return 'linear-gradient(135deg, #38bdf8, #60a5fa)'; // clear/sunny
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = 'forecast' | 'radar';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WeatherCardProps {
  device: WeatherState;
  className?: string;
}

export function WeatherCard({ device, className }: WeatherCardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('forecast');
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  const Icon = conditionIcon(device.condition);

  // Group forecast into day/night pairs
  const forecastPairs: { day?: WeatherForecastDay; night?: WeatherForecastDay }[] = [];
  const forecast = device.forecast;
  for (let i = 0; i < forecast.length; i++) {
    const entry = forecast[i];
    if (entry.isDaytime) {
      forecastPairs.push({ day: entry });
    } else if (forecastPairs.length > 0 && !forecastPairs[forecastPairs.length - 1].night) {
      forecastPairs[forecastPairs.length - 1].night = entry;
    } else {
      forecastPairs.push({ night: entry });
    }
  }

  return (
    <div className={`space-y-0 ${className ?? ''}`}>
      {/* Hero: current conditions */}
      <div
        className="rounded-t-lg p-5 relative overflow-hidden"
        style={{ background: conditionGradient(device.condition) }}
      >
        <div className="relative z-10 flex items-center gap-5">
          <Icon className="h-14 w-14 shrink-0 text-white/90 drop-shadow-lg" />
          <div className="text-white">
            <div className="text-4xl font-bold tracking-tight drop-shadow">
              {device.temperature != null ? `${device.temperature}\u00b0` : '\u2014'}
            </div>
            <div className="text-sm text-white/80 font-medium mt-0.5">
              {device.condition}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="relative z-10 flex gap-5 mt-4 text-xs text-white/70">
          {device.humidity != null && (
            <span className="flex items-center gap-1">
              <Droplets className="h-3.5 w-3.5" /> {device.humidity}%
            </span>
          )}
          {device.windSpeed && (
            <span className="flex items-center gap-1">
              <Wind className="h-3.5 w-3.5" /> {device.windSpeed} {device.windDirection ?? ''}
            </span>
          )}
        </div>

        {/* Decorative large icon */}
        <Icon
          className="absolute -right-4 -bottom-4 h-32 w-32 text-white/5"
          strokeWidth={0.5}
        />
      </div>

      {/* Tab bar */}
      <div
        className="flex border-b"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
      >
        {([
          { id: 'forecast' as const, label: 'Forecast', icon: Sun },
          { id: 'radar' as const, label: 'Radar', icon: Radar },
        ]).map((tab) => {
          const TabIcon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors"
              style={{
                color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
            >
              <TabIcon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div
        className="rounded-b-lg p-3"
        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderTop: 'none' }}
      >
        {activeTab === 'forecast' && (
          <div className="space-y-0.5">
            {forecastPairs.length === 0 && (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                No forecast data available
              </p>
            )}
            {forecastPairs.map((pair, i) => {
              const dayEntry = pair.day ?? pair.night!;
              const DayIcon = conditionIcon(dayEntry.shortForecast);
              const isExpanded = expandedDay === i;

              return (
                <div key={i}>
                  <button
                    onClick={() => setExpandedDay(isExpanded ? null : i)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-md transition-colors text-left"
                    style={{ backgroundColor: isExpanded ? 'var(--color-bg-hover)' : 'transparent' }}
                  >
                    <DayIcon className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                    <span className="w-20 text-xs font-medium truncate">{dayEntry.name}</span>
                    <div className="flex-1 flex items-center gap-2">
                      {pair.day && (
                        <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                          {pair.day.temperature}\u00b0
                        </span>
                      )}
                      {pair.night && (
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {pair.night.temperature}\u00b0
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] flex-1 truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {dayEntry.shortForecast}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-3 w-3 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                    )}
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-9 pb-2 space-y-1.5">
                      {pair.day && pair.day.detailedForecast && (
                        <div>
                          <div className="text-[10px] font-medium mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            Day
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                            {pair.day.detailedForecast}
                          </p>
                        </div>
                      )}
                      {pair.night && pair.night.detailedForecast && (
                        <div>
                          <div className="text-[10px] font-medium mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            Night
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                            {pair.night.detailedForecast}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'radar' && (
          <div className="space-y-2">
            <div
              className="rounded-md overflow-hidden"
              style={{ border: '1px solid var(--color-border)' }}
            >
              {/* NWS radar — use the standard radar.weather.gov embed */}
              <iframe
                src="https://radar.weather.gov/"
                title="NWS Radar"
                className="w-full border-0"
                style={{ height: 350, backgroundColor: 'var(--color-bg-secondary)' }}
                loading="lazy"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
            <p className="text-[10px] text-center" style={{ color: 'var(--color-text-muted)' }}>
              Data from National Weather Service
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
