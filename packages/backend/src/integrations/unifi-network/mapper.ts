// ---------------------------------------------------------------------------
// UniFi Network data → NetworkDeviceState mappers
// ---------------------------------------------------------------------------

import type { NetworkDeviceState } from '@ha/shared';
import type { UnifiDevice, UnifiClient } from './unifi-client.js';

const DEVICE_TYPE_MAP: Record<string, NetworkDeviceState['deviceType']> = {
  uap: 'ap',
  usw: 'switch',
  ugw: 'gateway',
  /** Dream Machine / UXG / USG and similar */
  udm: 'gateway',
  uxg: 'gateway',
  usg: 'gateway',
  udw: 'gateway',
  ubb: 'switch',
};

export function mapDevice(entryId: string, device: UnifiDevice): NetworkDeviceState {
  const macRaw = device.mac;
  if (!macRaw) {
    throw new Error('UniFi device missing mac');
  }
  const mac = macRaw.toLowerCase().replace(/:/g, '');
  const online = Number(device.state) === 1;
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
    deviceType: DEVICE_TYPE_MAP[device.type ?? ''] ?? 'switch',
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
