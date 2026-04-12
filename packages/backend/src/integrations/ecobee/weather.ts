// Ecobee weatherSymbol → readable condition (Home Assistant const parity)

import type { EcobeeOutdoorWeather } from '@ha/shared';
import type { EcobeeThermostat } from './ecobee-client.js';

export const ECOBEE_WEATHER_SYMBOL_LABEL: Record<number, string> = {
  0: 'sunny',
  1: 'partlycloudy',
  2: 'partlycloudy',
  3: 'cloudy',
  4: 'cloudy',
  5: 'cloudy',
  6: 'rainy',
  7: 'snowy-rainy',
  8: 'pouring',
  9: 'hail',
  10: 'snowy',
  11: 'snowy',
  12: 'snowy-rainy',
  13: 'snowy-heavy',
  14: 'hail',
  15: 'lightning-rainy',
  16: 'windy',
  17: 'tornado',
  18: 'fog',
  19: 'hazy',
  20: 'hazy',
  21: 'hazy',
};

const UNKNOWN = -2;

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapOutdoorWeather(weather: EcobeeThermostat['weather']): EcobeeOutdoorWeather | null {
  if (!weather?.forecasts?.length) return null;
  const f = weather.forecasts[0] as Record<string, unknown>;
  const sym = num(f.weatherSymbol);
  const station = typeof weather.weatherStation === 'string' ? weather.weatherStation : null;
  const timestamp = typeof weather.timestamp === 'string' ? weather.timestamp : null;

  return {
    temperatureF: num(f.temperature) != null ? num(f.temperature)! / 10 : null,
    highF: num(f.tempHigh) != null && num(f.tempHigh) !== UNKNOWN ? num(f.tempHigh)! / 10 : null,
    lowF: num(f.tempLow) != null && num(f.tempLow) !== UNKNOWN ? num(f.tempLow)! / 10 : null,
    weatherSymbol: sym,
    condition:
      sym != null && sym !== UNKNOWN
        ? ECOBEE_WEATHER_SYMBOL_LABEL[sym] ?? `symbol_${sym}`
        : null,
    humidity: num(f.relativeHumidity),
    pressure: num(f.pressure),
    windSpeedMph: num(f.windSpeed),
    windBearing: num(f.windBearing),
    station,
    timestamp,
  };
}
