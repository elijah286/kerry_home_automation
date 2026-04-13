// ---------------------------------------------------------------------------
// Typed device model — discriminated union on `type`
// ---------------------------------------------------------------------------

export type IntegrationId =
  | 'lutron' | 'yamaha' | 'paprika' | 'pentair' | 'tesla' | 'unifi' | 'sony'
  | 'weather' | 'xbox' | 'meross' | 'roborock' | 'rachio'
  | 'esphome' | 'wyze' | 'zwave' | 'ring' | 'speedtest' | 'unifi_network' | 'vizio' | 'samsung' | 'spotify'
  | 'ecobee' | 'sun'
  | 'calendar' | 'rainsoft' | 'sense'
  | 'screensaver'
  | 'helpers';

export type FanSpeed = 'off' | 'low' | 'medium' | 'medium-high' | 'high';

export interface DeviceBase {
  id: string;
  name: string;
  displayName?: string;
  aliases?: string[];
  integration: IntegrationId;
  areaId: string | null;
  userAreaId?: string;
  available: boolean;
  lastChanged: number;   // epoch ms
  lastUpdated: number;
  /** If set, this device is a child entity of the referenced parent device */
  parentDeviceId?: string;
}

// -- Light (Lutron dimmers) --------------------------------------------------

export interface LightState extends DeviceBase {
  type: 'light';
  on: boolean;
  /** 0-100 (Lutron native percentage) */
  brightness: number;
}

// -- Cover (Lutron shades) ---------------------------------------------------

export interface CoverState extends DeviceBase {
  type: 'cover';
  /** 0 = closed, 100 = fully open */
  position: number;
  moving: 'opening' | 'closing' | 'stopped';
}

// -- Fan (Lutron fans) -------------------------------------------------------

export interface FanState extends DeviceBase {
  type: 'fan';
  on: boolean;
  speed: FanSpeed;
}

// -- Switch (Lutron on/off switches) -----------------------------------------

export interface SwitchState extends DeviceBase {
  type: 'switch';
  on: boolean;
}

// -- Media Player (Yamaha MusicCast) -----------------------------------------

export interface MediaPlayerState extends DeviceBase {
  type: 'media_player';
  power: 'on' | 'standby';
  /** 0-100 */
  volume: number;
  muted: boolean;
  source: string;
  sourceList: string[];
  soundProgram: string;
  soundProgramList: string[];
  zone: string;
  model: string;
  host: string;
}

// -- Vehicle (Tesla) --------------------------------------------------------

export type VehicleSleepState = 'online' | 'asleep' | 'offline';

export interface VehicleState extends DeviceBase {
  type: 'vehicle';
  vin: string;
  sleepState: VehicleSleepState;
  locked: boolean;
  /** GPS latitude */
  latitude: number | null;
  /** GPS longitude */
  longitude: number | null;
  /** Interior temp in Celsius */
  insideTemp: number | null;
  /** Exterior temp in Celsius */
  outsideTemp: number | null;
  climateOn: boolean;
  driverTempSetting: number;
  passengerTempSetting: number;
  /** 0-100 */
  batteryLevel: number;
  /** Estimated range in miles */
  batteryRange: number;
  /** Target charge limit 0-100 */
  chargeLimitSoc: number;
  chargeState: 'disconnected' | 'stopped' | 'charging' | 'complete';
  /** Charge rate in miles/hr */
  chargeRate: number;
  /** Charger power in kW */
  chargerPower: number;
  /** Charger voltage in V */
  chargerVoltage: number | null;
  /** Charger actual current in A */
  chargerActualCurrent: number | null;
  /** Energy added this session in kWh */
  chargeEnergyAdded: number;
  /** Estimated hours to full charge */
  timeToFullCharge: number;
  /** Whether the charge port door is open */
  chargePortOpen: boolean;
  /** Scheduled charging start time (ISO string) */
  scheduledChargingStartTime: string | null;
  /** Whether preconditioning is enabled for charging */
  preconditioningEnabled: boolean;
  trunkOpen: boolean;
  frunkOpen: boolean;
  sentryMode: boolean;
  /** Whether the user is present in the vehicle */
  isUserPresent: boolean;
  /** Whether any window is open */
  windowsOpen: boolean;
  odometer: number;
  softwareVersion: string;
  /** Current speed in mph */
  speed: number | null;
  /** Drive power in kW (negative = regen) */
  power: number | null;
  /** Compass heading in degrees */
  heading: number | null;
  /** D/R/P/N or null when parked */
  shiftState: string | null;
  /** Seat heater level 0-3 (driver) */
  seatHeaterLeft: number;
  /** Seat heater level 0-3 (passenger) */
  seatHeaterRight: number;
  /** Steering wheel heater on */
  steeringWheelHeater: boolean;
  /** Defrost mode */
  defrostMode: number;
  /** Epoch ms for last drive/GPS sample when the API provides it */
  locationUpdatedAt?: number | null;
  /** Tesla GUI distance units (e.g. mi/hr, km/hr) from gui_settings */
  guiDistanceUnits?: string | null;
  /** Tesla GUI temperature units (C or F) from gui_settings */
  guiTempUnits?: string | null;
  /** Usable battery % when the API reports it (may match batteryLevel otherwise) */
  usableBatteryLevel?: number | null;
  /**
   * Primitive fields from each `vehicle_data` slice (charge_state, climate_state, etc.).
   * Keys are `slice.field` — used for Locations, device detail, and diagnostics.
   */
  vehicleTelemetry?: Record<string, string | number | boolean | null>;
}

