// ---------------------------------------------------------------------------
// Device → default card mapping.
//
// Given a `DeviceState`, resolve the `CardDescriptor` that best represents it.
// Mapping key is `{type}` or `{type}:{device_class}`; more specific keys win.
//
// Resolution order:
//   1. Per-user override (passed in from the hook/API layer)
//   2. `${device.type}:${device.device_class}` factory (if both known)
//   3. `${device.type}` factory (coarse default)
//   4. Generic button fallback — last-resort, so everything resolves to *some*
//      card rather than crashing the device detail page.
//
// Factories, not static descriptors: every default card needs the device's
// `entity` id wired in at resolution time. Keeping them as pure functions of
// `(device)` means the map never has to know about any particular device
// instance — only its type/class.
// ---------------------------------------------------------------------------

import { weatherCardSchema, type CardDescriptor, type DeviceState, type DeviceType } from '@ha/shared';

type CardFactory = (device: DeviceState) => CardDescriptor;

/**
 * Lookup key. Either the coarse device type (`"cover"`) or a specific
 * `type:device_class` combination (`"cover:garage_door"`). The `type:*`
 * form is the fallback rung; it's implicit in `resolveDefaultCard` and
 * not stored as a key.
 */
type MapKey = `${DeviceType}` | `${DeviceType}:${string}`;

// ---------------------------------------------------------------------------
// Map entries
// ---------------------------------------------------------------------------
//
// NOTE: many entries below resolve to card types that aren't fully
// implemented yet (thermostat, vehicle, cover-tile with position, gauge, etc.
// — 15 of the 27 registered types are still placeholders). Putting the
// mappings in place now means we can implement the card and see it show up
// on every matching device automatically, without a second round of wiring.
// Placeholder cards degrade gracefully via `<CardRenderer>`'s fallback.
//
// `showPositionControl: true` on cover-tile is the slice-1 target — the
// real card gets built next and that flag lights up the vertical-blind UI.

