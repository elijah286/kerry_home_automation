export const ENTITY_DOMAINS = [
  'light', 'switch', 'sensor', 'binary_sensor', 'climate', 'cover',
  'fan', 'lock', 'media_player', 'camera', 'vacuum', 'alarm_control_panel',
  'water_heater', 'remote', 'button', 'number', 'select', 'person',
  'device_tracker', 'weather', 'scene', 'script', 'automation', 'input_boolean',
  'input_number', 'input_select', 'input_button', 'input_datetime', 'input_text',
  'timer', 'counter', 'calendar', 'siren', 'event', 'update', 'notify',
  'image', 'text', 'time', 'todo', 'zone', 'sun', 'schedule', 'tts',
] as const;

export type EntityDomain = typeof ENTITY_DOMAINS[number];

export interface EntityState {
  entity_id: string;
  domain: EntityDomain;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: number;
  last_updated: number;
}

export interface LightAttributes {
  brightness?: number;
  color_temp?: number;
  rgb_color?: [number, number, number];
  color_mode?: 'brightness' | 'color_temp' | 'rgb' | 'xy' | 'hs' | 'onoff';
  supported_color_modes?: string[];
  min_mireds?: number;
  max_mireds?: number;
  friendly_name?: string;
}

export interface ClimateAttributes {
  temperature?: number;
  target_temp_high?: number;
  target_temp_low?: number;
  current_temperature?: number;
  current_humidity?: number;
  hvac_action?: 'idle' | 'heating' | 'cooling' | 'fan';
  hvac_modes?: string[];
  fan_mode?: string;
  fan_modes?: string[];
  preset_mode?: string;
  preset_modes?: string[];
}

export interface CoverAttributes {
  current_position?: number;
  current_tilt_position?: number;
  supported_features?: number;
}

export interface MediaPlayerAttributes {
  source?: string;
  source_list?: string[];
  volume_level?: number;
  is_volume_muted?: boolean;
  media_title?: string;
  media_artist?: string;
  media_content_type?: string;
  app_name?: string;
}

export interface SensorAttributes {
  unit_of_measurement?: string;
  device_class?: string;
  state_class?: string;
  native_value?: number | string;
}

export interface PersonAttributes {
  source?: string;
  latitude?: number;
  longitude?: number;
  gps_accuracy?: number;
}

export interface CameraAttributes {
  stream_url?: string;
  is_streaming?: boolean;
  frontend_stream_type?: string;
}

export interface AlarmAttributes {
  code_arm_required?: boolean;
  supported_features?: number;
}

export interface VacuumAttributes {
  status?: string;
  battery_level?: number;
  fan_speed?: string;
  fan_speed_list?: string[];
}

export interface EntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  platform: string;
  name: string | null;
  original_name: string | null;
  area_id: string | null;
  disabled_by: string | null;
  hidden_by: string | null;
  icon: string | null;
  unique_id: string;
}