// -- Energy Site (Tesla Powerwall / Solar) -----------------------------------

export type EnergySiteOperationMode = 'self_consumption' | 'backup' | 'autonomous';

export interface WallConnectorState {
  din: string;
  /** Wall connector power draw in watts */
  power: number;
  /** 0 = disconnected, 1 = connected, 2 = charging, etc. */
  state: number;
  /** VIN of connected vehicle, if any */
  vin: string | null;
}

export interface EnergySiteState extends DeviceBase {
  type: 'energy_site';
  siteId: string;
  /** Solar production in watts */
  solarPower: number;
  /** Battery power in watts (positive = discharging) */
  batteryPower: number;
  /** Grid power in watts (positive = importing) */
  gridPower: number;
  /** Home load in watts */
  loadPower: number;
  /** Grid services power in watts */
  gridServicesPower: number;
  /** Generator power in watts */
  generatorPower: number;
  /** Battery level 0-100 */
  batteryPercentage: number;
  /** Total battery pack energy in Wh */
  totalPackEnergy: number;
  /** Remaining battery energy in Wh */
  energyLeft: number;
  backupReservePercent: number;
  operationMode: EnergySiteOperationMode;
  stormModeEnabled: boolean;
  gridStatus: 'connected' | 'islanded';
  /** Whether the system can provide backup */
  backupCapable: boolean;
  /** Whether grid services are actively running */
  gridServicesActive: boolean;
  /** Number of Powerwall units (from site_info) */
  batteryCount: number;
  /** Wall connector (EV charger) data */
  wallConnectors: WallConnectorState[];
}

// -- Pool Body (Pentair IntelliCenter) --------------------------------------

export type PoolBodyKind = 'pool' | 'spa';

export interface PoolBodyState extends DeviceBase {
  type: 'pool_body';
  kind: PoolBodyKind;
  on: boolean;
  /** Current water temp in °F */
  currentTemp: number | null;
  /** Heater setpoint in °F */
  setPoint: number | null;
  heaterOn: boolean;
}

// -- Pool Pump (Pentair IntelliCenter) --------------------------------------

export interface PoolPumpState extends DeviceBase {
  type: 'pool_pump';
  on: boolean;
  /** RPM for variable-speed pumps */
  rpm: number | null;
  /** Watts drawn */
  watts: number | null;
}

// -- Pool Circuit (Pentair IntelliCenter lights / aux) ----------------------

export interface PoolCircuitState extends DeviceBase {
  type: 'pool_circuit';
  on: boolean;
  /** Circuit function: e.g. 'generic', 'light', 'intellibrite', 'spillway' */
  circuitFunction: string;
}

// -- Pool Chemistry (Pentair IntelliChem) -----------------------------------

