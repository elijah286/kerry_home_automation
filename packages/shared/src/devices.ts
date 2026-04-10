// ---------------------------------------------------------------------------
// Typed device model — discriminated union on `type`
// ---------------------------------------------------------------------------

export type IntegrationId = 'lutron' | 'yamaha' | 'paprika' | 'pentair' | 'tesla';

export type FanSpeed = 'off' | 'low' | 'medium' | 'medium-high' | 'high';

export interface DeviceBase {
  id: string;
  name: string;
  integration: IntegrationId;
  areaId: string | null;
  available: boolean;
  lastChanged: number;   // epoch ms
  lastUpdated: number;
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

// -- Discriminated union -----------------------------------------------------

export type DeviceState =
  | LightState
  | CoverState
  | FanState
  | SwitchState
  | MediaPlayerState;

export type DeviceType = DeviceState['type'];
