import { getSolarElevation } from './sun-calc.js';

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Room illuminance → darkness score.
 * 0 lux = 1.0 (fully dark), >= targetLux = 0.0 (bright enough).
 * Uses an inverse curve so changes near zero lux have less impact than
 * changes near the target — matching human perception.
 */
export function normalizeIlluminance(lux: number, targetLux: number): number {
  if (targetLux <= 0) return 0;
  if (lux <= 0) return 1;
  if (lux >= targetLux) return 0;
  return clamp01(1 - Math.sqrt(lux / targetLux));
}

/**
 * PV production → darkness proxy.
 * High production means lots of sun hitting the panels.
 */
export function normalizeSolarProduction(watts: number, capacityWatts: number): number {
  if (capacityWatts <= 0) return 0.5;
  if (watts <= 0) return 1;
  const ratio = watts / capacityWatts;
  return clamp01(1 - ratio);
}

/**
 * Solar elevation angle → darkness score.
 * Below horizon (< 0°) → 1.0
 * Civil twilight zone (0–6°) → steep ramp
 * Low sun (6–30°) → gentle ramp
 * High sun (≥ 30°) → 0.0
 */
export function normalizeSunPosition(lat: number, lon: number, timestamp: Date): number {
  const elevation = getSolarElevation(lat, lon, timestamp);
  if (elevation <= 0) return 1;
  if (elevation >= 30) return 0;
  if (elevation <= 6) {
    return clamp01(1 - elevation / 6 * 0.6);
  }
  return clamp01(0.4 * (1 - (elevation - 6) / 24));
}

const WEATHER_DARKNESS: Record<string, number> = {
  'clear-night': 0.0,
  'sunny': 0.0,
  'clear': 0.0,
  'partlycloudy': 0.2,
  'partly-cloudy': 0.2,
  'windy': 0.1,
  'windy-variant': 0.15,
  'cloudy': 0.4,
  'rainy': 0.6,
  'fog': 0.7,
  'hail': 0.6,
  'snowy': 0.5,
  'snowy-rainy': 0.55,
  'pouring': 0.8,
  'lightning': 0.75,
  'lightning-rainy': 0.8,
  'exceptional': 0.5,
};

/**
 * Weather condition string → darkness modifier.
 * Unknown conditions get a moderate default (0.3).
 */
export function normalizeWeatherCondition(state: string): number {
  const key = state.toLowerCase().trim();
  return WEATHER_DARKNESS[key] ?? 0.3;
}

/**
 * Cloud cover percentage (0–100) → darkness contribution.
 * Linear mapping: 0% = 0.0, 100% = 1.0.
 */
export function normalizeCloudCover(percentage: number): number {
  return clamp01(percentage / 100);
}

export interface SignalWeights {
  illuminance: number;
  solar: number;
  sun: number;
  weather: number;
  cloud: number;
}

export const DEFAULT_WEIGHTS: SignalWeights = {
  illuminance: 0.40,
  solar: 0.20,
  sun: 0.20,
  weather: 0.10,
  cloud: 0.10,
};

export interface NormalizedSignals {
  illuminance: number | null;
  solar: number | null;
  sun: number;
  weather: number | null;
  cloud: number | null;
}

/**
 * Fuse normalized signals with weights.
 * Signals that are null (unavailable) have their weight redistributed
 * proportionally among available signals.
 */
export function fuseSignals(signals: NormalizedSignals, weights: SignalWeights): number {
  let totalWeight = 0;
  let weightedSum = 0;

  const entries: { value: number | null; weight: number }[] = [
    { value: signals.illuminance, weight: weights.illuminance },
    { value: signals.solar, weight: weights.solar },
    { value: signals.sun, weight: weights.sun },
    { value: signals.weather, weight: weights.weather },
    { value: signals.cloud, weight: weights.cloud },
  ];

  for (const e of entries) {
    if (e.value !== null) {
      totalWeight += e.weight;
      weightedSum += e.value * e.weight;
    }
  }

  if (totalWeight === 0) return 0.5;
  return clamp01(weightedSum / totalWeight);
}
