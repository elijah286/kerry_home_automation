import type { EntityState } from './entity.js';

export interface StateChangedEvent {
  type: 'state_changed';
  entity_id: string;
  old_state: EntityState | null;
  new_state: EntityState;
  timestamp: number;
}

export interface ServiceCallEvent {
  type: 'service_call';
  domain: string;
  service: string;
  target?: {
    entity_id?: string | string[];
    device_id?: string | string[];
    area_id?: string | string[];
  };
  data?: Record<string, unknown>;
}

export interface CommandEvent {
  type: 'command';
  entity_id: string;
  command: string;
  data?: Record<string, unknown>;
}

export interface ModeChangedEvent {
  type: 'mode_changed';
  old_mode: SystemMode;
  new_mode: SystemMode;
  timestamp: number;
}

export type SystemMode = 'night' | 'morning' | 'day' | 'evening' | 'late_evening' | 'late_night';

export interface PresenceChangedEvent {
  type: 'presence_changed';
  area_id: string;
  occupied: boolean;
  confidence: number;
  sources: string[];
  timestamp: number;
}

export interface LightNeedSignalBreakdown {
  illuminance: number | null;
  solar: number | null;
  sun: number;
  weather: number | null;
  cloud: number | null;
}

export interface LightNeedChangedEvent {
  type: 'light_need_changed';
  area_id: string;
  raw_score: number;
  smoothed_score: number;
  armed: boolean;
  signals: LightNeedSignalBreakdown;
  weights: Record<string, number>;
  timestamp: number;
}

export type BusEvent =
  | StateChangedEvent
  | ServiceCallEvent
  | CommandEvent
  | ModeChangedEvent
  | PresenceChangedEvent
  | LightNeedChangedEvent;

export interface WSClientMessage {
  id: number;
  type: 'subscribe_entities' | 'subscribe_areas' | 'command' | 'get_states' | 'get_areas' | 'ping';
  entity_ids?: string[];
  area_ids?: string[];
  domain?: string;
  service?: string;
  target?: ServiceCallEvent['target'];
  data?: Record<string, unknown>;
}

export interface WSServerMessage {
  id?: number;
  type: 'state_changed' | 'state_snapshot' | 'areas' | 'mode_changed' | 'presence_changed' | 'result' | 'pong' | 'error';
  payload?: unknown;
  success?: boolean;
  error?: string;
}
