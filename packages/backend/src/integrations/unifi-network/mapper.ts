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

function stripLocalHost(s: string): string {
  return s
    .trim()
    .replace(/\.local\.?$/i, '')
    .replace(/\.lan$/i, '')
    .replace(/\.home\.?$/i, '');
}

function truthyWire(v: UnifiClient['is_wired']): boolean {
  return v === true || v === 1 || v === '1';
}

function looksLikeMacLabel(s: string): boolean {
  return /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(s);
}

function buildClientDisplayName(macRaw: string, client: UnifiClient): string {
  const nameRaw = typeof client.name === 'string' ? client.name.trim() : '';
  const hostRaw = typeof client.hostname === 'string' ? client.hostname.trim() : '';
  const devNameRaw = typeof client.dev_name === 'string' ? client.dev_name.trim() : '';
  const noted = typeof client.noted === 'string' ? client.noted.trim() : '';
  const oui = typeof client.oui === 'string' ? client.oui.trim() : '';
  const osName = typeof client.os_name === 'string' ? client.os_name.trim() : '';

  const host = stripLocalHost(hostRaw || devNameRaw);
  const friendly = stripLocalHost(nameRaw);

  const isEmptyFriendly = !friendly || looksLikeMacLabel(friendly);

  let base: string;
  if (noted) {
    base = noted;
  } else if (!isEmptyFriendly && friendly) {
    base =
      host && host.toLowerCase() !== friendly.toLowerCase()
        ? `${friendly} (${host})`
        : friendly;
  } else if (host) {
    base = host;
  } else if (osName) {
    base = osName;
  } else if (oui) {
    base = `${macRaw} (${oui})`;
  } else {
    base = macRaw;
  }

  if (
    oui &&
    (base === host || base === macRaw) &&
    /^(android|iphone|ipad|unknown|espressif|linux|windows|galaxy-|desktop-|host)$/i.test(host)
  ) {
    base = host ? `${host} · ${oui}` : `${macRaw} · ${oui}`;
  }

  return base;
}

export function mapDevice(entryId: string, device: UnifiDevice): NetworkDeviceState {
  const macRaw = device.mac;
  if (!macRaw) {
    throw new Error('UniFi device missing mac');
  }
  const mac = macRaw.toLowerCase().replace(/:/g, '');
  const st = device.state;
  const online = st === 1 || st === '1';
  const label = device.name?.trim() || device.model || macRaw;
  const name =
    device.name?.trim() && device.model && device.model !== device.name
      ? `${device.name.trim()} (${device.model})`
      : label;
  return {
    type: 'network_device',
    id: `unifi_network.${entryId}.device.${mac}`,
    name,
    integration: 'unifi_network',
    areaId: null,
    available: online,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    mac: macRaw,
    ip: device.ip ?? null,
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
  const name = buildClientDisplayName(macRaw, client);
  const oui = typeof client.oui === 'string' ? client.oui.trim() : '';
  const noted = typeof client.noted === 'string' ? client.noted.trim() : '';
  const wired = truthyWire(client.is_wired);
  const essid = typeof client.essid === 'string' && client.essid.trim() ? client.essid.trim() : null;
  const vlan = typeof client.vlan === 'number' && Number.isFinite(client.vlan) ? client.vlan : null;

  return {
    type: 'network_device',
    id: `unifi_network.${entryId}.client.${mac}`,
    name,
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
    unifiClientInfo: {
      wired,
      ssid: wired ? null : essid,
      vlan,
      vendor: oui || null,
      note: noted || null,
    },
  };
}
