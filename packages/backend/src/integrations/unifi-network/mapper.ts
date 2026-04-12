// ---------------------------------------------------------------------------
// UniFi Network data → NetworkDeviceState mappers
// ---------------------------------------------------------------------------

import type { NetworkDeviceState } from '@ha/shared';
import type { UnifiDevice, UnifiClient } from './unifi-client.js';

const DEVICE_TYPE_MAP: Record<string, NetworkDeviceState['deviceType']> = {
  uap: 'ap',
  /** Wi‑Fi 6/7 APs */
  uap6: 'ap',
  uap7: 'ap',
  uapa: 'ap',
  ubb: 'switch',
  usw: 'switch',
  /** Gen2 / Pro switches */
  usw8: 'switch',
  usw16: 'switch',
  usw24: 'switch',
  usw48: 'switch',
  ugw: 'gateway',
  /** Dream Machine / UXG / USG and similar */
  udm: 'gateway',
  udmpro: 'gateway',
  uxg: 'gateway',
  usg: 'gateway',
  udw: 'gateway',
};

function mapUnifiHardwareType(t: string | undefined): NetworkDeviceState['deviceType'] {
  if (!t) return 'switch';
  const key = t.toLowerCase();
  if (DEVICE_TYPE_MAP[key]) return DEVICE_TYPE_MAP[key];
  if (key.startsWith('uap')) return 'ap';
  if (key.startsWith('usw') || key.startsWith('usf')) return 'switch';
  if (key.startsWith('udm') || key.startsWith('ugw') || key.startsWith('uxg') || key.startsWith('usg')) return 'gateway';
  return 'switch';
}

export function mapDevice(entryId: string, device: UnifiDevice): NetworkDeviceState {
  const macRaw = device.mac;
  if (!macRaw) {
    throw new Error('UniFi device missing mac');
  }
  const mac = macRaw.toLowerCase().replace(/:/g, '');
  const st = device.state;
  const online = st === 1 || st === '1';
  return {
    type: 'network_device',
    id: `unifi_network.${entryId}.device.${mac}`,
    name: device.name || device.model || macRaw,
    integration: 'unifi_network',
    areaId: null,
    available: online,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    mac: macRaw,
    ip: null,
    deviceType: mapUnifiHardwareType(device.type),
    connected: online,
    uptime: device.uptime ?? null,
    txBytes: device.tx_bytes ?? null,
    rxBytes: device.rx_bytes ?? null,
    clients: device.num_sta ?? null,
    model: device.model ?? null,
  };
}

export function mapClient(entryId: string, client: UnifiClient): NetworkDeviceState {
  const macRaw = client.mac;
  if (!macRaw) {
    throw new Error('UniFi client missing mac');
  }
  const mac = macRaw.toLowerCase().replace(/:/g, '');
  return {
    type: 'network_device',
    id: `unifi_network.${entryId}.client.${mac}`,
    name: client.name || client.hostname || macRaw,
    integration: 'unifi_network',
    areaId: null,
    available: true,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    mac: macRaw,
    ip: client.ip ?? null,
    deviceType: 'client',
    connected: true,
    uptime: client.uptime ?? null,
    txBytes: client.tx_bytes ?? null,
    rxBytes: client.rx_bytes ?? null,
    clients: null,
    model: null,
  };
}
