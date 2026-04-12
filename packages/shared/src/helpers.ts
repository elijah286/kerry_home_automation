// ---------------------------------------------------------------------------
// Helper definitions — user-defined virtual devices
// ---------------------------------------------------------------------------

export type HelperType =
  | 'toggle'
  | 'counter'
  | 'timer'
  | 'button'
  | 'number'
  | 'text'
  | 'date_time'
  | 'random'
  | 'group'
  | 'derivative_sensor'
  | 'integral_sensor'
  | 'history_stats'
  | 'threshold_sensor'
  | 'switch_as_x'
  | 'select'
  | 'combine_sensors';

// -- Per-type config interfaces -----------------------------------------------

export interface HelperDefBase {
  id: string;
  name: string;
  icon?: string;
  enabled?: boolean;
}

export interface ToggleHelperDef extends HelperDefBase {
  type: 'toggle';
  initial?: boolean;
}

export interface CounterHelperDef extends HelperDefBase {
  type: 'counter';
  initial?: number;
  step?: number;
  min?: number;
  max?: number;
}

export interface TimerHelperDef extends HelperDefBase {
  type: 'timer';
  /** Duration in HH:MM:SS format */
  duration?: string;
  restore?: boolean;
}

export interface ButtonHelperDef extends HelperDefBase {
  type: 'button';
}

export interface NumberHelperDef extends HelperDefBase {
  type: 'number';
  initial?: number;
  min?: number;
  max?: number;
  step?: number;
  mode?: 'slider' | 'box';
  unit?: string;
}

export interface TextHelperDef extends HelperDefBase {
  type: 'text';
  initial?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  mode?: 'text' | 'password';
}

export interface DateTimeHelperDef extends HelperDefBase {
  type: 'date_time';
  mode: 'date' | 'time' | 'datetime';
  initial?: string;
}

export interface SelectHelperDef extends HelperDefBase {
  type: 'select';
  options: string[];
  initial?: string;
}

export interface RandomHelperDef extends HelperDefBase {
  type: 'random';
  mode: 'number' | 'boolean';
  min?: number;
  max?: number;
  unit?: string;
}

export interface GroupHelperDef extends HelperDefBase {
  type: 'group';
  entityIds: string[];
  entityType: 'sensor' | 'binary';
  /** For sensor groups */
  aggregation?: 'min' | 'max' | 'mean' | 'median' | 'sum' | 'range' | 'product' | 'stdev' | 'first' | 'last';
  unit?: string;
}

export interface DerivativeSensorHelperDef extends HelperDefBase {
  type: 'derivative_sensor';
  sourceEntityId: string;
  /** Time window in seconds for smoothing */
  timeWindow?: number;
  precision?: number;
  unit?: string;
  timeUnit?: 's' | 'min' | 'h' | 'd';
}

export interface IntegralSensorHelperDef extends HelperDefBase {
  type: 'integral_sensor';
  sourceEntityId: string;
  method?: 'trapezoidal' | 'left' | 'right';
  precision?: number;
  unit?: string;
  timeUnit?: 's' | 'min' | 'h' | 'd';
}

export interface HistoryStatsHelperDef extends HelperDefBase {
  type: 'history_stats';
  sourceEntityId: string;
  /** State value(s) to track */
  targetState: string | string[];
  mode: 'time' | 'ratio' | 'count';
  /** Duration in seconds */
  period: number;
}

export interface ThresholdSensorHelperDef extends HelperDefBase {
  type: 'threshold_sensor';
  sourceEntityId: string;
  upper?: number;
  lower?: number;
  hysteresis?: number;
}

export interface SwitchAsXHelperDef extends HelperDefBase {
  type: 'switch_as_x';
  sourceEntityId: string;
  targetType: 'light' | 'cover' | 'fan' | 'lock';
}

export interface CombineSensorsHelperDef extends HelperDefBase {
  type: 'combine_sensors';
  entityIds: string[];
  aggregation: 'min' | 'max' | 'mean' | 'median' | 'sum' | 'range' | 'product' | 'stdev';
  unit?: string;
}

// -- Discriminated union ------------------------------------------------------

export type HelperDefinition =
  | ToggleHelperDef
  | CounterHelperDef
  | TimerHelperDef
  | ButtonHelperDef
  | NumberHelperDef
  | TextHelperDef
  | DateTimeHelperDef
  | SelectHelperDef
  | RandomHelperDef
  | GroupHelperDef
  | DerivativeSensorHelperDef
  | IntegralSensorHelperDef
  | HistoryStatsHelperDef
  | ThresholdSensorHelperDef
  | SwitchAsXHelperDef
  | CombineSensorsHelperDef;

// -- Helper type metadata for UI ----------------------------------------------

export interface HelperTypeInfo {
  type: HelperType;
  name: string;
  description: string;
  category: 'basic' | 'sensor' | 'advanced';
}

export const HELPER_TYPES: HelperTypeInfo[] = [
  { type: 'toggle', name: 'Toggle', description: 'Simple on/off boolean value', category: 'basic' },
  { type: 'button', name: 'Button', description: 'Trigger for automations — records last press time', category: 'basic' },
  { type: 'counter', name: 'Counter', description: 'Numeric counter with increment, decrement, and reset', category: 'basic' },
  { type: 'number', name: 'Number', description: 'Adjustable numeric value with min/max and step', category: 'basic' },
  { type: 'text', name: 'Text', description: 'User-editable text value', category: 'basic' },
  { type: 'date_time', name: 'Date and/or Time', description: 'Store a date, time, or both', category: 'basic' },
  { type: 'timer', name: 'Timer', description: 'Countdown timer with start, pause, cancel, and finish', category: 'basic' },
  { type: 'select', name: 'Select', description: 'Dropdown selection from a list of options', category: 'basic' },
  { type: 'random', name: 'Random', description: 'Random number or boolean value', category: 'basic' },
  { type: 'group', name: 'Group', description: 'Combine multiple entities into one', category: 'sensor' },
  { type: 'combine_sensors', name: 'Combine Sensors', description: 'Aggregate multiple sensor values (mean, sum, min, max, etc.)', category: 'sensor' },
  { type: 'derivative_sensor', name: 'Derivative Sensor', description: 'Rate of change of a source sensor value', category: 'sensor' },
  { type: 'integral_sensor', name: 'Integral Sensor', description: 'Accumulated sum over time (e.g. watts to kWh)', category: 'sensor' },
  { type: 'threshold_sensor', name: 'Threshold Sensor', description: 'Binary on/off based on a source sensor crossing a limit', category: 'sensor' },
  { type: 'history_stats', name: 'History Stats', description: 'Track how long an entity was in a specific state', category: 'sensor' },
  { type: 'switch_as_x', name: 'Change Device Type', description: 'Re-present a switch as a light, cover, fan, or lock', category: 'advanced' },
];