export interface PoolChemistryState extends DeviceBase {
  type: 'pool_chemistry';
  ph: number | null;
  orp: number | null;
  saltPpm: number | null;
  /** Langelier Saturation Index */
  saturationIndex: number | null;
  waterTemp: number | null;
  /** pH target setpoint */
  phSetpoint: number | null;
  /** ORP target setpoint in mV */
  orpSetpoint: number | null;
  /** Alkalinity in ppm */
  alkalinity: number | null;
  /** Calcium hardness in ppm */
  calciumHardness: number | null;
  /** Cyanuric acid (CYA) in ppm */
  cya: number | null;
}

// -- Camera (UniFi Protect via go2rtc) --------------------------------------

export interface CameraState extends DeviceBase {
  type: 'camera';
  online: boolean;
  host: string;
  channel?: string;
}

// -- Recipe Library (Paprika 3) ---------------------------------------------

export interface RecipeLibraryState extends DeviceBase {
  type: 'recipe_library';
  recipeCount: number;
  lastSync: number | null;
}

// -- Weather (NWS) -----------------------------------------------------------

export interface WeatherForecastDay {
  name: string;
  temperature: number | null;
  temperatureUnit: string;
  shortForecast: string;
  detailedForecast: string;
  isDaytime: boolean;
}

export interface WeatherState extends DeviceBase {
  type: 'weather';
  temperature: number | null;
  temperatureUnit: string;
  humidity: number | null;
  windSpeed: string | null;
  windDirection: string | null;
  condition: string;
  icon: string | null;
  forecast: WeatherForecastDay[];
}

// -- Garage Door (Meross) ----------------------------------------------------

export interface GarageDoorState extends DeviceBase {
  type: 'garage_door';
  open: boolean;
  opening: boolean;
  closing: boolean;
}

// -- Sensor (generic) --------------------------------------------------------

export type SensorKind = 'motion' | 'temperature' | 'humidity' | 'contact' | 'battery' | 'generic';

export interface SensorState extends DeviceBase {
  type: 'sensor';
  sensorType: SensorKind;
  value: number | boolean | string | null;
  unit: string | null;
}

// -- Sprinkler (Rachio) ------------------------------------------------------

export interface SprinklerZone {
  id: string;
  name: string;
  enabled: boolean;
  running: boolean;
}

export interface SprinklerState extends DeviceBase {
  type: 'sprinkler';
  running: boolean;
  currentZone: string | null;
  timeRemaining: number | null;
  zones: SprinklerZone[];
  standby: boolean;
  rainDelay: boolean;
}

// -- Vacuum (Roborock) -------------------------------------------------------

export type VacuumStatus = 'cleaning' | 'docked' | 'idle' | 'returning' | 'paused' | 'error';

export interface VacuumState extends DeviceBase {
  type: 'vacuum';
  status: VacuumStatus;
  battery: number;
  fanSpeed: string;
  areaCleaned: number | null;
  cleaningTime: number | null;
  errorMessage: string | null;
  /** When set (Roborock cloud), client may load live map via GET /api/roborock/map?deviceId=… */
  mapUpdatedAt?: number | null;
}

// -- Doorbell (Ring) ---------------------------------------------------------

export interface DoorbellState extends DeviceBase {
  type: 'doorbell';
  battery: number | null;
  lastMotion: number | null;
  lastRing: number | null;
  online: boolean;
  hasCamera: boolean;
  streamUrl: string | null;
}

// -- Network Device (UniFi Network) ------------------------------------------

export interface NetworkDeviceState extends DeviceBase {
  type: 'network_device';
  mac: string;
  ip: string | null;
  deviceType: 'ap' | 'switch' | 'gateway' | 'client';
  connected: boolean;
  uptime: number | null;
  txBytes: number | null;
  rxBytes: number | null;
  clients: number | null;
  model: string | null;
  /**
   * Other HomeOS devices that appear to be the same physical device (shared MAC,
   * or same LAN IP as another entity’s `host`, e.g. Xbox / Yamaha).
   */
  linkedDeviceIds?: string[];
  /** Populated for UniFi clients when the controller supplies extra fields. */
  unifiClientInfo?: {
    wired: boolean;
    ssid: string | null;
    vlan: number | null;
    /** Manufacturer string from the controller (OUI / fingerprint), when present */
    vendor: string | null;
    /** User note from UniFi (device properties), when present */
    note: string | null;
  };
}

