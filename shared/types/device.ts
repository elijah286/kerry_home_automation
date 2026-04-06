export type Protocol = 'zwave' | 'lutron' | 'mqtt' | 'esphome' | 'unifi' | 'api' | 'virtual';

export interface Device {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  area_id: string | null;
  floor_id: string | null;
  protocol: Protocol;
  connection: DeviceConnection;
  disabled: boolean;
  entity_ids: string[];
}

export interface DeviceConnection {
  bridge: string;
  address: string;
  identifiers?: Array<[string, string]>;
}

export interface DeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  manufacturer: string | null;
  model: string | null;
  area_id: string | null;
  disabled_by: string | null;
  config_entries: string[];
  connections: Array<[string, string]>;
  identifiers: Array<[string, string]>;
}
