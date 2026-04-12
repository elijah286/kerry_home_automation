// ---------------------------------------------------------------------------
// Helper engine: manages runtime state and behavior for all helper instances
// ---------------------------------------------------------------------------

import type {
  HelperDefinition, HelperToggleState, HelperCounterState, HelperTimerState,
  HelperButtonState, HelperNumberState, HelperTextState, HelperDateTimeState,
  HelperSelectState, HelperSensorState, DeviceState, DeviceCommand, HelperSensorKind,
  CounterHelperDef, NumberHelperDef, TimerHelperDef, TextHelperDef, SelectHelperDef,
  DateTimeHelperDef, RandomHelperDef, GroupHelperDef, DerivativeSensorHelperDef,
  IntegralSensorHelperDef, HistoryStatsHelperDef, ThresholdSensorHelperDef,
  SwitchAsXHelperDef, CombineSensorsHelperDef, ToggleHelperDef, ButtonHelperDef,
} from '@ha/shared';
import { stateStore } from '../state/store.js';
import { eventBus } from '../state/event-bus.js';
import { logger } from '../logger.js';
import * as yamlStore from './yaml-store.js';

// ---------------------------------------------------------------------------
// Per-helper runtime context
// ---------------------------------------------------------------------------

interface HelperRuntime {
  def: HelperDefinition;
  cleanup: () => void;
}

// ---------------------------------------------------------------------------
// Engine singleton
// ---------------------------------------------------------------------------

class HelperEngine {
  private runtimes = new Map<string, HelperRuntime>();
  private started = false;

  async start(): Promise<void> {
    const defs = await yamlStore.loadHelpers();
    logger.info({ count: defs.length }, 'Helpers: loading definitions');
    for (const def of defs) {
      if (def.enabled === false) continue;
      this.startHelper(def);
    }
    this.started = true;
  }

  async reload(): Promise<void> {
    this.stopAll();
    await this.start();
  }

  stop(): void {
    this.stopAll();
    this.started = false;
  }

  private stopAll(): void {
    for (const [id, rt] of this.runtimes) {
      rt.cleanup();
      stateStore.remove(`helpers.${id}`);
    }
    this.runtimes.clear();
  }

  private deviceId(helperId: string): string {
    return `helpers.${helperId}`;
  }

  private now(): number {
    return Date.now();
  }

