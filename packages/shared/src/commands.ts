// ---------------------------------------------------------------------------
// Typed device commands — discriminated union on `type`
// ---------------------------------------------------------------------------

import type { FanSpeed } from './devices.js';

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

export type DeviceCommand =
  | LightCommand
  | CoverCommand
  | FanCommand
  | SwitchCommand
  | MediaPlayerCommand;
