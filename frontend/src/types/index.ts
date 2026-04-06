export interface EntityState {
  entity_id: string;
  domain: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: number;
  last_updated: number;
}

export type SystemMode =
  | 'night'
  | 'morning'
  | 'day'
  | 'evening'
  | 'late_evening'
  | 'late_night';

export interface Floor {
  id: string;
  name: string;
  level: number | null;
}

export interface Area {
  id: string;
  name: string;
  floor_id: string | null;
  icon: string | null;
  aliases: string[];
}

export interface AreaWithFloor extends Area {
  floor: Floor | null;
}

export type Protocol = 'zwave' | 'lutron' | 'mqtt' | 'esphome' | 'unifi' | 'api' | 'virtual';

export interface DeviceConnection {
  bridge: string;
  address: string;
  identifiers?: Array<[string, string]>;
}

export interface Device {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  area_id: string | null;
  floor_id: string | null;
  protocol: Protocol;
  connection: DeviceConnection | Record<string, unknown>;
  disabled: boolean;
  entity_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface StateChangedPayload {
  type: 'state_changed';
  entity_id: string;
  old_state: EntityState | null;
  new_state: EntityState;
  timestamp: number;
}

export interface ModeChangedPayload {
  type: 'mode_changed';
  old_mode: SystemMode;
  new_mode: SystemMode;
  timestamp: number;
}

export interface PresenceChangedPayload {
  type: 'presence_changed';
  area_id: string;
  occupied: boolean;
  confidence: number;
  sources: string[];
  timestamp: number;
}

export interface HistoryRow {
  state: string;
  attributes: Record<string, unknown> | null;
  timestamp: string;
}

export interface EntityHistoryResponse {
  entity_id: string;
  history: HistoryRow[];
}

export interface StatsResponse {
  entity_count: number;
  device_count: number;
  uptime_seconds: number;
  uptime_ms: number;
  event_bus: {
    eventCount: number;
    listenerCount: number;
  };
}

export type UserRole = 'admin' | 'member' | 'guest';

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  allowed_areas: string[] | null;
  dashboard_config: Record<string, unknown>;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Paprika Recipe Manager types

export interface PaprikaRecipe {
  uid: string;
  name: string;
  ingredients: string;
  directions: string;
  description: string;
  notes: string;
  nutritional_info: string;
  servings: string;
  difficulty: string;
  prep_time: string;
  cook_time: string;
  total_time: string;
  source: string;
  source_url: string;
  image_url: string;
  photo: string | null;
  photo_hash: string | null;
  photo_large: string | null;
  scale: string | null;
  hash: string;
  categories: string[];
  rating: number;
  in_trash: boolean;
  is_pinned: boolean;
  on_favorites: boolean;
  on_grocery_list: boolean;
  created: string;
}

export interface PaprikaCategory {
  uid: string;
  order_flag: number;
  name: string;
  parent_uid: string | null;
}

export interface PaprikaGroceryItem {
  uid: string;
  recipe_uid: string | null;
  name: string;
  order_flag: number;
  purchased: boolean;
  aisle: string;
  ingredient: string;
  recipe: string;
  instruction: string;
  quantity: string;
  separate: boolean;
  aisle_uid: string;
  list_uid: string;
}

export interface PaprikaMeal {
  uid: string;
  recipe_uid: string | null;
  date: string;
  type: number;
  name: string;
  order_flag: number;
  type_uid: string;
  scale: string | null;
  is_ingredient: boolean;
}
