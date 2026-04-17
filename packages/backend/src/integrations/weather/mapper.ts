// ---------------------------------------------------------------------------
// NWS responses → WeatherState
// ---------------------------------------------------------------------------

import type {
  WeatherState,
  WeatherForecastDay,
  WeatherForecastHour,
  WeatherAlert,
} from '@ha/shared';
import type {
  NWSObservation,
  NWSForecastPeriod,
  NWSHourlyPeriod,
  NWSAlertFeature,
} from './nws-client.js';

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
  latitude: number,
  longitude: number,
  observation: NWSObservation,
  forecast: NWSForecastPeriod[],
  hourly: NWSHourlyPeriod[] = [],
  alerts: NWSAlertFeature[] = [],
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
    latitude,
    longitude,
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
      icon: p.icon,
      probabilityOfPrecipitation: p.probabilityOfPrecipitation?.value ?? null,
      windSpeed: p.windSpeed ?? null,
      windDirection: p.windDirection ?? null,
      startTime: p.startTime,
      endTime: p.endTime,
    })),
    // Hourly forecast — we truncate at 48h on the backend so even small card
    // renders don't have to page through a 156-element array. The card can
    // re-slice by the descriptor's `hoursToShow` setting.
    hourly: hourly.slice(0, 48).map((h): WeatherForecastHour => ({
      startTime: h.startTime,
      temperature: h.temperature,
      temperatureUnit: h.temperatureUnit,
      icon: h.icon,
      shortForecast: h.shortForecast,
      isDaytime: h.isDaytime,
      probabilityOfPrecipitation: h.probabilityOfPrecipitation?.value ?? null,
      windSpeed: h.windSpeed ?? null,
      windDirection: h.windDirection ?? null,
      dewpoint: h.dewpoint?.value ?? null,
      relativeHumidity: h.relativeHumidity?.value ?? null,
    })),
    alerts: alerts.map((a): WeatherAlert => ({
      id: a.id,
      event: a.properties.event,
      severity: a.properties.severity,
      urgency: a.properties.urgency,
      headline: a.properties.headline,
      description: a.properties.description,
      instruction: a.properties.instruction,
      effective: a.properties.effective,
      expires: a.properties.expires,
    })),
    forecastUpdatedAt: Date.now(),
  };
}
