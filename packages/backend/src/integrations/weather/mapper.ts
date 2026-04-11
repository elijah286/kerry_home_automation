// ---------------------------------------------------------------------------
// NWS responses → WeatherState
// ---------------------------------------------------------------------------

import type { WeatherState, WeatherForecastDay } from '@ha/shared';
import type { NWSObservation, NWSForecastPeriod } from './nws-client.js';

function celsiusToFahrenheit(c: number | null): number | null {
  if (c == null) return null;
  return Math.round(c * 9 / 5 + 32);
}

function windDegreesToDirection(deg: number | null): string | null {
  if (deg == null) return null;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function metersPerSecToMph(mps: number | null): string | null {
  if (mps == null) return null;
  return `${Math.round(mps * 2.237)} mph`;
}

export function mapWeatherState(
  entryId: string,
  locationName: string,
  observation: NWSObservation,
  forecast: NWSForecastPeriod[],
): WeatherState {
  return {
    type: 'weather',
    id: `weather.${entryId}`,
    name: locationName,
    integration: 'weather',
    areaId: null,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    temperature: celsiusToFahrenheit(observation.temperature.value),
    temperatureUnit: 'F',
    humidity: observation.relativeHumidity.value != null
      ? Math.round(observation.relativeHumidity.value)
      : null,
    windSpeed: metersPerSecToMph(observation.windSpeed.value),
    windDirection: windDegreesToDirection(observation.windDirection.value),
    condition: observation.textDescription || 'Unknown',
    icon: observation.icon,
    forecast: forecast.slice(0, 14).map((p): WeatherForecastDay => ({
      name: p.name,
      temperature: p.temperature,
      temperatureUnit: p.temperatureUnit,
      shortForecast: p.shortForecast,
      detailedForecast: p.detailedForecast,
      isDaytime: p.isDaytime,
    })),
  };
}
