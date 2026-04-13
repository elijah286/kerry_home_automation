// ---------------------------------------------------------------------------
// Match UniFi Network clients to other HomeOS devices by MAC (normalized) or
// LAN IP (media players, cameras, etc. expose `host` as the device IP).
// ---------------------------------------------------------------------------

import type { DeviceState, NetworkDeviceState } from '@ha/shared';

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** Hex digits only, lowercased (expect 12 for a valid Ethernet MAC). */
export function macToHex12(raw: string): string {
  return raw.toLowerCase().replace(/[^a-f0-9]/g, '');
}

function isIpv4(s: string): boolean {
  if (!IPV4.test(s)) return false;
  return s.split('.').every((oct) => {
    const n = Number(oct);
    return n >= 0 && n <= 255;
  });
}

function macFromWyzeDeviceId(deviceId: string): string | null {
  const m = deviceId.match(/^wyze\.[^.]+\.[^.]+\.(.+)$/i);
  if (!m) return null;
  const hex = macToHex12(m[1]);
  return hex.length === 12 ? hex : null;
}

function collectMacIndex(devices: DeviceState[]): Map<string, Set<string>> {
  const macToIds = new Map<string, Set<string>>();
  const add = (macHex: string, id: string) => {
    const h = macHex.length === 12 ? macHex : macHex.length > 12 ? macHex.slice(-12) : '';
    if (h.length !== 12) return;
    let set = macToIds.get(h);
    if (!set) {
      set = new Set();
      macToIds.set(h, set);
    }
    set.add(id);
  };

  for (const d of devices) {
    if (d.type === 'network_device') {
      const nd = d as NetworkDeviceState;
      if (nd.mac) add(macToHex12(nd.mac), d.id);
    } else if (d.integration === 'wyze') {
      const fromId = macFromWyzeDeviceId(d.id);
      if (fromId) add(fromId, d.id);
    }
  }
  return macToIds;
}

function collectHostIpIndex(devices: DeviceState[]): Map<string, Set<string>> {
  const ipToIds = new Map<string, Set<string>>();
  const add = (ip: string, id: string) => {
    if (!isIpv4(ip)) return;
    let set = ipToIds.get(ip);
    if (!set) {
      set = new Set();
      ipToIds.set(ip, set);
    }
    set.add(id);
  };

  for (const d of devices) {
    const host = (d as { host?: string }).host;
    if (typeof host === 'string' && host.length > 0) {
      add(host.trim(), d.id);
    }
  }
  return ipToIds;
}

function sortedLinkIds(ids: Iterable<string>): string[] {
  return [...ids].sort();
}

function normalizeMacKey(mac: string): string {
  const h = macToHex12(mac);
  if (h.length === 12) return h;
  return h.length > 12 ? h.slice(-12) : '';
}

/**
 * Build `linkedDeviceIds` for each UniFi client on this controller, using a device
 * list that already includes the freshly mapped UniFi infra + clients for `entryId`.
 */
export function computeUnifiClientLinks(entryId: string, mergedDevices: DeviceState[]): Map<string, string[]> {
  const macIndex = collectMacIndex(mergedDevices);
  const ipIndex = collectHostIpIndex(mergedDevices);
  const prefix = `unifi_network.${entryId}.client.`;
  const out = new Map<string, string[]>();

  for (const d of mergedDevices) {
    if (d.type !== 'network_device' || d.integration !== 'unifi_network') continue;
    if (!d.id.startsWith(prefix)) continue;
    const client = d as NetworkDeviceState;
    if (client.deviceType !== 'client') continue;

    const linked = new Set<string>();
    const self = client.id;

    const macKey = client.mac ? normalizeMacKey(client.mac) : '';
    if (macKey.length === 12) {
      for (const id of macIndex.get(macKey) ?? []) {
        if (id !== self) linked.add(id);
      }
    }

    if (client.ip && isIpv4(client.ip)) {
      for (const id of ipIndex.get(client.ip) ?? []) {
        if (id !== self) linked.add(id);
      }
    }

    const next = sortedLinkIds(linked);
    out.set(self, next);
  }
  return out;
}
