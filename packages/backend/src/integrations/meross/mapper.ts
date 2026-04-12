// ---------------------------------------------------------------------------
// Meross device data → DeviceState mappers
// ---------------------------------------------------------------------------

import type { GarageDoorState, SensorState } from '@ha/shared';
import type { MerossGarageState, MerossSensorData } from './meross-client.js';

export function mapGarageDoor(
  entryId: string,
  name: string,
  state: MerossGarageState,
  available: boolean,
): GarageDoorState {
  return {
    type: 'garage_door',
    id: `meross.${entryId}.garage`,
    name,
    integration: 'meross',
    areaId: null,
    available,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    open: state.open,
    opening: state.opening,
    closing: state.closing,
  };
}

export function mapMotionSensor(
  entryId: string,
  name: string,
  data: MerossSensorData,
  available: boolean,
): SensorState {
  const recentMotion = data.lastMotion
    ? (Date.now() / 1000 - data.lastMotion) < 300
    : false;

  return {
    type: 'sensor',
    id: `meross.${entryId}.motion`,
    name,
    integration: 'meross',
    areaId: null,
    available,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    sensorType: 'motion',
    value: recentMotion,
    unit: null,
  };
}
