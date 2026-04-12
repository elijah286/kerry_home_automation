// ---------------------------------------------------------------------------
// Automation engine — evaluates triggers, conditions, executes actions
//
// Performance-critical design decisions (modeled after Home Assistant):
//   1. Device trigger index: deviceId → runtime[] for O(1) lookup
//   2. Command routing: wired to registry.handleCommand() not orphaned events
//   3. Concurrency modes: single, restart, queued, parallel with max caps
//   4. Execution timeout: AbortController kills runaway automations
//   5. State deduplication: skip events where monitored attrs unchanged
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import cron from 'node-cron';
import SunCalc from 'suncalc';
import type {
  Automation, AutomationDefinition, AutomationTrigger,
  AutomationCondition, AutomationAction, AutomationActionLog,
  AutomationExecutionStatus, DeviceCommand, AutomationMode,
} from '@ha/shared';
import { query } from '../db/pool.js';
import { eventBus } from '../state/event-bus.js';
import { stateStore } from '../state/store.js';
import { registry } from '../integrations/registry.js';
import { executionWriter } from './execution-writer.js';
import { logger } from '../logger.js';

const MAX_CALL_DEPTH = 5;
const DEFAULT_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_QUEUED = 10;
const DEFAULT_MAX_PARALLEL = 10;

// ---------------------------------------------------------------------------
// Runtime state per automation
// ---------------------------------------------------------------------------

interface AutomationRuntime {
  automation: Automation;
  cronTasks: cron.ScheduledTask[];
  sunTimers: ReturnType<typeof setTimeout>[];
  forTimers: Map<string, ReturnType<typeof setTimeout>>;

  // Concurrency tracking
  runningAbort: AbortController | null;      // current run (single/restart)
  runningPromise: Promise<void> | null;      // current run promise
  queue: (() => void)[];                     // queued mode pending runs
  activeCount: number;                       // parallel mode active count
}

// ---------------------------------------------------------------------------
// Device trigger index entry
// ---------------------------------------------------------------------------

interface DeviceTriggerEntry {
  runtime: AutomationRuntime;
  trigger: Extract<AutomationTrigger, { type: 'device_state' }>;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

class AutomationEngine {
  private runtimes = new Map<string, AutomationRuntime>();

  /** O(1) index: deviceId → list of (runtime, trigger) pairs */
  private deviceIndex = new Map<string, DeviceTriggerEntry[]>();

  private deviceListener: ((event: { prev: unknown; current: unknown }) => void) | null = null;
  private commandListener: ((cmd: DeviceCommand) => void) | null = null;
  private midnightTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const automations = await this.loadAll();
    for (const a of automations) {
      if (a.enabled) this.register(a);
    }

    // Listen for device state changes
    this.deviceListener = (event) => {
      this.handleDeviceUpdate(
        event.prev as Record<string, unknown> | undefined,
        event.current as Record<string, unknown>,
      );
    };
    eventBus.on('device_updated', this.deviceListener as never);

    // Listen for device commands (from automation actions)
    this.commandListener = (cmd) => {
      void this.handleCommand(cmd);
    };
    eventBus.on('command', this.commandListener as never);

    this.scheduleMidnightRecalc();
    executionWriter.start();
    logger.info({ count: automations.filter(a => a.enabled).length }, 'Automation engine started');
  }