  private base(def: HelperDefinition): Omit<DeviceState, 'type'> & { integration: 'helpers' } {
    return {
      id: this.deviceId(def.id),
      name: def.name,
      integration: 'helpers' as const,
      areaId: null,
      available: true,
      lastChanged: this.now(),
      lastUpdated: this.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // Start individual helper
  // ---------------------------------------------------------------------------

  private startHelper(def: HelperDefinition): void {
    switch (def.type) {
      case 'toggle': return this.startToggle(def);
      case 'counter': return this.startCounter(def);
      case 'timer': return this.startTimer(def);
      case 'button': return this.startButton(def);
      case 'number': return this.startNumber(def);
      case 'text': return this.startText(def);
      case 'select': return this.startSelect(def);
      case 'date_time': return this.startDateTime(def);
      case 'random': return this.startRandom(def);
      case 'group': return this.startGroup(def);
      case 'derivative_sensor': return this.startDerivative(def);
      case 'integral_sensor': return this.startIntegral(def);
      case 'history_stats': return this.startHistoryStats(def);
      case 'threshold_sensor': return this.startThreshold(def);
      case 'switch_as_x': return this.startSwitchAsX(def);
      case 'combine_sensors': return this.startCombineSensors(def);
    }
  }

  // -- Toggle -----------------------------------------------------------------

  private startToggle(def: ToggleHelperDef): void {
    const state: HelperToggleState = {
      ...this.base(def),
      type: 'helper_toggle',
      on: def.initial ?? false,
    };
    stateStore.update(state);
    this.runtimes.set(def.id, { def, cleanup: () => {} });
  }

  // -- Counter ----------------------------------------------------------------

  private startCounter(def: CounterHelperDef): void {
    const state: HelperCounterState = {
      ...this.base(def),
      type: 'helper_counter',
      value: def.initial ?? 0,
      min: def.min ?? -Infinity,
      max: def.max ?? Infinity,
      step: def.step ?? 1,
    };
    stateStore.update(state);
    this.runtimes.set(def.id, { def, cleanup: () => {} });
  }

  // -- Timer ------------------------------------------------------------------

  private startTimer(def: TimerHelperDef): void {
    const durationSec = parseDuration(def.duration ?? '00:00:00');
    const state: HelperTimerState = {
      ...this.base(def),
      type: 'helper_timer',
      status: 'idle',
      remaining: durationSec,
      duration: durationSec,
      finishedAt: null,
    };
    stateStore.update(state);
    // Timer tick handled in handleCommand when started
    this.runtimes.set(def.id, { def, cleanup: () => {} });
  }

  // -- Button -----------------------------------------------------------------

  private startButton(def: ButtonHelperDef): void {
    const state: HelperButtonState = {
      ...this.base(def),
      type: 'helper_button',
      lastPressed: null,
    };
    stateStore.update(state);
    this.runtimes.set(def.id, { def, cleanup: () => {} });
  }

  // -- Number -----------------------------------------------------------------

  private startNumber(def: NumberHelperDef): void {
    const state: HelperNumberState = {
      ...this.base(def),
      type: 'helper_number',
      value: def.initial ?? def.min ?? 0,
      min: def.min ?? 0,
      max: def.max ?? 100,
      step: def.step ?? 1,
      unit: def.unit ?? null,
      mode: def.mode ?? 'slider',
    };
    stateStore.update(state);
    this.runtimes.set(def.id, { def, cleanup: () => {} });
  }

  // -- Text -------------------------------------------------------------------

  private startText(def: TextHelperDef): void {
    const state: HelperTextState = {
      ...this.base(def),
      type: 'helper_text',
      value: def.initial ?? '',
    };
    stateStore.update(state);
    this.runtimes.set(def.id, { def, cleanup: () => {} });
  }

  // -- Select -----------------------------------------------------------------

  private startSelect(def: SelectHelperDef): void {
    const state: HelperSelectState = {
      ...this.base(def),
      type: 'helper_select',
      value: def.initial ?? def.options[0] ?? null,
      options: def.options,
    };
    stateStore.update(state);
    this.runtimes.set(def.id, { def, cleanup: () => {} });
  }

  // -- DateTime ---------------------------------------------------------------

  private startDateTime(def: DateTimeHelperDef): void {
    const state: HelperDateTimeState = {
      ...this.base(def),
      type: 'helper_datetime',
      value: def.initial ?? null,
      mode: def.mode,
    };
    stateStore.update(state);
    this.runtimes.set(def.id, { def, cleanup: () => {} });
  }

  // -- Random -----------------------------------------------------------------

  private startRandom(def: RandomHelperDef): void {
    const genValue = () => {
      if (def.mode === 'boolean') return Math.random() >= 0.5;
      const min = def.min ?? 0;
      const max = def.max ?? 20;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    const state: HelperSensorState = {
      ...this.base(def),
      type: 'helper_sensor',
      value: genValue(),
      unit: def.unit ?? null,
      helperKind: 'random',
    };
    stateStore.update(state);

    // Regenerate every 60s
    const timer = setInterval(() => {
      const current = stateStore.get(this.deviceId(def.id)) as HelperSensorState | undefined;
      if (!current) return;
      stateStore.update({ ...current, value: genValue(), lastUpdated: this.now() });
    }, 60_000);

    this.runtimes.set(def.id, { def, cleanup: () => clearInterval(timer) });
  }

  // -- Group ------------------------------------------------------------------

  private startGroup(def: GroupHelperDef): void {
    const state: HelperSensorState = {
      ...this.base(def),
      type: 'helper_sensor',
      value: null,
      unit: def.unit ?? null,
      helperKind: 'group',
    };
    stateStore.update(state);

    const handler = ({ current }: { prev?: DeviceState; current: DeviceState }) => {
      if (!def.entityIds.includes(current.id)) return;
      this.recomputeGroup(def);
    };
    eventBus.on('device_updated', handler);
    this.recomputeGroup(def);
    this.runtimes.set(def.id, { def, cleanup: () => eventBus.off('device_updated', handler) });
  }

  private recomputeGroup(def: GroupHelperDef): void {
    if (def.entityType === 'binary') {
      // Binary: any_on / all_on
      const values = def.entityIds.map((id) => {
        const d = stateStore.get(id);
        if (!d) return null;
        if ('on' in d) return (d as any).on as boolean;
        return null;
      }).filter((v): v is boolean => v !== null);
      const result = def.aggregation === 'min'
        ? values.every(Boolean) // all_on
        : values.some(Boolean); // any_on
      const current = stateStore.get(this.deviceId(def.id)) as HelperSensorState | undefined;
      if (current) stateStore.update({ ...current, value: result, lastUpdated: this.now() });
    } else {
      const values = this.collectNumericValues(def.entityIds);
      const result = aggregate(values, def.aggregation ?? 'mean');
      const current = stateStore.get(this.deviceId(def.id)) as HelperSensorState | undefined;
      if (current) stateStore.update({ ...current, value: result, lastUpdated: this.now() });
    }
  }

  // -- Derivative Sensor ------------------------------------------------------

  private startDerivative(def: DerivativeSensorHelperDef): void {
    const state: HelperSensorState = {
      ...this.base(def),
      type: 'helper_sensor',
      value: null,
      unit: def.unit ?? null,
      helperKind: 'derivative',
    };
    stateStore.update(state);

    const samples: Array<{ t: number; v: number }> = [];
    const windowMs = (def.timeWindow ?? 0) * 1000;

    const handler = ({ current }: { prev?: DeviceState; current: DeviceState }) => {
      if (current.id !== def.sourceEntityId) return;
      const v = extractNumeric(current);
      if (v === null) return;
      const now = this.now();
      samples.push({ t: now, v });

      // Trim window
      if (windowMs > 0) {
        const cutoff = now - windowMs;
        while (samples.length > 0 && samples[0].t < cutoff) samples.shift();
      } else if (samples.length > 2) {
        samples.splice(0, samples.length - 2);
      }

      if (samples.length < 2) return;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = (last.t - first.t) / timeUnitMs(def.timeUnit ?? 's');
      if (dt === 0) return;
      const derivative = (last.v - first.v) / dt;
      const precision = def.precision ?? 3;
      const rounded = Math.round(derivative * 10 ** precision) / 10 ** precision;

      const s = stateStore.get(this.deviceId(def.id)) as HelperSensorState | undefined;
      if (s) stateStore.update({ ...s, value: rounded, lastUpdated: now });
    };

    eventBus.on('device_updated', handler);
    this.runtimes.set(def.id, { def, cleanup: () => eventBus.off('device_updated', handler) });
  }

  // -- Integral Sensor --------------------------------------------------------

  private startIntegral(def: IntegralSensorHelperDef): void {
    const state: HelperSensorState = {
      ...this.base(def),
      type: 'helper_sensor',
      value: 0,
      unit: def.unit ?? null,
      helperKind: 'integral',
    };
    stateStore.update(state);

    let lastSample: { t: number; v: number } | null = null;
    const method = def.method ?? 'trapezoidal';

    const handler = ({ current }: { prev?: DeviceState; current: DeviceState }) => {
      if (current.id !== def.sourceEntityId) return;
      const v = extractNumeric(current);
      if (v === null) return;
      const now = this.now();

      if (lastSample !== null) {
        const dtHours = (now - lastSample.t) / timeUnitMs(def.timeUnit ?? 'h');
        let area: number;
        if (method === 'left') area = lastSample.v * dtHours;
        else if (method === 'right') area = v * dtHours;
        else area = ((lastSample.v + v) / 2) * dtHours; // trapezoidal

        const s = stateStore.get(this.deviceId(def.id)) as HelperSensorState | undefined;
        if (s) {
          const total = ((s.value as number) ?? 0) + area;
          const precision = def.precision ?? 3;
          const rounded = Math.round(total * 10 ** precision) / 10 ** precision;
          stateStore.update({ ...s, value: rounded, lastUpdated: now });
        }
      }
      lastSample = { t: now, v };
    };

    eventBus.on('device_updated', handler);
    this.runtimes.set(def.id, { def, cleanup: () => eventBus.off('device_updated', handler) });
  }

  // -- History Stats ----------------------------------------------------------

  private startHistoryStats(def: HistoryStatsHelperDef): void {
    const state: HelperSensorState = {
      ...this.base(def),
      type: 'helper_sensor',
      value: 0,
      unit: def.mode === 'ratio' ? '%' : def.mode === 'time' ? 'h' : null,
      helperKind: 'history_stats',
    };
    stateStore.update(state);

    const targetStates = Array.isArray(def.targetState) ? def.targetState : [def.targetState];
    const transitions: Array<{ t: number; inState: boolean }> = [];

    const recompute = () => {
      const now = this.now();
      const cutoff = now - def.period * 1000;
      // Remove old
      while (transitions.length > 0 && transitions[0].t < cutoff) transitions.shift();

      let timeInState = 0;
      let count = 0;
      for (let i = 0; i < transitions.length; i++) {
        const entry = transitions[i];
        const next = transitions[i + 1];
        if (entry.inState) {
          const end = next ? next.t : now;
          timeInState += end - entry.t;
          count++;
        }
      }

      let value: number;
      if (def.mode === 'time') value = Math.round((timeInState / 3_600_000) * 1000) / 1000; // hours
      else if (def.mode === 'ratio') value = Math.round((timeInState / (def.period * 1000)) * 10000) / 100; // %
      else value = count;

      const s = stateStore.get(this.deviceId(def.id)) as HelperSensorState | undefined;
      if (s) stateStore.update({ ...s, value, lastUpdated: now });
    };

    const handler = ({ current }: { prev?: DeviceState; current: DeviceState }) => {
      if (current.id !== def.sourceEntityId) return;
      const stateVal = getStateString(current);
      transitions.push({ t: this.now(), inState: targetStates.includes(stateVal) });
      recompute();
    };

    eventBus.on('device_updated', handler);
    const timer = setInterval(recompute, 60_000); // recompute every minute
    this.runtimes.set(def.id, {
      def,
      cleanup: () => { eventBus.off('device_updated', handler); clearInterval(timer); },
    });
  }

  // -- Threshold Sensor -------------------------------------------------------

  private startThreshold(def: ThresholdSensorHelperDef): void {
    const state: HelperSensorState = {
      ...this.base(def),
      type: 'helper_sensor',
      value: false,
      unit: null,
      helperKind: 'threshold',
    };
    stateStore.update(state);

    const hysteresis = def.hysteresis ?? 0;
    let lastResult: boolean | null = null;

    const handler = ({ current }: { prev?: DeviceState; current: DeviceState }) => {
      if (current.id !== def.sourceEntityId) return;
      const v = extractNumeric(current);
      if (v === null) return;

      let result: boolean;
      if (def.upper !== undefined && def.lower !== undefined) {
        // Both limits: on when between
        result = v >= def.lower && v <= def.upper;
      } else if (def.upper !== undefined) {
        if (lastResult === true) result = v >= (def.upper - hysteresis);
        else result = v > (def.upper + hysteresis);
      } else if (def.lower !== undefined) {
        if (lastResult === true) result = v <= (def.lower + hysteresis);
        else result = v < (def.lower - hysteresis);
      } else {
        result = false;
      }

      lastResult = result;
      const s = stateStore.get(this.deviceId(def.id)) as HelperSensorState | undefined;
      if (s) stateStore.update({ ...s, value: result, lastUpdated: this.now() });
    };

    eventBus.on('device_updated', handler);
    this.runtimes.set(def.id, { def, cleanup: () => eventBus.off('device_updated', handler) });
  }

  // -- Switch as X ------------------------------------------------------------

  private startSwitchAsX(def: SwitchAsXHelperDef): void {
    const state: HelperSensorState = {
      ...this.base(def),
      type: 'helper_sensor',
      value: false,
      unit: null,
      helperKind: 'switch_as_x',
    };
    stateStore.update(state);

    const handler = ({ current }: { prev?: DeviceState; current: DeviceState }) => {
      if (current.id !== def.sourceEntityId) return;
      const on = 'on' in current ? (current as any).on : false;
      const s = stateStore.get(this.deviceId(def.id)) as HelperSensorState | undefined;
      if (s) stateStore.update({ ...s, value: on, lastUpdated: this.now() });
    };

    eventBus.on('device_updated', handler);
    // Initial sync
    const source = stateStore.get(def.sourceEntityId);
    if (source && 'on' in source) {
      const s = stateStore.get(this.deviceId(def.id)) as HelperSensorState | undefined;
      if (s) stateStore.update({ ...s, value: (source as any).on });
    }
    this.runtimes.set(def.id, { def, cleanup: () => eventBus.off('device_updated', handler) });
  }

  // -- Combine Sensors --------------------------------------------------------

  private startCombineSensors(def: CombineSensorsHelperDef): void {
    const state: HelperSensorState = {
      ...this.base(def),
      type: 'helper_sensor',
      value: null,
      unit: def.unit ?? null,
      helperKind: 'combine',
    };
    stateStore.update(state);

    const handler = ({ current }: { prev?: DeviceState; current: DeviceState }) => {
      if (!def.entityIds.includes(current.id)) return;
      this.recomputeCombine(def);
    };
    eventBus.on('device_updated', handler);
    this.recomputeCombine(def);
    this.runtimes.set(def.id, { def, cleanup: () => eventBus.off('device_updated', handler) });
  }

  private recomputeCombine(def: CombineSensorsHelperDef): void {
    const values = this.collectNumericValues(def.entityIds);
    const result = aggregate(values, def.aggregation);
    const s = stateStore.get(this.deviceId(def.id)) as HelperSensorState | undefined;
    if (s) stateStore.update({ ...s, value: result, lastUpdated: this.now() });
  }

  // ---------------------------------------------------------------------------
  // Command handling
  // ---------------------------------------------------------------------------

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    const device = stateStore.get(cmd.deviceId);
    if (!device) throw new Error(`Helper device not found: ${cmd.deviceId}`);

    switch (cmd.type) {
      case 'helper_toggle': {
        const d = device as HelperToggleState;
        const on = cmd.action === 'toggle' ? !d.on : cmd.action === 'turn_on';
        stateStore.update({ ...d, on, lastChanged: this.now(), lastUpdated: this.now() });
        break;
      }
      case 'helper_counter': {
        const d = device as HelperCounterState;
        let value = d.value;
        if (cmd.action === 'increment') value = Math.min(d.max, value + d.step);
        else if (cmd.action === 'decrement') value = Math.max(d.min, value - d.step);
        else if (cmd.action === 'reset') {
          const rt = this.runtimes.get(cmd.deviceId.replace('helpers.', ''));
          value = (rt?.def as CounterHelperDef)?.initial ?? 0;
        }
        else if (cmd.action === 'set' && cmd.value !== undefined) value = Math.max(d.min, Math.min(d.max, cmd.value));
        stateStore.update({ ...d, value, lastChanged: this.now(), lastUpdated: this.now() });
        break;
      }
      case 'helper_timer': {
        const d = device as HelperTimerState;
        if (cmd.action === 'start') {
          const duration = cmd.duration ?? d.duration;
          stateStore.update({ ...d, status: 'active', remaining: duration, duration, finishedAt: null, lastChanged: this.now(), lastUpdated: this.now() });
          this.startTimerTick(d.id);
        } else if (cmd.action === 'pause') {
          this.stopTimerTick(d.id);
          stateStore.update({ ...d, status: 'paused', lastChanged: this.now(), lastUpdated: this.now() });
        } else if (cmd.action === 'cancel') {
          this.stopTimerTick(d.id);
          stateStore.update({ ...d, status: 'idle', remaining: d.duration, finishedAt: null, lastChanged: this.now(), lastUpdated: this.now() });
        } else if (cmd.action === 'finish') {
          this.stopTimerTick(d.id);
          stateStore.update({ ...d, status: 'idle', remaining: 0, finishedAt: this.now(), lastChanged: this.now(), lastUpdated: this.now() });
        }
        break;
      }
      case 'helper_button': {
        const d = device as HelperButtonState;
        stateStore.update({ ...d, lastPressed: this.now(), lastChanged: this.now(), lastUpdated: this.now() });
        break;
      }
      case 'helper_number': {
        const d = device as HelperNumberState;
        let value = d.value;
        if (cmd.action === 'set' && cmd.value !== undefined) value = Math.max(d.min, Math.min(d.max, cmd.value));
        else if (cmd.action === 'increment') value = Math.min(d.max, value + d.step);
        else if (cmd.action === 'decrement') value = Math.max(d.min, value - d.step);
        stateStore.update({ ...d, value, lastChanged: this.now(), lastUpdated: this.now() });
        break;
      }
      case 'helper_text': {
        const d = device as HelperTextState;
        stateStore.update({ ...d, value: cmd.value, lastChanged: this.now(), lastUpdated: this.now() });
        break;
      }
      case 'helper_select': {
        const d = device as HelperSelectState;
        if (d.options.includes(cmd.value)) {
          stateStore.update({ ...d, value: cmd.value, lastChanged: this.now(), lastUpdated: this.now() });
        }
        break;
      }
      case 'helper_datetime': {
        const d = device as HelperDateTimeState;
        stateStore.update({ ...d, value: cmd.value, lastChanged: this.now(), lastUpdated: this.now() });
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Timer tick management
  // ---------------------------------------------------------------------------

  private timerIntervals = new Map<string, ReturnType<typeof setInterval>>();

  private startTimerTick(deviceId: string): void {
    this.stopTimerTick(deviceId);
    const interval = setInterval(() => {
      const d = stateStore.get(deviceId) as HelperTimerState | undefined;
      if (!d || d.status !== 'active') {
        this.stopTimerTick(deviceId);
        return;
      }
      const remaining = d.remaining - 1;
      if (remaining <= 0) {
        this.stopTimerTick(deviceId);
        stateStore.update({ ...d, status: 'idle', remaining: 0, finishedAt: this.now(), lastChanged: this.now(), lastUpdated: this.now() });
      } else {
        stateStore.update({ ...d, remaining, lastUpdated: this.now() });
      }
    }, 1000);
    this.timerIntervals.set(deviceId, interval);
  }

  private stopTimerTick(deviceId: string): void {
    const interval = this.timerIntervals.get(deviceId);
    if (interval) {
      clearInterval(interval);
      this.timerIntervals.delete(deviceId);
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private collectNumericValues(entityIds: string[]): number[] {
    const values: number[] = [];
    for (const id of entityIds) {
      const d = stateStore.get(id);
      if (!d) continue;
      const v = extractNumeric(d);
      if (v !== null) values.push(v);
    }
    return values;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDuration(str: string): number {
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function timeUnitMs(unit: string): number {
  switch (unit) {
    case 's': return 1000;
    case 'min': return 60_000;
    case 'h': return 3_600_000;
    case 'd': return 86_400_000;
    default: return 1000;
  }
}

function extractNumeric(device: DeviceState): number | null {
  if ('value' in device) {
    const v = (device as any).value;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? null : n; }
  }
  if ('temperature' in device && typeof (device as any).temperature === 'number') return (device as any).temperature;
  if ('brightness' in device && typeof (device as any).brightness === 'number') return (device as any).brightness;
  if ('powerW' in device && typeof (device as any).powerW === 'number') return (device as any).powerW;
  if ('batteryLevel' in device && typeof (device as any).batteryLevel === 'number') return (device as any).batteryLevel;
  return null;
}

function getStateString(device: DeviceState): string {
  if ('on' in device) return (device as any).on ? 'on' : 'off';
  if ('status' in device) return String((device as any).status);
  if ('value' in device) return String((device as any).value);
  return 'unknown';
}

function aggregate(values: number[], method: string): number | null {
  if (values.length === 0) return null;
  switch (method) {
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'mean': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    case 'range': return Math.max(...values) - Math.min(...values);
    case 'product': return values.reduce((a, b) => a * b, 1);
    case 'stdev': {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sq = values.map((v) => (v - mean) ** 2);
      return Math.sqrt(sq.reduce((a, b) => a + b, 0) / values.length);
    }
    case 'first': return values[0];
    case 'last': return values[values.length - 1];
    default: return null;
  }
}

export const helperEngine = new HelperEngine();
