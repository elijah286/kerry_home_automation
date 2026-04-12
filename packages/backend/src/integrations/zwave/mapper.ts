// ---------------------------------------------------------------------------
// Z-Wave node → DeviceState mappers
// ---------------------------------------------------------------------------

import type { DeviceState, LightState, SwitchState, SensorState, CoverState, FanState, SensorKind } from '@ha/shared';
import type { ZwaveNode, ZwaveNodeValue } from './zwavejs-client.js';

// Z-Wave Command Classes
const CC_BINARY_SWITCH = 37;
const CC_MULTILEVEL_SWITCH = 38;
const CC_BINARY_SENSOR = 48;
const CC_MULTILEVEL_SENSOR = 49;
const CC_METER = 50;
const CC_BATTERY = 128;

function valueKey(cc: number, property: string): string {
  return `${cc}-${property}`;
}

function getVal(node: ZwaveNode, cc: number, property: string): ZwaveNodeValue | undefined {
  return node.values[valueKey(cc, property)];
}

function deviceId(entryId: string, nodeId: number, cc: number, property: string): string {
  return `zwave.${entryId}.node${nodeId}.${cc}_${property}`;
}

function baseName(node: ZwaveNode): string {
  return node.name || `Z-Wave Node ${node.nodeId}`;
}

function baseFields(entryId: string, node: ZwaveNode, cc: number, property: string) {
  return {
    id: deviceId(entryId, node.nodeId, cc, property),
    name: baseName(node),
    integration: 'zwave' as const,
    areaId: node.location || null,
    available: node.status === 'alive',
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
  };
}

function isCoverDevice(node: ZwaveNode): boolean {
  const genericLabel = node.deviceClass?.generic?.label?.toLowerCase() ?? '';
  return genericLabel.includes('window') || genericLabel.includes('cover') || genericLabel.includes('shade') || genericLabel.includes('blind');
}

/**
 * Maps a single Z-Wave node to zero or more DeviceState entities.
 * One node can expose multiple command classes → multiple entities.
 */
export function mapZwaveNode(entryId: string, node: ZwaveNode): DeviceState[] {
  const devices: DeviceState[] = [];

  // CC 38: Multilevel Switch → Light or Cover
  const mlSwitch = getVal(node, CC_MULTILEVEL_SWITCH, 'currentValue')
    ?? getVal(node, CC_MULTILEVEL_SWITCH, 'targetValue');
  if (mlSwitch !== undefined) {
    const rawValue = typeof mlSwitch.value === 'number' ? mlSwitch.value : 0;

    if (isCoverDevice(node)) {
      const cover: CoverState = {
        ...baseFields(entryId, node, CC_MULTILEVEL_SWITCH, 'currentValue'),
        type: 'cover',
        position: Math.round((rawValue / 99) * 100),
        moving: 'stopped',
      };
      devices.push(cover);
    } else {
      const light: LightState = {
        ...baseFields(entryId, node, CC_MULTILEVEL_SWITCH, 'currentValue'),
        type: 'light',
        on: rawValue > 0,
        brightness: Math.round((rawValue / 99) * 100),
      };
      devices.push(light);
    }
  }

  // CC 37: Binary Switch → Switch
  const binSwitch = getVal(node, CC_BINARY_SWITCH, 'currentValue')
    ?? getVal(node, CC_BINARY_SWITCH, 'targetValue');
  if (binSwitch !== undefined) {
    const sw: SwitchState = {
      ...baseFields(entryId, node, CC_BINARY_SWITCH, 'currentValue'),
      type: 'switch',
      on: binSwitch.value === true || binSwitch.value === 1,
    };
    devices.push(sw);
  }

  // CC 49: Multilevel Sensor → SensorState (temperature, humidity)
  for (const [key, val] of Object.entries(node.values)) {
    if (!key.startsWith(`${CC_MULTILEVEL_SENSOR}-`)) continue;
    const property = key.split('-').slice(1).join('-');
    const unit = String((val.metadata as Record<string, unknown>)?.unit ?? val.label ?? '');

    let sensorType: SensorKind = 'generic';
    if (unit.includes('°') || unit.toLowerCase().includes('temp')) {
      sensorType = 'temperature';
    } else if (unit.includes('%') || unit.toLowerCase().includes('humid')) {
      sensorType = 'humidity';
    }

    const sensor: SensorState = {
      ...baseFields(entryId, node, CC_MULTILEVEL_SENSOR, property),
      type: 'sensor',
      sensorType,
      value: typeof val.value === 'number' ? val.value : null,
      unit: unit || null,
    };
    devices.push(sensor);
  }

  // CC 48: Binary Sensor → SensorState (motion, contact)
  for (const [key, val] of Object.entries(node.values)) {
    if (!key.startsWith(`${CC_BINARY_SENSOR}-`)) continue;
    const property = key.split('-').slice(1).join('-');
    const label = (val.label ?? property).toLowerCase();

    let sensorType: SensorKind = 'generic';
    if (label.includes('motion')) sensorType = 'motion';
    else if (label.includes('door') || label.includes('window') || label.includes('contact')) sensorType = 'contact';

    const sensor: SensorState = {
      ...baseFields(entryId, node, CC_BINARY_SENSOR, property),
      type: 'sensor',
      sensorType,
      value: val.value === true || val.value === 1,
      unit: null,
    };
    devices.push(sensor);
  }

  // CC 50: Meter → SensorState (power/energy)
  for (const [key, val] of Object.entries(node.values)) {
    if (!key.startsWith(`${CC_METER}-`)) continue;
    const property = key.split('-').slice(1).join('-');
    const unit = String((val.metadata as Record<string, unknown>)?.unit ?? '');

    const sensor: SensorState = {
      ...baseFields(entryId, node, CC_METER, property),
      type: 'sensor',
      sensorType: 'generic',
      value: typeof val.value === 'number' ? val.value : null,
      unit: unit || (val.label ?? null),
    };
    devices.push(sensor);
  }

  // CC 128: Battery → SensorState
  const battery = getVal(node, CC_BATTERY, 'level');
  if (battery !== undefined) {
    const sensor: SensorState = {
      ...baseFields(entryId, node, CC_BATTERY, 'level'),
      type: 'sensor',
      sensorType: 'battery',
      value: typeof battery.value === 'number' ? battery.value : null,
      unit: '%',
    };
    devices.push(sensor);
  }

  return devices;
}