// -- Speedtest ---------------------------------------------------------------

export interface SpeedtestState extends DeviceBase {
  type: 'speedtest';
  downloadMbps: number | null;
  uploadMbps: number | null;
  pingMs: number | null;
  server: string | null;
  lastRun: number | null;
}

// -- Thermostat (Ecobee / HA-parity) -----------------------------------------

export type ThermostatMode = 'heat' | 'cool' | 'auto' | 'off' | 'auxHeatOnly';
export type ThermostatFanMode = 'auto' | 'on';

/** Mirrors Home Assistant ClimateEntity `hvac_action`. */
export type ThermostatHvacAction = 'idle' | 'heating' | 'cooling' | 'fan' | 'drying';

export interface ThermostatSensor {
  /** Ecobee remote sensor id (e.g. ei:0:1) */
  id: string;
  name: string;
  /** Ecobee sensor type: thermostat, ecobee3_remote, etc. */
  sensorType: string;
  /** Room sensor wireless code when applicable */
  code?: string;
  temperature: number | null;
  humidity: number | null;
  occupancy: boolean;
}

export interface ThermostatClimateInfo {
  climateRef: string;
  name: string;
}

/** Outdoor / forecast snapshot from Ecobee (per-thermostat weather object). */
export interface EcobeeOutdoorWeather {
  temperatureF: number | null;
  highF: number | null;
  lowF: number | null;
  weatherSymbol: number | null;
  /** Human-readable condition when symbol is mapped */
  condition: string | null;
  humidity: number | null;
  pressure: number | null;
  windSpeedMph: number | null;
  windBearing: number | null;
  station: string | null;
  timestamp: string | null;
}

/**
 * Ecobee-only fields matching Home Assistant climate attributes + related entities
 * (ventilator, aux heat, compressor min temp, occupancy, etc.).
 */
export interface EcobeeThermostatDetails {
  equipmentRunning: string;
  fanRunning: boolean;
  /** Comfort setting name for active program slot (program.currentClimateRef) */
  climateMode: string | null;
  /**
   * Active preset / hold semantics aligned with HA ecobee climate:
   * away, home, sleep, temp, vacation, away_indefinitely, or custom comfort name.
   */
  presetMode: string | null;
  /** Comfort settings from program (name + ref) */
  climates: ThermostatClimateInfo[];
  /** Sensor names participating in the current preset’s climate (HA active_sensors) */
  activeSensorNames: string[];
  fanMinOnTime: number;
  holdAction: string | null;
  /** Minimum heat/cool separation in °F (settings.heatCoolMinDelta / 10) */
  heatCoolMinDelta: number;
  targetHumidity: number | null;
  hasHumidifierControl: boolean;
  vacationName: string | null;
  outdoor: EcobeeOutdoorWeather | null;
  hasHeatPump: boolean;
  ventilatorType: string;
  ventilatorTimerOn: boolean;
  ventilatorMinOnTimeHome: number;
  ventilatorMinOnTimeAway: number;
  compressorProtectionMinTempF: number | null;
  autoAwayEnabled: boolean | null;
  followMeEnabled: boolean | null;
  dstEnabled: boolean | null;
  micEnabled: boolean | null;
  dehumidifierLevel: number | null;
}

export interface ThermostatState extends DeviceBase {
  type: 'thermostat';
  temperature: number | null;
  humidity: number | null;
  hvacMode: ThermostatMode;
  fanMode: ThermostatFanMode;
  heatSetpoint: number;
  coolSetpoint: number;
  /** Legacy aggregate; mirrors hvacAction without `drying` */
  running: 'heating' | 'cooling' | 'fan' | 'idle';
  hvacAction: ThermostatHvacAction;
  sensors: ThermostatSensor[];
  model: string;
  /** Populated for integration === 'ecobee' */
  ecobee?: EcobeeThermostatDetails;
}

