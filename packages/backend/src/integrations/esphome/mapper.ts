// ---------------------------------------------------------------------------
// ESPHome entity states → DeviceState mappers
// ---------------------------------------------------------------------------

import type { DeviceState, LightState, SwitchState, SensorState, FanState, CoverState, SensorKind, HubState } from '@ha/shared';
import type { EspEntityState } from './esphome-client.js';

function domainOf(entity: EspEntityState): string {
  if (entity.domain) return entity.domain;
  // Fallback: derive domain from entity id (e.g. "light-led_strip" → "light")
  const dash = entity.id.indexOf('-');
  return dash > 0 ? entity.id.substring(0, dash) : 'unknown';
}

function entitySlug(entity: EspEntityState): string {
  const dash = entity.id.indexOf('-');
  return dash > 0 ? entity.id.substring(dash + 1) : entity.id;
}

function sensorKindFromUnit(unit?: string): SensorKind {
  if (!unit) return 'generic';
  if (unit === '°F' || unit === '°C') return 'temperature';
  if (unit === '%') return 'humidity';
  return 'generic';
}

function sensorKindFromDeviceClass(deviceClass?: string): SensorKind {
  if (!deviceClass) return 'generic';
  if (deviceClass === 'motion' || deviceClass === 'occupancy') return 'motion';
  if (deviceClass === 'door' || deviceClass === 'window' || deviceClass === 'opening' || deviceClass === 'garage_door') return 'contact';
  return 'generic';
}

const now = () => Date.now();

export function mapEspStates(
  entryId: string,
  deviceName: string,
  states: EspEntityState[],
  available: boolean,
): DeviceState[] {
  const result: DeviceState[] = [];
  const hubId = `esphome.${entryId}.hub.main`;

  // Create parent hub device
  result.push({
    integration: 'esphome' as const,
    areaId: null,
    available,
    lastChanged: now(),
    lastUpdated: now(),
    type: 'hub',
    id: hubId,
    name: deviceName,
    model: null,
    firmwareVersion: null,
  } satisfies HubState);

  for (const entity of states) {
    const domain = domainOf(entity);
    const slug = entitySlug(entity);
    const base = {
      integration: 'esphome' as const,
      areaId: null,
      available,
      lastChanged: now(),
      lastUpdated: now(),
      parentDeviceId: hubId,
    };

    switch (domain) {
      case 'light': {
        const brightness = typeof entity.value === 'number'
          ? Math.round((entity.value / 255) * 100)
          : entity.state === 'ON' ? 100 : 0;
        result.push({
          ...base,
          type: 'light',
          id: `esphome.${entryId}.light.${slug}`,
          name: entity.name || `${deviceName} ${slug}`,
          on: entity.state === 'ON',
          brightness,
        } satisfies LightState);
        break;
      }

      case 'switch': {
        result.push({
          ...base,
          type: 'switch',
          id: `esphome.${entryId}.switch.${slug}`,
          name: entity.name || `${deviceName} ${slug}`,
          on: entity.state === 'ON',
        } satisfies SwitchState);
        break;
      }

      case 'sensor': {
        const sensorType = sensorKindFromUnit(entity.unit_of_measurement);
        result.push({
          ...base,
          type: 'sensor',
          id: `esphome.${entryId}.sensor.${slug}`,
          name: entity.name || `${deviceName} ${slug}`,
          sensorType,
          value: typeof entity.value === 'number' ? entity.value : parseFloat(entity.state) || entity.state,
          unit: entity.unit_of_measurement ?? null,
        } satisfies SensorState);
        break;
      }

      case 'binary_sensor': {
        const sensorType = sensorKindFromDeviceClass(entity.device_class);
        result.push({
          ...base,
          type: 'sensor',
          id: `esphome.${entryId}.sensor.${slug}`,
          name: entity.name || `${deviceName} ${slug}`,
          sensorType,
          value: entity.state === 'ON',
          unit: null,
        } satisfies SensorState);
        break;
      }

      case 'fan': {
        result.push({
          ...base,
          type: 'fan',
          id: `esphome.${entryId}.fan.${slug}`,
          name: entity.name || `${deviceName} ${slug}`,
          on: entity.state === 'ON',
          speed: entity.state === 'ON' ? 'medium' : 'off',
        } satisfies FanState);
        break;
      }

      case 'cover': {
        const position = typeof entity.value === 'number' ? Math.round(entity.value * 100) : entity.state === 'OPEN' ? 100 : 0;
        result.push({
          ...base,
          type: 'cover',
          id: `esphome.${entryId}.cover.${slug}`,
          name: entity.name || `${deviceName} ${slug}`,
          position,
          moving: 'stopped',
        } satisfies CoverState);
        break;
      }
    }
  }

  return result;
}
