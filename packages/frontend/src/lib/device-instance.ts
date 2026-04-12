import type { DeviceState } from '@ha/shared';

/** True if this device belongs to a specific integration credential entry (instance). */
export function deviceBelongsToEntry(
  d: DeviceState,
  integrationId: string,
  entryId: string,
): boolean {
  if (d.integration !== integrationId) return false;
  const prefix = `${integrationId}.${entryId}`;
  return d.id === prefix || d.id.startsWith(`${prefix}.`);
}

export function devicesForIntegrationEntry(
  devices: DeviceState[],
  integrationId: string,
  entryId: string,
): DeviceState[] {
  return devices.filter((d) => deviceBelongsToEntry(d, integrationId, entryId));
}