/** Preset keys for UI + set_preset_mode (Home Assistant ecobee climate parity). */
export function ecobeeSelectablePresetKeys(climates: { name: string }[]): string[] {
  const hass = (name: string) => {
    if (name === 'Away') return 'away';
    if (name === 'Home') return 'home';
    if (name === 'Sleep') return 'sleep';
    return name;
  };
  const keys = [...new Set(climates.map((c) => hass(c.name)))];
  if (!keys.includes('away_indefinitely')) keys.push('away_indefinitely');
  return keys;
}

// -- Music Player (Spotify) --------------------------------------------------

export interface MusicPlayerState extends DeviceBase {
  type: 'music_player';
  playing: boolean;
  trackName: string | null;
  artistName: string | null;
  albumName: string | null;
  albumArt: string | null;
  progressMs: number | null;
  durationMs: number | null;
  volume: number | null;
  shuffle: boolean;
  repeat: 'off' | 'track' | 'context';
  deviceName: string | null;
  deviceType: string | null;
}

// -- Sun (Solar position & daylight) -----------------------------------------

export interface SunState extends DeviceBase {
  type: 'sun';
  /** ISO timestamp of today's sunrise */
  sunrise: string;
  /** ISO timestamp of today's sunset */
  sunset: string;
  /** ISO timestamp of solar noon */
  solarNoon: string;
  /** Current sun elevation angle in degrees (negative = below horizon) */
  elevation: number;
  /** Current sun azimuth in degrees (0 = north, 90 = east) */
  azimuth: number;
  /** Max elevation for today in degrees */
  maxElevation: number;
  /** Current phase: 'night' | 'astronomical_twilight' | 'nautical_twilight' | 'civil_twilight' | 'day' */
  phase: SunPhase;
  /** 0-100 — how bright it should be based on sun position alone (ignores clouds) */
  daylightPercent: number;
  /** Total daylight duration in seconds */
  daylightDuration: number;
  /** ISO timestamp of dawn (civil twilight start) */
  dawn: string;
  /** ISO timestamp of dusk (civil twilight end) */
  dusk: string;
  /** ISO timestamp of golden hour start */
  goldenHour: string;
  /** ISO timestamp of golden hour end (sunset end) */
  goldenHourEnd: string;
}

export type SunPhase = 'night' | 'astronomical_twilight' | 'nautical_twilight' | 'civil_twilight' | 'day';

// -- Water softener (RainSoft Remind cloud) ----------------------------------

export interface WaterSoftenerState extends DeviceBase {
  type: 'water_softener';
  systemStatus: string;
  /** 0–100 */
  capacityPercent: number;
  /** 0–100 salt level vs tank capacity */
  saltPercent: number;
  lastRegen: string | null;
  nextRegen: string | null;
  model: string | null;
}

// -- Energy monitor (Sense) ---------------------------------------------------

export interface EnergyMonitorState extends DeviceBase {
  type: 'energy_monitor';
  /** Whole-home consumption (W) */
  powerW: number;
  /** Solar production (W), 0 if none */
  solarW: number;
  frequencyHz: number | null;
  /** Per-leg RMS voltage when reported */
  voltage: number[] | null;
}

// -- Helper device states ----------------------------------------------------

export interface HelperToggleState extends DeviceBase {
  type: 'helper_toggle';
  on: boolean;
}

export interface HelperCounterState extends DeviceBase {
  type: 'helper_counter';
  value: number;
  min: number;
  max: number;
  step: number;
}

export type HelperTimerStatus = 'idle' | 'active' | 'paused';

export interface HelperTimerState extends DeviceBase {
  type: 'helper_timer';
  status: HelperTimerStatus;
  /** Remaining seconds */
  remaining: number;
  /** Total duration in seconds */
  duration: number;
  /** Epoch ms when timer finished, or null */
  finishedAt: number | null;
}

export interface HelperButtonState extends DeviceBase {
  type: 'helper_button';
  /** Epoch ms of last press, or null */
  lastPressed: number | null;
}

export interface HelperNumberState extends DeviceBase {
  type: 'helper_number';
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string | null;
  mode: 'slider' | 'box';
}

export interface HelperTextState extends DeviceBase {
  type: 'helper_text';
  value: string;
}

