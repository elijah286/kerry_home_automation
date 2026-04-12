// ---------------------------------------------------------------------------
// Wyze device data -> DeviceState mappers
// ---------------------------------------------------------------------------

import type { CameraState, LightState, SwitchState, SensorState, DeviceState } from '@ha/shared';
import type { WyzeDeviceRaw } from './wyze-client.js';

export function mapWyzeDevice(entryId: string, device: WyzeDeviceRaw): DeviceState | null {
  const now = Date.now();
  const base = {
    integration: 'wyze' as const,
    areaId: null,
    lastChanged: now,
    lastUpdated: now,
  };

  switch (device.product_type) {
    case 'Camera': {
      const powerSwitch = device.device_params?.power_switch;
      return {
        ...base,
        type: 'camera',
        id: `wyze.${entryId}.camera.${device.mac}`,
        name: device.nickname,
        available: true,
        online: powerSwitch === 1 || powerSwitch === true,
        host: '',
      } satisfies CameraState;
    }

    case 'MeshLight': {
      const brightness = typeof device.device_params?.P1501 === 'number'
        ? device.device_params.P1501 as number
        : 0;
      const isOn = typeof device.device_params?.P3 === 'string'
        ? device.device_params.P3 === '1'
        : brightness > 0;
      return {
        ...base,
        type: 'light',
        id: `wyze.${entryId}.light.${device.mac}`,
        name: device.nickname,
        available: true,
        on: isOn,
        brightness,
      } satisfies LightState;
    }

    case 'Plug':
    case 'OutdoorPlug': {
      const on = device.device_params?.P3 === '1';
      return {
        ...base,
        type: 'switch',
        id: `wyze.${entryId}.switch.${device.mac}`,
        name: device.nickname,
        available: true,
        on,
      } satisfies SwitchState;
    }

    case 'ContactSensor': {
      const value = device.device_params?.open_close_state;
      return {
        ...base,
        type: 'sensor',
        id: `wyze.${entryId}.sensor.${device.mac}`,
        name: device.nickname,
        available: true,
        sensorType: 'contact',
        value: value === 1 || value === true,
        unit: null,
      } satisfies SensorState;
    }

    case 'MotionSensor': {
      const value = device.device_params?.motion_state;
      return {
        ...base,
        type: 'sensor',
        id: `wyze.${entryId}.sensor.${device.mac}`,
        name: device.nickname,
        available: true,
        sensorType: 'motion',
        value: value === 1 || value === true,
        unit: null,
      } satisfies SensorState;
    }

    case 'Lock':
      // Lock type not yet mapped to a DeviceState
      return null;

    default:
      return null;
  }
}
