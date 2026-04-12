// ---------------------------------------------------------------------------
// Maps device types to their default visualization configuration
// ---------------------------------------------------------------------------

import type { DeviceState } from '@ha/shared';
import type { Signal } from './TimeSeriesGraph';
import type { StateTimelineItem } from './StateTimeline';
import type { GaugeThreshold } from './GaugeDisplay';

export type VizType = 'graph' | 'timeline' | 'gauge' | 'cover' | 'weather' | 'none';

export interface VizConfig {
  /** Primary visualization for history */
  historyType: VizType;
  /** Signals for TimeSeriesGraph */
  graphSignals?: Signal[];
  /** Items for StateTimeline */
  timelineItems?: StateTimelineItem[];
  /** Gauge config for current value display */
  gauge?: {
    field: string;
    min: number;
    max: number;
    unit: string;
    label: string;
    thresholds?: GaugeThreshold[];
  };
  /** Whether to use CoverControl instead of default DeviceCard */
  useCoverControl?: boolean;
  /** Whether to use WeatherCard instead of default WeatherDisplay */
  useWeatherCard?: boolean;
}

const BATTERY_THRESHOLDS: GaugeThreshold[] = [
  { value: 0, color: 'var(--color-danger)' },
  { value: 20, color: 'var(--color-warning)' },
  { value: 50, color: 'var(--color-success)' },
];

