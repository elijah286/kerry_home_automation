// ---------------------------------------------------------------------------
// Unit coercion — groups compatible units and converts to a base unit
// ---------------------------------------------------------------------------

export interface UnitFamily {
  base: string;          // display unit, e.g. 'W'
  label: string;         // axis label, e.g. 'Power'
  members: Record<string, number>; // unit → multiplier to base
}

const UNIT_FAMILIES: UnitFamily[] = [
  {
    base: 'W',
    label: 'Power',
    members: { W: 1, kW: 1000, MW: 1_000_000, mW: 0.001 },
  },
  {
    base: 'Wh',
    label: 'Energy',
    members: { Wh: 1, kWh: 1000, MWh: 1_000_000 },
  },
  {
    base: '\u00b0F',
    label: 'Temperature',
    members: { '\u00b0F': 1, '\u00b0C': -999 }, // special conversion
  },
  {
    base: '%',
    label: 'Percentage',
    members: { '%': 1 },
  },
  {
    base: 'V',
    label: 'Voltage',
    members: { V: 1, mV: 0.001 },
  },
  {
    base: 'A',
    label: 'Current',
    members: { A: 1, mA: 0.001 },
  },
  {
    base: 'rpm',
    label: 'Speed',
    members: { rpm: 1 },
  },
  {
    base: 'mph',
    label: 'Speed',
    members: { mph: 1, 'km/h': 0.621371, 'mi/hr': 1 },
  },
  {
    base: 'mi',
    label: 'Distance',
    members: { mi: 1, km: 0.621371 },
  },
  {
    base: 'Hz',
    label: 'Frequency',
    members: { Hz: 1, kHz: 1000 },
  },
  {
    base: 'ppm',
    label: 'Concentration',
    members: { ppm: 1 },
  },
];

/** Well-known fields and their implicit units */
const FIELD_UNITS: Record<string, string> = {
  // Power (watts)
  powerW: 'W', solarW: 'W', solarPower: 'W', batteryPower: 'W',
  gridPower: 'W', loadPower: 'W', watts: 'W',
  gridServicesPower: 'W', generatorPower: 'W',
  chargerPower: 'kW',
  // Energy (watt-hours)
  totalPackEnergy: 'Wh', energyLeft: 'Wh',
  chargeEnergyAdded: 'kWh',
  // Temperature
  temperature: '\u00b0F', currentTemp: '\u00b0F', insideTemp: '\u00b0C', outsideTemp: '\u00b0C',
  // Percentage
  brightness: '%', position: '%', volume: '%', batteryLevel: '%',
  batteryPercentage: '%', chargeLimitSoc: '%', humidity: '%',
  backupReservePercent: '%',
  // Speed
  rpm: 'rpm', chargeRate: 'mi/hr', speed: 'mph',
  // Distance
  batteryRange: 'mi', odometer: 'mi',
  // Electrical
  chargerVoltage: 'V', chargerActualCurrent: 'A',
  // Frequency
  frequencyHz: 'Hz',
  // Concentration
  saltPPM: 'ppm',
  // Time
  timeToFullCharge: 'hr',
};

export function getFieldUnit(field: string, explicitUnit?: string): string | null {
  return explicitUnit ?? FIELD_UNITS[field] ?? null;
}

export function findUnitFamily(unit: string): UnitFamily | null {
  return UNIT_FAMILIES.find((f) => unit in f.members) ?? null;
}

export function convertToBase(value: number, unit: string, family: UnitFamily): number {
  // Special case: Celsius to Fahrenheit
  if (unit === '\u00b0C' && family.base === '\u00b0F') {
    return value * 9 / 5 + 32;
  }
  const mult = family.members[unit];
  if (mult == null) return value;
  return value * mult;
}

/**
 * Pick the best display unit for a set of values in a base unit.
 * E.g., if all values are > 1000 W, display as kW.
 */
export function bestDisplayUnit(values: number[], family: UnitFamily): { unit: string; divisor: number } {
  if (values.length === 0) return { unit: family.base, divisor: 1 };

  const maxAbs = Math.max(...values.map(Math.abs));

  // Find the largest member whose multiplier fits
  const sorted = Object.entries(family.members)
    .filter(([, m]) => m > 0) // skip special conversions
    .sort(([, a], [, b]) => b - a);

  for (const [unit, mult] of sorted) {
    if (maxAbs >= mult) {
      return { unit, divisor: mult };
    }
  }
  return { unit: family.base, divisor: 1 };
}

export function areUnitsCompatible(unitA: string, unitB: string): boolean {
  const fA = findUnitFamily(unitA);
  const fB = findUnitFamily(unitB);
  if (!fA || !fB) return false;
  return fA.base === fB.base;
}
