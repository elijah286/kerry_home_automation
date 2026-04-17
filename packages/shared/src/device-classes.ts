// ---------------------------------------------------------------------------
// Device class taxonomy — aligned with Home Assistant's `device_class` values.
//
// Two jobs:
//   1. Gives bridges and admins a canonical vocabulary for classifying what a
//      device *is* beyond its coarse `type` discriminator (a `sensor` can be
//      temperature / humidity / battery / illuminance / etc.).
//   2. Serves as the lookup key — together with `type` — into the frontend
//      `device-card-map`, so a "cover + blind" device resolves to a vertical
//      blind tile while a "cover + garage" resolves to a garage door card.
//
// Kept as a flat enum (not nested per-type) because many bridges already
// emit HA-aligned values and a single enum is the easiest shape for:
//   - Zod validation of LLM inference output,
//   - a `<Select>` in the device edit UI,
//   - documentation the LLM consumes in its system prompt.
// ---------------------------------------------------------------------------

import { z } from 'zod';

/**
 * Canonical device class vocabulary. Mirrors Home Assistant where possible so
 * bridge integrations (HA, hubitat, zwavejs, matter) can forward values
 * without translation. Values should stay lowercase snake_case.
 *
 * If you need to add a class: append to the array below — alphabetize within
 * the logical group to keep diffs sane. Do not remove values; map them to a
 * near-equivalent and leave the old key for migration safety.
 */
export const DEVICE_CLASSES = [
  // -- Environmental sensors -----------------------------------------------
  'temperature',
  'humidity',
  'pressure',
  'co2',
  'co',
  'pm25',
  'pm10',
  'voc',
  'illuminance',
  'uv_index',
  'moisture',
  'sound_level',

  // -- Electrical / energy sensors -----------------------------------------
  'battery',
  'voltage',
  'current',
  'power',
  'power_factor',
  'energy',
  'frequency',
  'apparent_power',
  'reactive_power',

  // -- Mechanical / physical sensors ---------------------------------------
  'distance',
  'speed',
  'weight',
  'volume',
  'gas',
  'water',
  'signal_strength',

  // -- Binary-sensor states (device reports open/closed, on/off, etc.) ----
  'door',
  'window',
  'garage_door',
  'motion',
  'occupancy',
  'presence',
  'smoke',
  'gas_leak',
  'co_alarm',
  'leak',
  'tamper',
  'vibration',
  'sound',
  'connectivity',
  'plug',
  'lock',
  'light',
  'running',
  'problem',
  'safety',
  'update',
  'cold',
  'heat',

  // -- Cover variants ------------------------------------------------------
  'blind',
  'shade',
  'shutter',
  'curtain',
  'awning',
  'shutter_venetian',

  // -- Switch / outlet variants --------------------------------------------
  'outlet',
  'switch',

  // -- Media / AV ----------------------------------------------------------
  'tv',
  'receiver',
  'speaker',

  // -- Climate / HVAC ------------------------------------------------------
  'thermostat',
  'heater',
  'cooler',
  'dehumidifier',
  'humidifier',
  'fan',
  'air_purifier',

  // -- Location / mobility -------------------------------------------------
  'geolocation',
  'vehicle',
  'vehicle_battery',
  'vehicle_range',
  'vehicle_speed',
  'vehicle_odometer',
  'vehicle_gear',
  'vehicle_charge_state',

  // -- Composite devices ---------------------------------------------------
  'weather',
  'camera',
  'doorbell',
  'sprinkler',
  'vacuum',
  'pool',
  'spa',
  'alarm_panel',
  'sun',
  'timer',
  'counter',
  'button',
  'toggle',

  // -- Catch-all -----------------------------------------------------------
  /**
   * "I don't know." Use when the LLM (or a bridge) is uncertain. Resolves to
   * the bare `type`-level default card and shows a "Suggest a class" CTA in
   * admin UIs.
   */
  'unknown',
] as const;

export const deviceClassSchema = z.enum(DEVICE_CLASSES);
export type DeviceClass = z.infer<typeof deviceClassSchema>;

/**
 * Short human-readable label for each class. Kept separate from the enum so
 * translators don't have to fight the type. Missing keys fall back to the
 * raw value via `deviceClassLabel()`.
 */