export function getDeviceVizConfig(device: DeviceState): VizConfig {
  const id = device.id;

  switch (device.type) {
    case 'light':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'brightness', label: 'Brightness', unit: '%' },
        ],
        timelineItems: [
          { deviceId: id, field: 'on', label: 'On/Off' },
        ],
      };

    case 'switch':
      return {
        historyType: 'timeline',
        timelineItems: [
          { deviceId: id, field: 'on', label: 'On/Off' },
        ],
      };

    case 'fan':
      return {
        historyType: 'timeline',
        timelineItems: [
          { deviceId: id, field: 'on', label: 'On/Off' },
          { deviceId: id, field: 'speed', label: 'Speed' },
        ],
      };

    case 'cover':
      return {
        historyType: 'graph',
        useCoverControl: true,
        graphSignals: [
          { deviceId: id, field: 'position', label: 'Position', unit: '%' },
        ],
        timelineItems: [
          { deviceId: id, field: 'moving', label: 'Motion' },
        ],
      };

    case 'garage_door':
      return {
        historyType: 'timeline',
        useCoverControl: true,
        timelineItems: [
          { deviceId: id, field: 'open', label: 'State' },
        ],
      };

    case 'media_player':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'volume', label: 'Volume', unit: '%' },
        ],
        timelineItems: [
          { deviceId: id, field: 'power', label: 'Power' },
          { deviceId: id, field: 'source', label: 'Source' },
        ],
      };

    case 'thermostat':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'temperature', label: 'Temperature', unit: '\u00b0F' },
          { deviceId: id, field: 'coolSetpoint', label: 'Cool Setpoint', unit: '\u00b0F' },
          { deviceId: id, field: 'heatSetpoint', label: 'Heat Setpoint', unit: '\u00b0F' },
        ],
        timelineItems: [
          { deviceId: id, field: 'hvacAction', label: 'HVAC Action' },
          { deviceId: id, field: 'hvacMode', label: 'HVAC Mode' },
        ],
      };

    case 'energy_site':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'solarPower', label: 'Solar', unit: 'W' },
          { deviceId: id, field: 'batteryPower', label: 'Battery', unit: 'W' },
          { deviceId: id, field: 'gridPower', label: 'Grid', unit: 'W' },
          { deviceId: id, field: 'loadPower', label: 'Home Load', unit: 'W' },
        ],
        gauge: {
          field: 'batteryPercentage',
          min: 0, max: 100, unit: '%',
          label: 'Battery',
          thresholds: BATTERY_THRESHOLDS,
        },
      };

    case 'energy_monitor':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'powerW', label: 'Power', unit: 'W' },
          { deviceId: id, field: 'solarW', label: 'Solar', unit: 'W' },
        ],
      };

    case 'vehicle':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'batteryLevel', label: 'Battery', unit: '%' },
          { deviceId: id, field: 'batteryRange', label: 'Range', unit: 'mi' },
        ],
        gauge: {
          field: 'batteryLevel',
          min: 0, max: 100, unit: '%',
          label: 'Battery',
          thresholds: BATTERY_THRESHOLDS,
        },
        timelineItems: [
          { deviceId: id, field: 'chargeState', label: 'Charge State' },
          { deviceId: id, field: 'sleepState', label: 'Sleep State' },
          { deviceId: id, field: 'locked', label: 'Lock' },
        ],
      };

    case 'pool_body':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'currentTemp', label: 'Temperature', unit: '\u00b0F' },
          { deviceId: id, field: 'setPoint', label: 'Set Point', unit: '\u00b0F' },
        ],
        timelineItems: [
          { deviceId: id, field: 'on', label: 'On/Off' },
          { deviceId: id, field: 'heaterOn', label: 'Heater' },
        ],
      };

    case 'pool_pump':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'watts', label: 'Power', unit: 'W' },
          { deviceId: id, field: 'rpm', label: 'RPM', unit: 'rpm' },
        ],
        timelineItems: [
          { deviceId: id, field: 'on', label: 'On/Off' },
        ],
      };

    case 'pool_chemistry':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'ph', label: 'pH' },
          { deviceId: id, field: 'orp', label: 'ORP' },
        ],
      };

    case 'sensor': {
      const sensorDevice = device as Extract<DeviceState, { type: 'sensor' }>;
      const isNumeric = typeof sensorDevice.value === 'number';
      if (isNumeric) {
        return {
          historyType: 'graph',
          graphSignals: [
            { deviceId: id, field: 'value', label: sensorDevice.name, unit: sensorDevice.unit ?? undefined },
          ],
          gauge: sensorDevice.unit === '%' ? {
            field: 'value', min: 0, max: 100, unit: '%',
            label: sensorDevice.name,
          } : undefined,
        };
      }
      return {
        historyType: 'timeline',
        timelineItems: [
          { deviceId: id, field: 'value', label: sensorDevice.name },
        ],
      };
    }

    case 'weather':
      return {
        historyType: 'graph',
        useWeatherCard: true,
        graphSignals: [
          { deviceId: id, field: 'temperature', label: 'Temperature', unit: '\u00b0F' },
          { deviceId: id, field: 'humidity', label: 'Humidity', unit: '%' },
        ],
      };

    case 'sprinkler':
      return {
        historyType: 'timeline',
        timelineItems: [
          { deviceId: id, field: 'running', label: 'Running' },
          { deviceId: id, field: 'currentZoneName', label: 'Zone' },
        ],
      };

    case 'vacuum':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'batteryLevel', label: 'Battery', unit: '%' },
        ],
        gauge: {
          field: 'batteryLevel',
          min: 0, max: 100, unit: '%',
          label: 'Battery',
          thresholds: BATTERY_THRESHOLDS,
        },
        timelineItems: [
          { deviceId: id, field: 'status', label: 'Status' },
        ],
      };

    case 'doorbell':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'batteryLevel', label: 'Battery', unit: '%' },
        ],
        gauge: {
          field: 'batteryLevel',
          min: 0, max: 100, unit: '%',
          label: 'Battery',
          thresholds: BATTERY_THRESHOLDS,
        },
      };

    case 'speedtest':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'downloadMbps', label: 'Download', unit: 'Mbps' },
          { deviceId: id, field: 'uploadMbps', label: 'Upload', unit: 'Mbps' },
          { deviceId: id, field: 'pingMs', label: 'Ping', unit: 'ms' },
        ],
      };

    case 'water_softener':
      return {
        historyType: 'graph',
        graphSignals: [
          { deviceId: id, field: 'capacityRemaining', label: 'Capacity', unit: '%' },
          { deviceId: id, field: 'saltLevel', label: 'Salt Level', unit: '%' },
        ],
        gauge: {
          field: 'saltLevel',
          min: 0, max: 100, unit: '%',
          label: 'Salt Level',
          thresholds: [
            { value: 0, color: 'var(--color-danger)' },
            { value: 25, color: 'var(--color-warning)' },
            { value: 50, color: 'var(--color-success)' },
          ],
        },
      };

    default:
      return { historyType: 'none' };
  }
}
