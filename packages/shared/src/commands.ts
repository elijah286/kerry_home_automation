// ---------------------------------------------------------------------------
// Typed device commands — discriminated union on `type`
// ---------------------------------------------------------------------------

import type { FanSpeed, EnergySiteOperationMode, PoolBodyKind, ThermostatMode, ThermostatFanMode } from './devices.js';

export type LightCommand = {
  type: 'light';
  deviceId: string;
  action: 'turn_on' | 'turn_off' | 'set_brightness';
  /** 0-100 percentage */
  brightness?: number;
};

export type CoverCommand = {
  type: 'cover';
  deviceId: string;
  action: 'open' | 'close' | 'set_position';
  /** 0-100 */
  position?: number;
};

export type FanCommand = {
  type: 'fan';
  deviceId: string;
  action: 'turn_on' | 'turn_off' | 'set_speed';
  speed?: FanSpeed;
};

export type SwitchCommand = {
  type: 'switch';
  deviceId: string;
  action: 'turn_on' | 'turn_off';
};

export type MediaPlayerCommand = {
  type: 'media_player';
  deviceId: string;
  action:
    | 'power_on'
    | 'power_off'
    | 'set_volume'
    | 'mute'
    | 'unmute'
    | 'set_source'
    | 'set_sound_program'
    | 'media_play'
    | 'media_pause'
    | 'media_stop';
  volume?: number;
  source?: string;
  soundProgram?: string;
};

export type VehicleCommand = {
  type: 'vehicle';
  deviceId: string;
  action:
    | 'door_lock'
    | 'door_unlock'
    | 'climate_start'
    | 'climate_stop'
    | 'charge_start'
    | 'charge_stop'
    | 'actuate_trunk'
    | 'flash_lights'
    | 'honk_horn'
    | 'set_charge_limit'
    | 'set_temps';
  /** 0-100 for set_charge_limit */
  chargeLimit?: number;
  /** Celsius for set_temps */
  driverTemp?: number;
  passengerTemp?: number;
  /** 'rear' | 'front' for actuate_trunk */
  trunk?: 'rear' | 'front';
};

export type EnergySiteCommand = {
  type: 'energy_site';
  deviceId: string;
  action: 'set_backup_reserve' | 'set_operation_mode' | 'set_storm_mode';
  backupReservePercent?: number;
  operationMode?: EnergySiteOperationMode;
  stormModeEnabled?: boolean;
};

export type PoolBodyCommand = {
  type: 'pool_body';
  deviceId: string;
  action: 'turn_on' | 'turn_off' | 'set_setpoint';
  /** Temperature setpoint in °F */
  setPoint?: number;
};

export type PoolPumpCommand = {
  type: 'pool_pump';
  deviceId: string;
  action: 'turn_on' | 'turn_off';
};

export type PoolCircuitCommand = {
  type: 'pool_circuit';
  deviceId: string;
  action: 'turn_on' | 'turn_off';
};

export type GarageDoorCommand = {
  type: 'garage_door';
  deviceId: string;
  action: 'open' | 'close';
};

export type SprinklerCommand = {
  type: 'sprinkler';
  deviceId: string;
  action: 'start_zone' | 'stop' | 'standby_on' | 'standby_off' | 'rain_delay';
  zoneId?: string;
  duration?: number;
  rainDelayDays?: number;
};

export type VacuumCommand = {
  type: 'vacuum';
  deviceId: string;
  action: 'start' | 'stop' | 'pause' | 'return_dock' | 'find' | 'set_fan_speed';
  fanSpeed?: string;
};