  stop(): void {
    this.started = false;
    for (const rt of this.runtimes.values()) this.teardown(rt);
    this.runtimes.clear();
    this.deviceIndex.clear();

    if (this.deviceListener) {
      eventBus.off('device_updated', this.deviceListener as never);
      this.deviceListener = null;
    }
    if (this.commandListener) {
      eventBus.off('command', this.commandListener as never);
      this.commandListener = null;
    }
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
      this.midnightTimer = null;
    }
    executionWriter.stop();
    logger.info('Automation engine stopped');
  }

  async reload(id?: string): Promise<void> {
    if (id) {
      const existing = this.runtimes.get(id);
      if (existing) {
        this.removeFromDeviceIndex(existing);
        this.teardown(existing);
      }
      this.runtimes.delete(id);

      const row = await this.loadOne(id);
      if (row && row.enabled) this.register(row);
    } else {
      for (const rt of this.runtimes.values()) this.teardown(rt);
      this.runtimes.clear();
      this.deviceIndex.clear();

      const automations = await this.loadAll();
      for (const a of automations) {
        if (a.enabled) this.register(a);
      }
    }
  }

  async trigger(id: string, depth = 0): Promise<void> {
    if (depth >= MAX_CALL_DEPTH) {
      logger.warn({ id, depth }, 'Automation call depth exceeded');
      return;
    }

    const rt = this.runtimes.get(id);
    if (!rt) {
      // Load even if not registered (for manual triggers of disabled automations)
      const a = await this.loadOne(id);
      if (!a) { logger.warn({ id }, 'Automation not found for trigger'); return; }
      const abort = new AbortController();
      setTimeout(() => abort.abort(), DEFAULT_EXECUTION_TIMEOUT_MS);
      await this.execute(a, 'manual', undefined, depth, abort.signal);
      return;
    }

    await this.executeTrigger(rt, 'manual', undefined);
  }

  // -- Registration ----------------------------------------------------------

  private register(automation: Automation): void {
    const rt: AutomationRuntime = {
      automation,
      cronTasks: [],
      sunTimers: [],
      forTimers: new Map(),
      runningAbort: null,
      runningPromise: null,
      queue: [],
      activeCount: 0,
    };

    for (const trigger of automation.triggers) {
      switch (trigger.type) {
        case 'time':
          if (cron.validate(trigger.cron)) {
            rt.cronTasks.push(cron.schedule(trigger.cron, () => {
              void this.executeTrigger(rt, 'time', { cron: trigger.cron });
            }));
          } else {
            logger.warn({ id: automation.id, cron: trigger.cron }, 'Invalid cron expression');
          }
          break;
        case 'sun':
          this.registerSunTrigger(rt, trigger);
          break;
        case 'device_state':
          // Add to device index for O(1) lookup
          this.addToDeviceIndex(rt, trigger);
          break;
        // manual has no registration
      }
    }

    this.runtimes.set(automation.id, rt);
  }

  private teardown(rt: AutomationRuntime): void {
    for (const task of rt.cronTasks) task.stop();
    for (const timer of rt.sunTimers) clearTimeout(timer);
    for (const timer of rt.forTimers.values()) clearTimeout(timer);
    // Abort any running execution
    if (rt.runningAbort) rt.runningAbort.abort();
    // Clear queued runs
    rt.queue.length = 0;
    rt.cronTasks = [];
    rt.sunTimers = [];
    rt.forTimers.clear();
  }

  // -- Device trigger index --------------------------------------------------

  private addToDeviceIndex(
    rt: AutomationRuntime,
    trigger: Extract<AutomationTrigger, { type: 'device_state' }>,
  ): void {
    const entries = this.deviceIndex.get(trigger.deviceId);
    const entry: DeviceTriggerEntry = { runtime: rt, trigger };
    if (entries) {
      entries.push(entry);
    } else {
      this.deviceIndex.set(trigger.deviceId, [entry]);
    }
  }

  private removeFromDeviceIndex(rt: AutomationRuntime): void {
    for (const trigger of rt.automation.triggers) {
      if (trigger.type !== 'device_state') continue;
      const entries = this.deviceIndex.get(trigger.deviceId);
      if (!entries) continue;
      const filtered = entries.filter(e => e.runtime !== rt);
      if (filtered.length === 0) {
        this.deviceIndex.delete(trigger.deviceId);
      } else {
        this.deviceIndex.set(trigger.deviceId, filtered);
      }
    }
  }

  // -- Sun triggers ----------------------------------------------------------

  private registerSunTrigger(rt: AutomationRuntime, trigger: Extract<AutomationTrigger, { type: 'sun' }>): void {
    const schedule = () => {
      const coords = this.getHomeCoordinates();
      if (!coords) return;

      const now = new Date();
      const times = SunCalc.getTimes(now, coords.lat, coords.lng);
      let target = trigger.event === 'sunrise' ? times.sunrise : times.sunset;

      if (trigger.offset) {
        const offsetMs = this.parseOffset(trigger.offset);
        target = new Date(target.getTime() + offsetMs);
      }

      // If already passed today, schedule for tomorrow
      if (target.getTime() <= now.getTime()) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowTimes = SunCalc.getTimes(tomorrow, coords.lat, coords.lng);
        target = trigger.event === 'sunrise' ? tomorrowTimes.sunrise : tomorrowTimes.sunset;
        if (trigger.offset) {
          target = new Date(target.getTime() + this.parseOffset(trigger.offset));
        }
      }

      const delay = target.getTime() - now.getTime();
      if (delay > 0 && delay < 86_400_000) {
        const timer = setTimeout(() => {
          void this.executeTrigger(rt, 'sun', { event: trigger.event, offset: trigger.offset });
        }, delay);
        rt.sunTimers.push(timer);
      }
    };

    schedule();
  }

  private scheduleMidnightRecalc(): void {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 30, 0); // 30s past midnight
    const delay = midnight.getTime() - now.getTime();

    this.midnightTimer = setTimeout(() => {
      // Invalidate cached coordinates
      this.homeCoords = undefined;

      // Recalculate all sun triggers
      for (const rt of this.runtimes.values()) {
        for (const timer of rt.sunTimers) clearTimeout(timer);
        rt.sunTimers = [];
        for (const trigger of rt.automation.triggers) {
          if (trigger.type === 'sun') this.registerSunTrigger(rt, trigger);
        }
      }
      this.scheduleMidnightRecalc();
    }, delay);
  }

  private parseOffset(offset: string): number {
    const negative = offset.startsWith('-');
    const clean = offset.replace(/^[+-]/, '');
    const parts = clean.split(':').map(Number);
    const ms = ((parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)) * 1000;
    return negative ? -ms : ms;
  }

  private homeCoords: { lat: number; lng: number } | null | undefined = undefined;

  private getHomeCoordinates(): { lat: number; lng: number } | null {
    if (this.homeCoords !== undefined) return this.homeCoords;
    void this.loadHomeCoordinates();
    return null;
  }

  private async loadHomeCoordinates(): Promise<void> {
    try {
      const { rows } = await query<{ value: unknown }>(
        `SELECT value FROM system_settings WHERE key = 'home_location'`,
      );
      if (rows.length > 0) {
        const val = rows[0].value as { lat?: number; lng?: number };
        if (val.lat && val.lng) {
          this.homeCoords = { lat: val.lat, lng: val.lng };
          return;
        }
      }
    } catch { /* ignore */ }
    this.homeCoords = null;
  }

  // -- Device state triggers (O(1) indexed lookup) ----------------------------

  private handleDeviceUpdate(prev: Record<string, unknown> | undefined, current: Record<string, unknown>): void {
    if (!prev) return;
    const deviceId = current.id as string;

    // O(1) index lookup — only get automations that care about this device
    const entries = this.deviceIndex.get(deviceId);
    if (!entries || entries.length === 0) return;

    for (const { runtime: rt, trigger } of entries) {
      const attr = trigger.attribute;
      const prevVal = (prev as Record<string, unknown>)[attr];
      const curVal = (current as Record<string, unknown>)[attr];

      // State deduplication — skip if the monitored attribute hasn't changed
      if (prevVal === curVal) continue;

      // Check from/to constraints
      if (trigger.from !== undefined && trigger.from !== prevVal) continue;
      if (trigger.to !== undefined && trigger.to !== curVal) continue;

      // Handle 'for' duration
      if (trigger.for) {
        const key = `${rt.automation.id}:${trigger.deviceId}:${attr}`;
        const existing = rt.forTimers.get(key);
        if (existing) clearTimeout(existing);

        const durationMs = this.parseDuration(trigger.for);
        const timer = setTimeout(() => {
          rt.forTimers.delete(key);
          // Re-check state is still the expected value
          const device = stateStore.get(trigger.deviceId);
          if (device && (device as unknown as Record<string, unknown>)[attr] === curVal) {
            void this.executeTrigger(rt, 'device_state', { deviceId, attribute: attr, from: prevVal, to: curVal });
          }
        }, durationMs);
        rt.forTimers.set(key, timer);
      } else {
        void this.executeTrigger(rt, 'device_state', { deviceId, attribute: attr, from: prevVal, to: curVal });
      }
    }
  }

  // -- Command handling (routes automation commands to integrations) ----------

  private async handleCommand(cmd: DeviceCommand): Promise<void> {
    try {
      await registry.handleCommand(cmd);
    } catch (err) {
      logger.error({ err, deviceId: cmd.deviceId }, 'Automation command failed');
    }
  }

  // -- Execution (concurrency modes) -----------------------------------------

  private async executeTrigger(
    rt: AutomationRuntime,
    triggerType: string,
    triggerDetail?: Record<string, unknown>,
  ): Promise<void> {
    const { automation } = rt;

    switch (automation.mode) {
      case 'single': {
        if (rt.runningPromise) {
          logger.debug({ id: automation.id }, 'Skipping (single mode, already running)');
          return;
        }
        const abort = new AbortController();
        const timeoutId = setTimeout(() => abort.abort(), DEFAULT_EXECUTION_TIMEOUT_MS);
        rt.runningAbort = abort;
        rt.runningPromise = this.execute(automation, triggerType, triggerDetail, 0, abort.signal)
          .finally(() => {
            clearTimeout(timeoutId);
            rt.runningAbort = null;
            rt.runningPromise = null;
          });
        break;
      }

      case 'restart': {
        // Cancel current run if any, then start new
        if (rt.runningAbort) {
          rt.runningAbort.abort();
          // Wait for the old run to clean up
          if (rt.runningPromise) {
            await rt.runningPromise.catch(() => {});
          }
        }
        const abort = new AbortController();
        const timeoutId = setTimeout(() => abort.abort(), DEFAULT_EXECUTION_TIMEOUT_MS);
        rt.runningAbort = abort;
        rt.runningPromise = this.execute(automation, triggerType, triggerDetail, 0, abort.signal)
          .finally(() => {
            clearTimeout(timeoutId);
            rt.runningAbort = null;
            rt.runningPromise = null;
          });
        break;
      }

      case 'queued': {
        if (rt.activeCount > 0) {
          // Queue it if under the limit
          if (rt.queue.length >= DEFAULT_MAX_QUEUED) {
            logger.debug({ id: automation.id, queued: rt.queue.length }, 'Queue full, dropping trigger');
            return;
          }
          // Enqueue — will be started when current run completes
          return new Promise<void>((resolve) => {
            rt.queue.push(() => {
              void this.runQueued(rt, triggerType, triggerDetail).then(resolve);
            });
          });
        }
        await this.runQueued(rt, triggerType, triggerDetail);
        break;
      }

      case 'parallel': {
        if (rt.activeCount >= DEFAULT_MAX_PARALLEL) {
          logger.debug({ id: automation.id, active: rt.activeCount }, 'Max parallel reached, dropping trigger');
          return;
        }
        rt.activeCount++;
        const abort = new AbortController();
        const timeoutId = setTimeout(() => abort.abort(), DEFAULT_EXECUTION_TIMEOUT_MS);
        this.execute(automation, triggerType, triggerDetail, 0, abort.signal)
          .finally(() => {
            clearTimeout(timeoutId);
            rt.activeCount--;
          });
        break;
      }
    }
  }

  private async runQueued(
    rt: AutomationRuntime,
    triggerType: string,
    triggerDetail?: Record<string, unknown>,
  ): Promise<void> {
    rt.activeCount++;
    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), DEFAULT_EXECUTION_TIMEOUT_MS);
    rt.runningAbort = abort;

    try {
      await this.execute(rt.automation, triggerType, triggerDetail, 0, abort.signal);
    } finally {
      clearTimeout(timeoutId);
      rt.runningAbort = null;
      rt.activeCount--;

      // Start next queued run if any
      const next = rt.queue.shift();
      if (next) next();
    }
  }

  // -- Core execution --------------------------------------------------------

  private async execute(
    automation: AutomationDefinition,
    triggerType: string,
    triggerDetail: Record<string, unknown> | undefined,
    depth: number,
    signal: AbortSignal,
  ): Promise<void> {
    const executionId = randomUUID();
    const triggeredAt = new Date();
    const actionLogs: AutomationActionLog[] = [];
    let status: AutomationExecutionStatus = 'running';
    let error: string | undefined;

    // Check abort before starting
    if (signal.aborted) {
      status = 'aborted';
      executionWriter.write({
        id: executionId,
        automationId: automation.id,
        triggeredAt,
        triggerType,
        triggerDetail,
        conditionsPassed: false,
        actionsExecuted: [],
        status: 'aborted',
        completedAt: new Date(),
      });
      return;
    }

    executionWriter.write({
      id: executionId,
      automationId: automation.id,
      triggeredAt,
      triggerType,
      triggerDetail,
      conditionsPassed: false,
      actionsExecuted: [],
      status: 'running',
    });

    eventBus.emit('automation_executed', {
      automationId: automation.id,
      executionId,
      status: 'running',
      triggeredAt: triggeredAt.getTime(),
    });

    let conditionsPassedResult = false;

    try {
      // Evaluate conditions (synchronous — no async needed)
      conditionsPassedResult =
        automation.conditions.length === 0 || this.evaluateConditions(automation.conditions);

      if (!conditionsPassedResult) {
        status = 'completed';
        return;
      }

      // Execute actions
      await this.executeActions(automation.actions, actionLogs, depth, signal);
      status = signal.aborted ? 'aborted' : 'completed';
    } catch (err) {
      if (signal.aborted) {
        status = 'aborted';
        error = 'Execution aborted (timeout or restart)';
      } else {
        status = 'failed';
        error = err instanceof Error ? err.message : String(err);
        logger.error({ err, automationId: automation.id }, 'Automation execution failed');
      }
    } finally {
      const completedAt = new Date();

      // Update last_triggered
      void query(
        `UPDATE automations SET last_triggered = $1, updated_at = NOW() WHERE id = $2`,
        [triggeredAt, automation.id],
      ).catch(() => {});

      executionWriter.write({
        id: executionId,
        automationId: automation.id,
        triggeredAt,
        triggerType,
        triggerDetail,
        conditionsPassed: conditionsPassedResult,
        actionsExecuted: actionLogs,
        status,
        error,
        completedAt,
      });

      eventBus.emit('automation_executed', {
        automationId: automation.id,
        executionId,
        status,
        triggeredAt: triggeredAt.getTime(),
      });

      logger.info(
        {
          automation: automation.name,
          automationId: automation.id,
          trigger: triggerType,
          status,
          conditionsPassed: conditionsPassedResult,
          ...(error ? { error } : {}),
        },
        'Automation run finished',
      );
    }
  }

  // -- Condition evaluation --------------------------------------------------

  private evaluateConditions(conditions: AutomationCondition[]): boolean {
    return conditions.every(c => this.evaluateCondition(c));
  }

  private evaluateCondition(condition: AutomationCondition): boolean {
    switch (condition.type) {
      case 'device_state': {
        const device = stateStore.get(condition.deviceId);
        if (!device) return false;
        const val = (device as unknown as Record<string, unknown>)[condition.attribute];
        return this.compareValues(val, condition.op, condition.value);
      }
      case 'time_window': {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [ah, am] = condition.after.split(':').map(Number);
        const [bh, bm] = condition.before.split(':').map(Number);
        const after = ah * 60 + am;
        const before = bh * 60 + bm;
        if (after <= before) {
          return currentMinutes >= after && currentMinutes <= before;
        }
        return currentMinutes >= after || currentMinutes <= before;
      }
      case 'and':
        return condition.conditions.every(c => this.evaluateCondition(c));
      case 'or':
        return condition.conditions.some(c => this.evaluateCondition(c));
      case 'not':
        return !this.evaluateCondition(condition.condition);
    }
  }

  private compareValues(actual: unknown, op: string, expected: unknown): boolean {
    switch (op) {
      case 'eq': return actual === expected;
      case 'gt': return Number(actual) > Number(expected);
      case 'lt': return Number(actual) < Number(expected);
      case 'gte': return Number(actual) >= Number(expected);
      case 'lte': return Number(actual) <= Number(expected);
      default: return false;
    }
  }

  // -- Action execution ------------------------------------------------------

  private async executeActions(
    actions: AutomationAction[],
    logs: AutomationActionLog[],
    depth: number,
    signal: AbortSignal,
  ): Promise<void> {
    for (let i = 0; i < actions.length; i++) {
      // Check abort between each action
      if (signal.aborted) {
        logger.debug('Automation aborted mid-execution');
        return;
      }

      const action = actions[i];
      const start = Date.now();
      const log: AutomationActionLog = {
        index: i,
        actionType: action.type,
        result: 'success',
        durationMs: 0,
      };

      try {
        switch (action.type) {
          case 'device_command': {
            log.deviceId = action.deviceId;
            // Route directly to integration instead of orphaned event
            await registry.handleCommand(action.command);
            break;
          }
          case 'delay': {
            const ms = this.parseDuration(action.duration);
            await this.abortableDelay(ms, signal);
            break;
          }
          case 'condition': {
            const passed = this.evaluateCondition(action.condition);
            const branch = passed ? action.then : (action.else ?? []);
            if (branch.length > 0) {
              await this.executeActions(branch, logs, depth, signal);
            }
            log.result = passed ? 'success' : 'skipped';
            break;
          }
          case 'call_automation': {
            log.deviceId = action.automationId;
            await this.trigger(action.automationId, depth + 1);
            break;
          }
          case 'log': {
            logger.info({ automationLog: true, message: action.message }, 'Automation log action');
            break;
          }
        }
      } catch (err) {
        if (signal.aborted) {
          log.result = 'skipped';
        } else {
          log.result = 'failed';
          log.error = err instanceof Error ? err.message : String(err);
        }
      }

      log.durationMs = Date.now() - start;
      logs.push(log);
    }
  }

  /** Delay that resolves immediately on abort */
  private abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { resolve(); return; }
      const timer = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolve(); // resolve, not reject — let the abort check in executeActions handle it
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private parseDuration(duration: string): number {
    if (duration.includes(':')) {
      const parts = duration.split(':').map(Number);
      return ((parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)) * 1000;
    }
    return Number(duration) * 1000;
  }

  // -- Database access -------------------------------------------------------

  private async loadAll(): Promise<Automation[]> {
    try {
      const { rows } = await query<{
        id: string; name: string; group_name: string | null; description: string | null;
        enabled: boolean; mode: string; definition: unknown;
        last_triggered: Date | null; created_at: Date; updated_at: Date;
      }>('SELECT * FROM automations ORDER BY group_name NULLS LAST, name');

      return rows.map(r => this.rowToAutomation(r));
    } catch {
      return [];
    }
  }

  private async loadOne(id: string): Promise<Automation | null> {
    const { rows } = await query<{
      id: string; name: string; group_name: string | null; description: string | null;
      enabled: boolean; mode: string; definition: unknown;
      last_triggered: Date | null; created_at: Date; updated_at: Date;
    }>('SELECT * FROM automations WHERE id = $1', [id]);

    return rows.length > 0 ? this.rowToAutomation(rows[0]) : null;
  }

  private rowToAutomation(row: {
    id: string; name: string; group_name: string | null; description: string | null;
    enabled: boolean; mode: string; definition: unknown;
    last_triggered: Date | null; created_at: Date; updated_at: Date;
  }): Automation {
    const def = row.definition as { triggers: []; conditions: []; actions: [] };
    return {
      id: row.id,
      name: row.name,
      group: row.group_name ?? undefined,
      description: row.description ?? undefined,
      enabled: row.enabled,
      mode: (row.mode as Automation['mode']) ?? 'single',
      triggers: def.triggers ?? [],
      conditions: def.conditions ?? [],
      actions: def.actions ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      lastTriggered: row.last_triggered?.toISOString() ?? null,
    };
  }
}

export const automationEngine = new AutomationEngine();
