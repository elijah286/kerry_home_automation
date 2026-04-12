// ---------------------------------------------------------------------------
// SunCalc data → SunState
// ---------------------------------------------------------------------------

import SunCalc from 'suncalc';
import type { SunState, SunPhase } from '@ha/shared';

function toIso(d: Date): string {
  return d.toISOString();
}

/** Radians → degrees */
function toDeg(rad: number): number {
  return rad * (180 / Math.PI);
}

/**
 * Map sun elevation to a 0-100 "daylight percent".
 * 0 = full night, 100 = sun at max elevation.
 * Scales linearly from -6° (civil twilight boundary) to maxElevation.
 */
function elevationToPercent(elevation: number, maxElevation: number): number {
  const CIVIL_TWILIGHT_DEG = -6;
  if (elevation <= CIVIL_TWILIGHT_DEG) return 0;
  if (elevation >= maxElevation) return 100;
  const range = maxElevation - CIVIL_TWILIGHT_DEG;
  if (range <= 0) return 0;
  return Math.round(((elevation - CIVIL_TWILIGHT_DEG) / range) * 100);
}

function getPhase(elevation: number): SunPhase {
  if (elevation > 0) return 'day';
  if (elevation > -6) return 'civil_twilight';
  if (elevation > -12) return 'nautical_twilight';
  if (elevation > -18) return 'astronomical_twilight';
  return 'night';
}

export function mapSunState(
  entryId: string,
  label: string,
  lat: number,
  lon: number,
  now: Date = new Date(),
): SunState {
  const times = SunCalc.getTimes(now, lat, lon);
  const pos = SunCalc.getPosition(now, lat, lon);

  // Get max elevation at solar noon
  const noonPos = SunCalc.getPosition(times.solarNoon, lat, lon);
  const maxElevation = Math.round(toDeg(noonPos.altitude) * 100) / 100;

  const elevation = Math.round(toDeg(pos.altitude) * 100) / 100;
  // SunCalc azimuth: 0 = south, positive = west. Convert to compass: 0 = north.
  const rawAzimuth = toDeg(pos.azimuth) + 180;
  const azimuth = Math.round((rawAzimuth % 360) * 100) / 100;

  const daylightDuration = Math.round(
    (times.sunset.getTime() - times.sunrise.getTime()) / 1000,
  );

  return {
    type: 'sun',
    id: `sun.${entryId}`,
    name: label,
    integration: 'sun',
    areaId: null,
    available: true,
    lastChanged: now.getTime(),
    lastUpdated: now.getTime(),
    sunrise: toIso(times.sunrise),
    sunset: toIso(times.sunset),
    solarNoon: toIso(times.solarNoon),
    elevation,
    azimuth,
    maxElevation,
    phase: getPhase(elevation),
    daylightPercent: elevationToPercent(elevation, maxElevation),
    daylightDuration,
    dawn: toIso(times.dawn),
    dusk: toIso(times.dusk),
    goldenHour: toIso(times.goldenHour),
    goldenHourEnd: toIso(times.goldenHourEnd),
  };
}