export type ThermostatCommand = {
  type: 'thermostat';
  deviceId: string;
  action:
    | 'set_hvac_mode'
    | 'set_fan_mode'
    | 'set_heat_setpoint'
    | 'set_cool_setpoint'
    | 'resume_program'
    | 'set_preset_mode'
    | 'set_fan_min_on_time'
    | 'set_target_humidity'
    | 'create_vacation'
    | 'delete_vacation'
    | 'set_ventilator_timer'
    | 'set_ventilator_min_home'
    | 'set_ventilator_min_away'
    | 'set_compressor_min_temp'
    | 'set_aux_heat_only'
    | 'set_dst_mode'
    | 'set_mic_mode'
    | 'set_occupancy_modes'
    | 'set_sensors_for_climate';
  hvacMode?: ThermostatMode;
  fanMode?: ThermostatFanMode;
  temperature?: number;
  resumeAll?: boolean;
  /** HA ecobee preset id: away, home, sleep, temp, away_indefinitely, vacation, next_transition, indefinite, or a comfort name */
  presetMode?: string;
  fanMinOnTime?: number;
  targetHumidity?: number;
  vacation?: {
    name: string;
    coolTempF: number;
    heatTempF: number;
    startDate?: string;
    startTime?: string;
    endDate?: string;
    endTime?: string;
    fanMode?: 'auto' | 'on';
    fanMinOnTime?: number;
  };
  vacationName?: string;
  ventilatorOn?: boolean;
  ventilatorMinHome?: number;
  ventilatorMinAway?: number;
  compressorMinTempF?: number;
  auxHeatOnly?: boolean;
  dstEnabled?: boolean;
  micEnabled?: boolean;
  autoAway?: boolean;
  followMe?: boolean;
  /** Comfort setting name (e.g. "Home") when updating sensor participation */
  climateComfortName?: string;
  /** Ecobee remote sensor ids (e.g. rs:100) — backend formats for API */
  sensorIds?: string[];
};

export type DoorbellCommand = {
  type: 'doorbell';
  deviceId: string;
  action: 'snapshot';
};

export type MusicPlayerCommand = {
  type: 'music_player';
  deviceId: string;
  action: 'play' | 'pause' | 'next' | 'previous' | 'set_volume' | 'set_shuffle' | 'set_repeat' | 'transfer';
  volume?: number;
  shuffle?: boolean;
  repeat?: 'off' | 'track' | 'context';
  deviceId_target?: string;
};

// -- Helper commands ----------------------------------------------------------

export type HelperToggleCommand = {
  type: 'helper_toggle';
  deviceId: string;
  action: 'turn_on' | 'turn_off' | 'toggle';
};

export type HelperCounterCommand = {
  type: 'helper_counter';
  deviceId: string;
  action: 'increment' | 'decrement' | 'reset' | 'set';
  value?: number;
};

export type HelperTimerCommand = {
  type: 'helper_timer';
  deviceId: string;
  action: 'start' | 'pause' | 'cancel' | 'finish';
  /** Optional override duration in seconds */
  duration?: number;
};

export type HelperButtonCommand = {
  type: 'helper_button';
  deviceId: string;
  action: 'press';
};

export type HelperNumberCommand = {
  type: 'helper_number';
  deviceId: string;
  action: 'set' | 'increment' | 'decrement';
  value?: number;
};

export type HelperTextCommand = {
  type: 'helper_text';
  deviceId: string;
  action: 'set';
  value: string;
};

export type HelperDateTimeCommand = {
  type: 'helper_datetime';
  deviceId: string;
  action: 'set';
  value: string;
};

export type HelperSelectCommand = {
  type: 'helper_select';
  deviceId: string;
  action: 'set';
  value: string;
};

export type DeviceCommand =
  | LightCommand
  | CoverCommand
  | FanCommand
  | SwitchCommand
  | MediaPlayerCommand
  | VehicleCommand
  | EnergySiteCommand
  | PoolBodyCommand
  | PoolPumpCommand
  | PoolCircuitCommand
  | GarageDoorCommand
  | SprinklerCommand
  | VacuumCommand
  | ThermostatCommand
  | DoorbellCommand
  | MusicPlayerCommand
  | HelperToggleCommand
  | HelperCounterCommand
  | HelperTimerCommand
  | HelperButtonCommand
  | HelperNumberCommand
  | HelperTextCommand
  | HelperDateTimeCommand
  | HelperSelectCommand;