export const DEVICE_CLASS_LABELS: Partial<Record<DeviceClass, string>> = {
  temperature: 'Temperature',
  humidity: 'Humidity',
  pressure: 'Pressure',
  co2: 'CO₂',
  co: 'Carbon monoxide',
  pm25: 'PM2.5',
  pm10: 'PM10',
  voc: 'VOC',
  illuminance: 'Illuminance',
  uv_index: 'UV index',
  moisture: 'Moisture',
  sound_level: 'Sound level',

  battery: 'Battery',
  voltage: 'Voltage',
  current: 'Current',
  power: 'Power',
  power_factor: 'Power factor',
  energy: 'Energy',
  frequency: 'Frequency',
  apparent_power: 'Apparent power',
  reactive_power: 'Reactive power',

  distance: 'Distance',
  speed: 'Speed',
  weight: 'Weight',
  volume: 'Volume',
  gas: 'Gas',
  water: 'Water',
  signal_strength: 'Signal strength',

  door: 'Door',
  window: 'Window',
  garage_door: 'Garage door',
  motion: 'Motion',
  occupancy: 'Occupancy',
  presence: 'Presence',
  smoke: 'Smoke',
  gas_leak: 'Gas leak',
  co_alarm: 'CO alarm',
  leak: 'Water leak',
  tamper: 'Tamper',
  vibration: 'Vibration',
  sound: 'Sound',
  connectivity: 'Connectivity',
  plug: 'Plug',
  lock: 'Lock',
  light: 'Light',
  running: 'Running',
  problem: 'Problem',
  safety: 'Safety',
  update: 'Update',
  cold: 'Cold',
  heat: 'Heat',

  blind: 'Blind',
  shade: 'Shade',
  shutter: 'Shutter',
  curtain: 'Curtain',
  awning: 'Awning',
  shutter_venetian: 'Venetian shutter',

  outlet: 'Outlet',
  switch: 'Switch',

  tv: 'TV',
  receiver: 'A/V receiver',
  speaker: 'Speaker',

  thermostat: 'Thermostat',
  heater: 'Heater',
  cooler: 'Cooler',
  dehumidifier: 'Dehumidifier',
  humidifier: 'Humidifier',
  fan: 'Fan',
  air_purifier: 'Air purifier',

  geolocation: 'Location',
  vehicle: 'Vehicle',
  vehicle_battery: 'Vehicle battery',
  vehicle_range: 'Vehicle range',
  vehicle_speed: 'Vehicle speed',
  vehicle_odometer: 'Odometer',
  vehicle_gear: 'Gear',
  vehicle_charge_state: 'Charge state',

  weather: 'Weather',
  camera: 'Camera',
  doorbell: 'Doorbell',
  sprinkler: 'Sprinkler',
  vacuum: 'Vacuum',
  pool: 'Pool',
  spa: 'Spa',
  alarm_panel: 'Alarm panel',
  sun: 'Sun',
  timer: 'Timer',
  counter: 'Counter',
  button: 'Button',
  toggle: 'Toggle',

  unknown: 'Unknown',
};

export function deviceClassLabel(value: DeviceClass | string | null | undefined): string {
  if (!value) return '—';
  return (DEVICE_CLASS_LABELS as Record<string, string>)[value] ?? value;
}

/**
 * Convenience groupings for admin UIs — a <Select> can render optgroups
 * without re-deriving them inline.
 */
export const DEVICE_CLASS_GROUPS: { label: string; classes: DeviceClass[] }[] = [
  {
    label: 'Environment',
    classes: [
      'temperature', 'humidity', 'pressure', 'co2', 'co', 'pm25', 'pm10',
      'voc', 'illuminance', 'uv_index', 'moisture', 'sound_level',
    ],
  },
  {
    label: 'Electrical',
    classes: [
      'battery', 'voltage', 'current', 'power', 'power_factor', 'energy',
      'frequency', 'apparent_power', 'reactive_power',
    ],
  },
  {
    label: 'Mechanical',
    classes: ['distance', 'speed', 'weight', 'volume', 'gas', 'water', 'signal_strength'],
  },
  {
    label: 'Binary states',
    classes: [
      'door', 'window', 'garage_door', 'motion', 'occupancy', 'presence',
      'smoke', 'gas_leak', 'co_alarm', 'leak', 'tamper', 'vibration', 'sound',
      'connectivity', 'plug', 'lock', 'light', 'running', 'problem', 'safety',
      'update', 'cold', 'heat',
    ],
  },
  {
    label: 'Covers',
    classes: ['blind', 'shade', 'shutter', 'curtain', 'awning', 'shutter_venetian'],
  },
  {
    label: 'Switches',
    classes: ['outlet', 'switch'],
  },
  {
    label: 'Media',
    classes: ['tv', 'receiver', 'speaker'],
  },
  {
    label: 'Climate',
    classes: ['thermostat', 'heater', 'cooler', 'dehumidifier', 'humidifier', 'fan', 'air_purifier'],
  },
  {
    label: 'Vehicle',
    classes: [
      'vehicle', 'vehicle_battery', 'vehicle_range', 'vehicle_speed',
      'vehicle_odometer', 'vehicle_gear', 'vehicle_charge_state',
    ],
  },
  {
    label: 'Composite',
    classes: [
      'weather', 'camera', 'doorbell', 'sprinkler', 'vacuum', 'pool', 'spa',
      'alarm_panel', 'sun', 'geolocation',
    ],
  },
  {
    label: 'Helpers',
    classes: ['timer', 'counter', 'button', 'toggle'],
  },
];