const DEVICE_CARD_MAP: Partial<Record<MapKey, CardFactory>> = {
  // -- Lights --------------------------------------------------------------
  light: (d) => ({ type: 'light-tile', entity: d.id, showBrightness: true, showColor: false }),

  // -- Switches / outlets --------------------------------------------------
  switch: (d) => ({ type: 'switch-tile', entity: d.id }),
  'switch:outlet': (d) => ({ type: 'switch-tile', entity: d.id }),

  // -- Covers --------------------------------------------------------------
  // Default cover gets the position control (vertical blind UI).
  cover: (d) => ({ type: 'cover-tile', entity: d.id, showPositionControl: true, visual: 'auto', showPercentage: true }),
  // Garage doors are binary — position control is misleading.
  'cover:garage_door': (d) => ({ type: 'cover-tile', entity: d.id, showPositionControl: false, visual: 'garage', showPercentage: false }),

  // -- Fans ----------------------------------------------------------------
  fan: (d) => ({ type: 'fan-tile', entity: d.id, showSpeedControl: true }),

  // -- Media players -------------------------------------------------------
  media_player: (d) => ({
    type: 'media-tile',
    entity: d.id,
    controls: ['play-pause', 'volume', 'mute', 'source', 'power'],
    showArtwork: true,
    variant: 'auto',
  }),
  music_player: (d) => ({
    type: 'media-tile',
    entity: d.id,
    controls: ['play-pause', 'skip', 'volume', 'mute'],
    showArtwork: true,
    variant: 'music',
  }),

  // -- Thermostats ---------------------------------------------------------
  thermostat: (d) => ({
    type: 'thermostat',
    entity: d.id,
    showModeControl: true,
    showPresets: true,
    showFanControl: true,
    showHumidity: true,
    showHistory: true,
    size: 'default',
  }),

  // -- Vehicles (composite) ------------------------------------------------
  // Tesla vehicles (identified by compositor data from vehicle_config) get the
  // rich Tesla card with live compositor image and GPS map support.
  // All other vehicles fall back to the generic tile.
  vehicle: (d) => (d as import('@ha/shared').VehicleState).compositorModel
    ? { type: 'tesla', entity: d.id }
    : { type: 'vehicle', entity: d.id, sections: ['battery', 'location', 'climate', 'doors', 'charging'] },

  // -- Cameras & doorbells -------------------------------------------------
  camera: (d) => ({ type: 'camera', entity: d.id, mode: 'auto', fit: 'cover', showStatus: true }),
  doorbell: (d) => ({ type: 'camera', entity: d.id, mode: 'auto', fit: 'cover', showStatus: true }),

  // -- Sensors (by device_class) -------------------------------------------
  // Numeric sensors → gauge with a sensible default range. The real range
  // gets refined by the admin in card config; these are "good enough" seeds.
  'sensor:temperature': (d) => ({
    type: 'gauge', entity: d.id, min: 0, max: 100, unit: '°F', showSparkline: true,
  }),
  'sensor:humidity': (d) => ({
    type: 'gauge', entity: d.id, min: 0, max: 100, unit: '%', showSparkline: true,
  }),
  'sensor:battery': (d) => ({
    type: 'gauge', entity: d.id, min: 0, max: 100, unit: '%', showSparkline: false,
    severity: [{ from: 0, level: 'warning' }, { from: 20, level: 'info' }],
  }),
  'sensor:illuminance': (d) => ({
    type: 'gauge', entity: d.id, min: 0, max: 10000, unit: 'lx', showSparkline: false,
  }),
  'sensor:power': (d) => ({
    type: 'gauge', entity: d.id, min: 0, max: 10000, unit: 'W', showSparkline: true,
  }),
  'sensor:energy': (d) => ({
    type: 'statistic', entity: d.id, stat: 'sum', period: 'day', unit: 'kWh',
  }),
  'sensor:co2': (d) => ({
    type: 'gauge', entity: d.id, min: 300, max: 2000, unit: 'ppm', showSparkline: false,
    severity: [{ from: 300, level: 'info' }, { from: 1000, level: 'warning' }, { from: 1500, level: 'critical' }],
  }),
  'sensor:pm25': (d) => ({
    type: 'gauge', entity: d.id, min: 0, max: 250, unit: 'µg/m³', showSparkline: false,
  }),
  // Catch-all numeric sensor — compact big-number readout. Safe because
  // `sensor-value` handles unit detection from the device itself.
  sensor: (d) => ({ type: 'sensor-value', entity: d.id, style: 'big' }),

  // -- Energy site / monitor -----------------------------------------------
  energy_site: (d) => ({
    type: 'statistic', entity: d.id, stat: 'change', period: 'day', unit: 'kWh',
  }),
  energy_monitor: (d) => ({
    type: 'gauge', entity: d.id, min: 0, max: 10000, unit: 'W', showSparkline: true,
  }),

  // -- Weather (composite) -------------------------------------------------
  // Parse through the schema so every defaulted field is populated without
  // listing 15+ toggle flags inline here.
  weather: (d) => weatherCardSchema.parse({ type: 'weather', entity: d.id }),

  // -- Locks ---------------------------------------------------------------
  // No bespoke lock-tile yet; switch-tile renders a clear on/off pill that
  // maps cleanly to locked/unlocked, with the device-detail page providing
  // the full LockControl when tapped.
  lock: (d) => ({ type: 'switch-tile', entity: d.id }),

  // -- Garage doors / generic door & window sensors ------------------------
  garage_door: (d) => ({ type: 'cover-tile', entity: d.id, showPositionControl: false, visual: 'garage', showPercentage: false }),
  // Binary door/window sensors render as sensor-value until a dedicated
  // door-state card exists.
  'sensor:door': (d) => ({ type: 'sensor-value', entity: d.id, style: 'big' }),
  'sensor:window': (d) => ({ type: 'sensor-value', entity: d.id, style: 'big' }),
  'sensor:motion': (d) => ({ type: 'sensor-value', entity: d.id, style: 'compact' }),

  // -- Sprinklers ----------------------------------------------------------
  sprinkler: (d) => ({ type: 'switch-tile', entity: d.id }),

  // -- Vacuums -------------------------------------------------------------
  vacuum: (d) => ({ type: 'button', entity: d.id, showState: true, tapAction: { type: 'toggle' } }),

  // -- Pool ----------------------------------------------------------------
  pool_body: (d) => ({ type: 'switch-tile', entity: d.id }),
  pool_pump: (d) => ({ type: 'switch-tile', entity: d.id }),
  pool_circuit: (d) => ({ type: 'switch-tile', entity: d.id }),
  pool_chemistry: (d) => ({ type: 'sensor-value', entity: d.id, style: 'big' }),

  // -- Network / Speedtest -------------------------------------------------
  network_device: (d) => ({ type: 'sensor-value', entity: d.id, style: 'compact' }),
  speedtest: (d) => ({ type: 'sensor-value', entity: d.id, style: 'big' }),

  // -- Water softener / sun / recipes -------------------------------------
  water_softener: (d) => ({ type: 'sensor-value', entity: d.id, style: 'big' }),
  sun: (d) => ({ type: 'sensor-value', entity: d.id, style: 'compact' }),
  recipe_library: (d) => ({ type: 'sensor-value', entity: d.id, style: 'compact' }),

  // -- Screensaver ---------------------------------------------------------
  screensaver: (d) => ({ type: 'switch-tile', entity: d.id }),

  // -- Helpers (input_*) ---------------------------------------------------
  helper_toggle: (d) => ({ type: 'switch-tile', entity: d.id }),
  helper_button: (d) => ({ type: 'button', entity: d.id, showState: false, tapAction: { type: 'toggle' } }),
  helper_counter: (d) => ({ type: 'sensor-value', entity: d.id, style: 'big' }),
  helper_timer: (d) => ({ type: 'sensor-value', entity: d.id, style: 'big' }),
  helper_number: (d) => ({ type: 'sensor-value', entity: d.id, style: 'big' }),
  helper_text: (d) => ({ type: 'sensor-value', entity: d.id, style: 'compact' }),
  helper_datetime: (d) => ({ type: 'sensor-value', entity: d.id, style: 'compact' }),
  helper_select: (d) => ({ type: 'sensor-value', entity: d.id, style: 'compact' }),
  helper_sensor: (d) => ({ type: 'sensor-value', entity: d.id, style: 'big' }),

  // -- Hub (metadata-only parent) ------------------------------------------
  hub: (d) => ({ type: 'sensor-value', entity: d.id, style: 'compact' }),
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Generic last-resort: a read-only sensor-value card. Chosen over `button`
 * because tapping an unknown device shouldn't fire a toggle — a dead-safe
 * readout is a better default when we genuinely don't know what we're
 * looking at. Every `DeviceType` in the union should have a specific map
 * entry; this is insurance for future types landing ahead of their
 * mapping.
 */
function genericFallback(device: DeviceState): CardDescriptor {
  return {
    type: 'sensor-value',
    entity: device.id,
    style: 'compact',
  };
}

// ---------------------------------------------------------------------------
// Compatible cards — drives the per-device override palette filter.
// ---------------------------------------------------------------------------

/**
 * Categorize a device type for compatibility decisions. "control" devices
 * can be toggled / commanded; "sensor" devices are read-only. Some types
 * (media_player, thermostat, vehicle) are both — the override picker lists
 * card types from either bucket for those.
 */
type DeviceKind = 'control' | 'sensor' | 'composite';

const DEVICE_KIND: Record<DeviceType, DeviceKind> = {
  // Controls
  light: 'control',
  switch: 'control',
  cover: 'control',
  fan: 'control',
  garage_door: 'control',
  lock: 'control',
  sprinkler: 'control',
  vacuum: 'control',
  screensaver: 'control',
  pool_body: 'control',
  pool_pump: 'control',
  pool_circuit: 'control',
  helper_toggle: 'control',
  helper_button: 'control',
  helper_number: 'control',
  helper_select: 'control',

  // Composite (both controls and readouts)
  media_player: 'composite',
  music_player: 'composite',
  thermostat: 'composite',
  vehicle: 'composite',
  energy_site: 'composite',

  // Sensors / read-only
  sensor: 'sensor',
  weather: 'sensor',
  camera: 'sensor',
  doorbell: 'sensor',
  speedtest: 'sensor',
  network_device: 'sensor',
  sun: 'sensor',
  water_softener: 'sensor',
  energy_monitor: 'sensor',
  pool_chemistry: 'sensor',
  recipe_library: 'sensor',
  helper_counter: 'sensor',
  helper_timer: 'sensor',
  helper_text: 'sensor',
  helper_datetime: 'sensor',
  helper_sensor: 'sensor',
  hub: 'sensor',
};

/**
 * Card types a user may pick for a given device. Filters the override
 * palette so a temperature sensor doesn't offer "alarm-panel" or
 * "camera" — only cards that can meaningfully render that kind of data.
 *
 * Rules of thumb:
 *   - Every device gets `sensor-value` (a big-number readout always works).
 *   - Every device also gets `button` (tap-to-navigate is universal).
 *   - Controls add their type-specific tile.
 *   - Sensors add `gauge` / `history-graph` / `statistic` when numeric.
 *   - Composites (vehicle, media_player, thermostat) add their bespoke
 *     composite card on top of the generic options.
 */
export function getCompatibleCards(device: DeviceState): string[] {
  const kind = DEVICE_KIND[device.type];
  const universal = ['sensor-value', 'button'];

  // Control-specific tiles
  const controlTile: Partial<Record<DeviceType, string>> = {
    light: 'light-tile',
    switch: 'switch-tile',
    cover: 'cover-tile',
    fan: 'fan-tile',
    garage_door: 'cover-tile',
    lock: 'switch-tile',
    sprinkler: 'switch-tile',
    screensaver: 'switch-tile',
    pool_body: 'switch-tile',
    pool_pump: 'switch-tile',
    pool_circuit: 'switch-tile',
    helper_toggle: 'switch-tile',
    helper_button: 'button',
  };

  // Composite-specific cards
  const compositeCard: Partial<Record<DeviceType, string>> = {
    media_player: 'media-tile',
    music_player: 'media-tile',
    thermostat: 'thermostat',
    vehicle: 'vehicle',
  };

  // Tesla vehicles get the rich tesla card in addition to the generic vehicle tile
  const isTesla = device.type === 'vehicle' && (device as import('@ha/shared').VehicleState).compositorModel;

  // Numeric sensors — add data-viz options
  const numericSensor =
    kind === 'sensor' &&
    (device.type === 'sensor' ||
      device.type === 'energy_monitor' ||
      device.type === 'speedtest' ||
      device.type === 'water_softener' ||
      device.type === 'helper_counter' ||
      device.type === 'helper_number' ||
      device.type === 'helper_sensor');

  const result = new Set<string>(universal);

  const tile = controlTile[device.type];
  if (tile) result.add(tile);

  const composite = compositeCard[device.type];
  if (composite) result.add(composite);

  if (numericSensor) {
    result.add('gauge');
    result.add('history-graph');
    result.add('statistic');
  }

  // Cameras get the camera card explicitly
  if (device.type === 'camera' || device.type === 'doorbell') {
    result.add('camera');
  }

  // Vehicles can also be shown on a map; Tesla vehicles also get the rich tesla card
  if (device.type === 'vehicle') {
    result.add('map');
    if (isTesla) result.add('tesla');
  }

  return Array.from(result);
}

/**
 * Resolve the default card for a device.
 *
 * @param device  The device to render.
 * @param override Optional user override (full `CardDescriptor`). When set,
 *                 returned as-is — entity binding is the caller's
 *                 responsibility, matching the "full descriptor" contract
 *                 from the override UI.
 */
export function resolveDefaultCard(
  device: DeviceState,
  override?: CardDescriptor | null,
): CardDescriptor {
  if (override) return override;

  // Specific key first (type:device_class)
  if (device.device_class) {
    const specific = DEVICE_CARD_MAP[`${device.type}:${device.device_class}` as MapKey];
    if (specific) return specific(device);
  }

  // Coarse key
  const coarse = DEVICE_CARD_MAP[device.type as MapKey];
  if (coarse) return coarse(device);

  return genericFallback(device);
}

/**
 * Export the map keys for documentation / admin tooling. Useful for the
 * future "what card would this device get?" preview in the admin UI.
 */
export function listMappedKeys(): MapKey[] {
  return Object.keys(DEVICE_CARD_MAP) as MapKey[];
}
