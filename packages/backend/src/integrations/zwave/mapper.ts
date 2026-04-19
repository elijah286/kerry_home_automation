// ---------------------------------------------------------------------------
// Z-Wave node → DeviceState mappers
// ---------------------------------------------------------------------------

import type {
  DeviceState,
  LightState,
  SwitchState,
  SensorState,
  CoverState,
  LockState,
  GarageDoorState,
  SensorKind,
} from '@ha/shared';
import type { ZwaveNode, ZwaveNodeValue } from './zwavejs-client.js';

// Z-Wave Command Classes
const CC_BINARY_SWITCH = 37;
const CC_MULTILEVEL_SWITCH = 38;
const CC_BINARY_SENSOR = 48;
const CC_MULTILEVEL_SENSOR = 49;
const CC_METER = 50;
const CC_DOOR_LOCK = 98;
const CC_BARRIER_OPERATOR = 102;
const CC_NOTIFICATION = 113;
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

  // CC 98: Door Lock → LockState (handled before CC 38 since some lock models also expose multilevel switch nonsense)
  for (const [key, val] of Object.entries(node.values)) {
    if (!key.startsWith(`${CC_DOOR_LOCK}-`)) continue;
    const property = key.split('-').slice(1).join('-');
    if (property !== 'currentMode' && property !== 'targetMode') continue;
    if (property === 'targetMode') continue; // prefer currentMode for state; targetMode is a write-only echo

    // 0 = Unsecured, 1 = UnsecuredWithTimeout, 16 = InsideUnsecured, 17/18 = InsideUnsecuredWithTimeout,
    // 32/33/34 = OutsideUnsecured*, 254 = Unknown, 255 = Secured
    const mode = typeof val.value === 'number' ? val.value : 0;
    const lock: LockState = {
      ...baseFields(entryId, node, CC_DOOR_LOCK, 'currentMode'),
      type: 'lock',
      locked: mode === 255,
      jammed: mode === 254,
    };
    devices.push(lock);
    break;
  }

  const isLock = devices.some((d) => d.type === 'lock');

  // CC 102: Barrier Operator → GarageDoorState
  for (const [key, val] of Object.entries(node.values)) {
    if (!key.startsWith(`${CC_BARRIER_OPERATOR}-`)) continue;
    const property = key.split('-').slice(1).join('-');
    if (property !== 'currentState' && property !== 'targetState') continue;
    if (property === 'targetState') continue;

    // 0 = Closed, 252 = Closing, 253 = Stopped, 254 = Opening, 255 = Open
    const state = typeof val.value === 'number' ? val.value : 0;
    const garage: GarageDoorState = {
      ...baseFields(entryId, node, CC_BARRIER_OPERATOR, 'currentState'),
      type: 'garage_door',
      open: state === 255 || state === 253,
      opening: state === 254,
      closing: state === 252,
    };
    devices.push(garage);
    break;
  }

  const isBarrier = devices.some((d) => d.type === 'garage_door');

  // CC 38: Multilevel Switch → Light or Cover
  // Skip if this node is primarily a lock or barrier — those CCs take precedence.
  if (!isLock && !isBarrier) {
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
  }

  // CC 37: Binary Switch → Switch
  if (!isLock && !isBarrier) {
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
  }

  // CC 49: Multilevel Sensor → SensorState (temperature, humidity, …)
  for (const [key, val] of Object.entries(node.values)) {
    if (!key.startsWith(`${CC_MULTILEVEL_SENSOR}-`)) continue;
    const property = key.split('-').slice(1).join('-');
    const unit = String((val.metadata as Record<string, unknown>)?.unit ?? val.label ?? '');
    const propLower = property.toLowerCase();

    let sensorType: SensorKind = 'generic';
    if (unit.includes('°') || propLower.includes('temp')) sensorType = 'temperature';
    else if (unit.includes('%') || propLower.includes('humid')) sensorType = 'humidity';
    else if (unit === 'W' || propLower.includes('power')) sensorType = 'power';
    else if (unit === 'kWh' || unit === 'Wh') sensorType = 'energy';

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
    else if (label.includes('tamper')) sensorType = 'tamper';
    else if (label.includes('water') || label.includes('leak') || label.includes('flood')) sensorType = 'leak';
    else if (label.includes('smoke')) sensorType = 'smoke';

    const sensor: SensorState = {
      ...baseFields(entryId, node, CC_BINARY_SENSOR, property),
      type: 'sensor',
      sensorType,
      value: val.value === true || val.value === 1,
      unit: null,
    };
    devices.push(sensor);
  }

  // CC 113: Notification → SensorState (motion, contact, leak, smoke, tamper)
  // Z-Wave JS exposes notifications keyed like "113-Home Security-Motion sensor status",
  // "113-Water Alarm-Sensor status", "113-Access Control-Door state", etc.
  for (const [key, val] of Object.entries(node.values)) {
    if (!key.startsWith(`${CC_NOTIFICATION}-`)) continue;
    const tail = key.slice(`${CC_NOTIFICATION}-`.length);
    // Skip "alarmType"/"alarmLevel" legacy V1 properties that are usually 0/uninteresting.
    if (tail === 'alarmType' || tail === 'alarmLevel') continue;

    const propLower = tail.toLowerCase();
    const labelLower = (val.label ?? '').toLowerCase();
    const haystack = `${propLower} ${labelLower}`;

    let sensorType: SensorKind = 'generic';
    if (haystack.includes('motion')) sensorType = 'motion';
    else if (haystack.includes('door') || haystack.includes('window') || haystack.includes('access') || haystack.includes('contact')) sensorType = 'contact';
    else if (haystack.includes('water') || haystack.includes('leak') || haystack.includes('flood')) sensorType = 'leak';
    else if (haystack.includes('smoke')) sensorType = 'smoke';
    else if (haystack.includes('tamper') || haystack.includes('cover removed') || haystack.includes('intrusion')) sensorType = 'tamper';
    else if (haystack.includes('home security')) sensorType = 'motion'; // common catch-all; many sensors report motion under this group

    // Notification value: 0 = idle/clear; non-zero numeric = active event code; boolean = direct.
    let active: boolean;
    if (typeof val.value === 'boolean') active = val.value;
    else if (typeof val.value === 'number') active = val.value !== 0;
    else active = false;

    const property = `notif_${tail.replace(/[^a-z0-9]+/gi, '_')}`;
    const sensor: SensorState = {
      ...baseFields(entryId, node, CC_NOTIFICATION, property),
      type: 'sensor',
      sensorType,
      value: active,
      unit: null,
    };
    devices.push(sensor);
  }

  // CC 50: Meter → SensorState (power/energy)
  for (const [key, val] of Object.entries(node.values)) {
    if (!key.startsWith(`${CC_METER}-`)) continue;
    const property = key.split('-').slice(1).join('-');
    const unit = String((val.metadata as Record<string, unknown>)?.unit ?? '');

    let sensorType: SensorKind = 'generic';
    if (unit === 'W') sensorType = 'power';
    else if (unit === 'kWh' || unit === 'Wh') sensorType = 'energy';

    const sensor: SensorState = {
      ...baseFields(entryId, node, CC_METER, property),
      type: 'sensor',
      sensorType,
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
