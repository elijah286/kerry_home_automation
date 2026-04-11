'use client';

import type { WeatherState } from '@ha/shared';
import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, Wind, Droplets,
  Thermometer, CloudFog,
} from 'lucide-react';

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

export function WeatherDisplay({ device }: { device: WeatherState }) {
  const Icon = conditionIcon(device.condition);

  return (
    <div className="space-y-4">
      {/* Current conditions */}
      <div className="flex items-center gap-4">
        <Icon className="h-10 w-10 shrink-0" style={{ color: 'var(--color-accent)' }} />
        <div>
          <div className="text-2xl font-semibold">
            {device.temperature != null ? `${device.temperature}°${device.temperatureUnit}` : '—'}
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {device.condition}
          </div>
        </div>
      </div>

      {/* Details row */}
      <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {device.humidity != null && (
          <span className="flex items-center gap-1">
            <Droplets className="h-3 w-3" /> {device.humidity}%
          </span>
        )}
        {device.windSpeed && (
          <span className="flex items-center gap-1">
            <Wind className="h-3 w-3" /> {device.windSpeed} {device.windDirection ?? ''}
          </span>
        )}
      </div>

      {/* Forecast */}
      {device.forecast.length > 0 && (
        <div className="border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>Forecast</div>
          <div className="space-y-1.5">
            {device.forecast.slice(0, 8).map((day, i) => {
              const DayIcon = conditionIcon(day.shortForecast);
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <DayIcon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                  <span className="w-24 truncate font-medium">{day.name}</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {day.temperature != null ? `${day.temperature}°${day.temperatureUnit}` : '—'}
                  </span>
                  <span className="flex-1 truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {day.shortForecast}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
