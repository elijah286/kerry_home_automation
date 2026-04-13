import type { DeviceState } from '@ha/shared';

/** Device shown as a marker — requires finite coordinates */
export interface LocatableDevice {
  id: string;
  name: string;
  displayName?: string;
  deviceType: DeviceState['type'];
  latitude: number;
  longitude: number;
}

/**
 * Anything the user can toggle for the map: vehicles (even before GPS arrives) and
 * non-vehicle devices that already report coordinates.
 */
export interface MapTrackableDevice {
  id: string;
  name: string;
  displayName?: string;
  deviceType: DeviceState['type'];
  hasPosition: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface HistoryPoint {
  lat: number;
  lng: number;
  time: number;
}

/** Any integration that puts numeric latitude/longitude on state */
export function getDeviceLatLng(d: DeviceState): { lat: number; lng: number } | null {
  const o = d as unknown as Record<string, unknown>;
  const lat = o.latitude;
  const lng = o.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

/** Vehicles always listed so toggles apply before the first fix; other types appear once they report coords */
export function buildMapTrackableList(devices: DeviceState[]): MapTrackableDevice[] {
  const out: MapTrackableDevice[] = [];
  const seen = new Set<string>();
  for (const d of devices) {
    const pos = getDeviceLatLng(d);
    const include = d.type === 'vehicle' || pos != null;
    if (!include) continue;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push({
      id: d.id,
      name: d.name,
      displayName: d.displayName,
      deviceType: d.type,
      hasPosition: pos != null,
      latitude: pos?.lat ?? null,
      longitude: pos?.lng ?? null,
    });
  }
  return out.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
}

export function trackableToLocatable(d: MapTrackableDevice): LocatableDevice | null {
  if (!d.hasPosition || d.latitude == null || d.longitude == null) return null;
  return {
    id: d.id,
    name: d.name,
    displayName: d.displayName,
    deviceType: d.deviceType,
    latitude: d.latitude,
    longitude: d.longitude,
  };
}