export interface HelperDateTimeState extends DeviceBase {
  type: 'helper_datetime';
  value: string | null;
  mode: 'date' | 'time' | 'datetime';
}

export interface HelperSelectState extends DeviceBase {
  type: 'helper_select';
  value: string | null;
  options: string[];
}

export type HelperSensorKind =
  | 'derivative' | 'integral' | 'threshold' | 'group'
  | 'combine' | 'history_stats' | 'random' | 'switch_as_x';

export interface HelperSensorState extends DeviceBase {
  type: 'helper_sensor';
  value: number | boolean | null;
  unit: string | null;
  helperKind: HelperSensorKind;
}

// -- Screensaver -------------------------------------------------------------

export type ScreensaverEffect = 'ken_burns' | 'pan' | 'zoom' | 'none';

export interface ScreensaverState extends DeviceBase {
  type: 'screensaver';
  on: boolean;
  /** User this screensaver instance is assigned to */
  userId: string;
  /** Number of photos available in the cache */
  photoCount: number;
  /** Index of the currently displayed photo */
  currentPhotoIndex: number;
  /** Rotation interval in seconds */
  rotationIntervalSec: number;
  /** Active pan/zoom effect */
  effect: ScreensaverEffect;
}

// -- Hub (ESPHome board / generic parent device) ----------------------------

export interface HubState extends DeviceBase {
  type: 'hub';
  model: string | null;
  firmwareVersion: string | null;
}

// -- Discriminated union -----------------------------------------------------

export type DeviceState =
  | LightState
  | CoverState
  | FanState
  | SwitchState
  | MediaPlayerState
  | VehicleState
  | EnergySiteState
  | PoolBodyState
  | PoolPumpState
  | PoolCircuitState
  | PoolChemistryState
  | CameraState
  | RecipeLibraryState
  | WeatherState
  | GarageDoorState
  | SensorState
  | SprinklerState
  | VacuumState
  | DoorbellState
  | NetworkDeviceState
  | SpeedtestState
  | ThermostatState
  | MusicPlayerState
  | SunState
  | WaterSoftenerState
  | EnergyMonitorState
  | ScreensaverState
  | HelperToggleState
  | HelperCounterState
  | HelperTimerState
  | HelperButtonState
  | HelperNumberState
  | HelperTextState
  | HelperDateTimeState
  | HelperSelectState
  | HelperSensorState
  | HubState;

export type DeviceType = DeviceState['type'];

/**
 * Validate device hierarchy consistency. Returns a list of violation messages.
 * Rules:
 *  1. If a parentDeviceId references a device that doesn't exist, that's an error.
 *  2. For any integration+entry combo, if some devices have parentDeviceId and some don't
 *     (excluding hub devices themselves), that's inconsistent.
 */
export function validateDeviceHierarchy(devices: DeviceState[]): string[] {
  const errors: string[] = [];
  const ids = new Set(devices.map((d) => d.id));

  // Rule 1: dangling parent references
  for (const d of devices) {
    if (d.parentDeviceId && !ids.has(d.parentDeviceId)) {
      errors.push(`Device "${d.id}" references non-existent parent "${d.parentDeviceId}"`);
    }
  }

  // Rule 2: per entry, either all non-hub devices have a parent or none do
  const entryMap = new Map<string, { withParent: string[]; withoutParent: string[] }>();
  for (const d of devices) {
    if (d.type === 'hub') continue;
    const parts = d.id.split('.');
    if (parts.length < 3) continue;
    const entryKey = `${parts[0]}.${parts[1]}`;
    let bucket = entryMap.get(entryKey);
    if (!bucket) { bucket = { withParent: [], withoutParent: [] }; entryMap.set(entryKey, bucket); }
    if (d.parentDeviceId) bucket.withParent.push(d.id);
    else bucket.withoutParent.push(d.id);
  }
  for (const [entry, bucket] of entryMap) {
    if (bucket.withParent.length > 0 && bucket.withoutParent.length > 0) {
      errors.push(`Entry "${entry}" has inconsistent hierarchy: ${bucket.withParent.length} devices with parent, ${bucket.withoutParent.length} without`);
    }
  }

  return errors;
}
