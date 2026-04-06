import type {
  EntityState,
  SystemMode,
  BusEvent,
  StateChangedEvent,
} from '@home-automation/shared';
import { eventBus } from '../state/event-bus.js';
import { stateManager } from '../state/manager.js';
import { logger } from '../logger.js';
import { query } from '../db/pool.js';
import { scheduler } from './scheduler.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TriggerConfig {
  type: 'state_change' | 'time' | 'sun' | 'threshold' | 'event';
  entity_id?: string;
  from?: string;
  to?: string;
  cron?: string;
  event_type?: string;
  above?: number;
  below?: number;
  attribute?: string;
}

export interface ConditionConfig {
  type: 'state' | 'time_window' | 'mode' | 'template';
  entity_id?: string;
  state?: string | string[];
  after?: string;
  before?: string;
  mode?: string | string[];
  fn?: (ctx: AutomationContext) => boolean;
}

export interface ActionConfig {
  type: 'command' | 'set_state' | 'delay' | 'choose' | 'sequence' | 'call';
  entity_id?: string;
  command?: string;
  data?: Record<string, unknown>;
  state?: string;
  attributes?: Record<string, unknown>;
  delay_ms?: number;
  choices?: { conditions: ConditionConfig[]; actions: ActionConfig[] }[];
  default_actions?: ActionConfig[];
  actions?: ActionConfig[];
  fn?: (ctx: AutomationContext) => Promise<void>;
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  triggers: TriggerConfig[];
  conditions: ConditionConfig[];
  actions: ActionConfig[];
  mode?: 'single' | 'queued' | 'restart' | 'parallel';
}

export interface AutomationContext {
  trigger: {
    entity_id?: string;
    from?: string;
    to?: string;
    event?: BusEvent;
  };
  getState: (entityId: string) => EntityState | undefined;
  getMode: () => SystemMode;
  sendCommand: (entityId: string, command: string, data?: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface RunningRule {
  rule: AutomationRule;
  abortController: AbortController | null;
  runCount: number;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class AutomationEngine {
  private rules = new Map<string, RunningRule>();
  private busListeners: Array<() => void> = [];

  register(rule: AutomationRule): void {
    if (this.rules.has(rule.id)) {
      this.teardownRuleTriggers(rule.id);
    }
    this.rules.set(rule.id, { rule, abortController: null, runCount: 0 });
    this.setupRuleTriggers(rule);
    logger.info({ ruleId: rule.id, name: rule.name }, 'Automation registered');
  }

  unregister(ruleId: string): void {
    this.teardownRuleTriggers(ruleId);
    this.rules.delete(ruleId);
    logger.info({ ruleId }, 'Automation unregistered');
  }

  async init(): Promise<void> {
    await this.loadFromDatabase();
    logger.info({ count: this.rules.size }, 'Automation engine initialized');
  }

  stop(): void {
    for (const [id] of this.rules) {
      this.teardownRuleTriggers(id);
    }
    for (const cleanup of this.busListeners) cleanup();
    this.busListeners = [];
    this.rules.clear();
    logger.info('Automation engine stopped');
  }

  getRules(): AutomationRule[] {
    return [...this.rules.values()].map((r) => r.rule);
  }

  // -----------------------------------------------------------------------
  // Trigger wiring
  // -----------------------------------------------------------------------

  private setupRuleTriggers(rule: AutomationRule): void {
    for (const trigger of rule.triggers) {
      switch (trigger.type) {
        case 'state_change':
          this.wireStateChangeTrigger(rule, trigger);
          break;
        case 'time':
          this.wireTimeTrigger(rule, trigger);
          break;
        case 'sun':
          this.wireSunTrigger(rule, trigger);
          break;
        case 'threshold':
          this.wireThresholdTrigger(rule, trigger);
          break;
        case 'event':
          this.wireEventTrigger(rule, trigger);
          break;
      }
    }
  }

  private teardownRuleTriggers(ruleId: string): void {
    const entry = this.rules.get(ruleId);
    if (!entry) return;
    entry.abortController?.abort();

    // Remove scheduler entries for this rule
    for (const trigger of entry.rule.triggers) {
      if (trigger.type === 'time' || trigger.type === 'sun') {
        scheduler.removeSchedule(`auto_${ruleId}_${trigger.type}_${trigger.cron ?? trigger.entity_id ?? ''}`);
      }
    }
  }

  private wireStateChangeTrigger(rule: AutomationRule, trigger: TriggerConfig): void {
    const handler = (event: StateChangedEvent) => {
      if (trigger.entity_id && event.entity_id !== trigger.entity_id) return;
      if (trigger.from && event.old_state?.state !== trigger.from) return;
      if (trigger.to && event.new_state.state !== trigger.to) return;

      const ctx = this.buildContext({
        entity_id: event.entity_id,
        from: event.old_state?.state,
        to: event.new_state.state,
        event,
      });
      void this.runRule(rule.id, ctx);
    };

    eventBus.on('state_changed', handler);
    this.busListeners.push(() => eventBus.off('state_changed', handler));
  }

  private wireTimeTrigger(rule: AutomationRule, trigger: TriggerConfig): void {
    if (!trigger.cron) return;
    const schedId = `auto_${rule.id}_time_${trigger.cron}`;
    scheduler.addSchedule(schedId, trigger.cron, () => {
      const ctx = this.buildContext({});
      void this.runRule(rule.id, ctx);
    });
  }

  private wireSunTrigger(rule: AutomationRule, trigger: TriggerConfig): void {
    const expr = trigger.entity_id ?? 'sunrise';
    const schedId = `auto_${rule.id}_sun_${expr}`;
    scheduler.addSchedule(schedId, expr, () => {
      const ctx = this.buildContext({});
      void this.runRule(rule.id, ctx);
    });
  }

  private wireThresholdTrigger(rule: AutomationRule, trigger: TriggerConfig): void {
    if (!trigger.entity_id) return;
    let lastCrossed = false;

    const handler = (event: StateChangedEvent) => {
      if (event.entity_id !== trigger.entity_id) return;

      const attr = trigger.attribute;
      const value = attr
        ? (event.new_state.attributes[attr] as number)
        : parseFloat(event.new_state.state);
      if (typeof value !== 'number' || isNaN(value)) return;

      let crossed = false;
      if (trigger.above !== undefined && value > trigger.above) crossed = true;
      if (trigger.below !== undefined && value < trigger.below) crossed = true;

      if (crossed && !lastCrossed) {
        const ctx = this.buildContext({
          entity_id: event.entity_id,
          from: event.old_state?.state,
          to: event.new_state.state,
          event,
        });
        void this.runRule(rule.id, ctx);
      }
      lastCrossed = crossed;
    };

    eventBus.on('state_changed', handler);
    this.busListeners.push(() => eventBus.off('state_changed', handler));
  }

  private wireEventTrigger(rule: AutomationRule, trigger: TriggerConfig): void {
    if (!trigger.event_type) return;

    const handler = (event: BusEvent) => {
      if (event.type !== trigger.event_type) return;
      const ctx = this.buildContext({ event });
      void this.runRule(rule.id, ctx);
    };

    eventBus.on('*', handler);
    this.busListeners.push(() => eventBus.off('*', handler));
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  private async runRule(ruleId: string, ctx: AutomationContext): Promise<void> {
    const entry = this.rules.get(ruleId);
    if (!entry || !entry.rule.enabled) return;

    const executionMode = entry.rule.mode ?? 'single';

    if (executionMode === 'single' && entry.runCount > 0) return;
    if (executionMode === 'restart' && entry.abortController) {
      entry.abortController.abort();
    }

    if (!this.checkConditions(entry.rule.conditions, ctx)) {
      logger.debug({ ruleId }, 'Conditions not met, skipping');
      return;
    }

    const abort = new AbortController();
    entry.abortController = abort;
    entry.runCount++;
    const startTime = Date.now();

    try {
      logger.debug({ ruleId, name: entry.rule.name }, 'Executing automation');
      await this.executeActions(entry.rule.actions, ctx, abort.signal);
      await this.logExecution(ruleId, entry.rule.name, 'success', Date.now() - startTime);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        logger.debug({ ruleId }, 'Automation aborted');
        await this.logExecution(ruleId, entry.rule.name, 'aborted', Date.now() - startTime);
      } else {
        logger.error({ err, ruleId }, 'Automation execution failed');
        await this.logExecution(
          ruleId,
          entry.rule.name,
          'error',
          Date.now() - startTime,
          err instanceof Error ? err.message : String(err),
        );
      }
    } finally {
      entry.runCount--;
      if (entry.abortController === abort) {
        entry.abortController = null;
      }
    }
  }

  private checkConditions(conditions: ConditionConfig[], ctx: AutomationContext): boolean {
    return conditions.every((cond) => this.evaluateCondition(cond, ctx));
  }

  private evaluateCondition(cond: ConditionConfig, ctx: AutomationContext): boolean {
    switch (cond.type) {
      case 'state': {
        if (!cond.entity_id) return true;
        const state = ctx.getState(cond.entity_id);
        if (!state) return false;
        if (cond.state === undefined) return true;
        const allowed = Array.isArray(cond.state) ? cond.state : [cond.state];
        return allowed.includes(state.state);
      }

      case 'time_window': {
        const now = nowMinutes();
        const after = cond.after ? parseTimeToMinutes(cond.after) : 0;
        const before = cond.before ? parseTimeToMinutes(cond.before) : 24 * 60;
        if (after <= before) return now >= after && now < before;
        return now >= after || now < before; // wraps midnight
      }

      case 'mode': {
        const current = ctx.getMode();
        if (!cond.mode) return true;
        const allowed = Array.isArray(cond.mode) ? cond.mode : [cond.mode];
        return allowed.includes(current);
      }

      case 'template': {
        if (!cond.fn) return true;
        try {
          return cond.fn(ctx);
        } catch {
          return false;
        }
      }

      default:
        return true;
    }
  }

  private async executeActions(
    actions: ActionConfig[],
    ctx: AutomationContext,
    signal: AbortSignal,
  ): Promise<void> {
    for (const action of actions) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await this.executeAction(action, ctx, signal);
    }
  }

  private async executeAction(
    action: ActionConfig,
    ctx: AutomationContext,
    signal: AbortSignal,
  ): Promise<void> {
    switch (action.type) {
      case 'command': {
        if (!action.entity_id || !action.command) break;
        ctx.sendCommand(action.entity_id, action.command, action.data);
        break;
      }

      case 'set_state': {
        if (!action.entity_id) break;
        await stateManager.setState(
          action.entity_id,
          action.state ?? '',
          action.attributes,
        );
        break;
      }

      case 'delay': {
        if (action.delay_ms && action.delay_ms > 0) {
          await delay(action.delay_ms, signal);
        }
        break;
      }

      case 'choose': {
        if (!action.choices) break;
        let matched = false;
        for (const choice of action.choices) {
          if (this.checkConditions(choice.conditions, ctx)) {
            await this.executeActions(choice.actions, ctx, signal);
            matched = true;
            break;
          }
        }
        if (!matched && action.default_actions) {
          await this.executeActions(action.default_actions, ctx, signal);
        }
        break;
      }

      case 'sequence': {
        if (action.actions) {
          await this.executeActions(action.actions, ctx, signal);
        }
        break;
      }

      case 'call': {
        if (action.fn) {
          await action.fn(ctx);
        }
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Context builder
  // -----------------------------------------------------------------------

  private buildContext(trigger: AutomationContext['trigger']): AutomationContext {
    return {
      trigger,
      getState: (entityId) => stateManager.getState(entityId),
      getMode: () => stateManager.getSystemMode(),
      sendCommand: (entityId, command, data) => stateManager.handleCommand(entityId, command, data),
    };
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  private async loadFromDatabase(): Promise<void> {
    try {
      const result = await query<{
        id: string;
        name: string;
        description: string | null;
        enabled: boolean;
        trigger_config: TriggerConfig[];
        condition_config: ConditionConfig[] | null;
        action_config: ActionConfig[];
      }>('SELECT id, name, description, enabled, trigger_config, condition_config, action_config FROM automations WHERE enabled = true');

      for (const row of result.rows) {
        const rule: AutomationRule = {
          id: row.id,
          name: row.name,
          description: row.description ?? undefined,
          enabled: row.enabled,
          triggers: row.trigger_config,
          conditions: row.condition_config ?? [],
          actions: row.action_config,
        };
        this.register(rule);
      }

      logger.info({ count: result.rows.length }, 'Loaded automations from database');
    } catch (err) {
      logger.warn({ err }, 'Could not load automations from database (table may not exist yet)');
    }
  }

  async saveRule(rule: AutomationRule): Promise<void> {
    await query(
      `INSERT INTO automations (id, name, description, enabled, trigger_config, condition_config, action_config, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         enabled = EXCLUDED.enabled,
         trigger_config = EXCLUDED.trigger_config,
         condition_config = EXCLUDED.condition_config,
         action_config = EXCLUDED.action_config,
         updated_at = NOW()`,
      [
        rule.id,
        rule.name,
        rule.description ?? null,
        rule.enabled,
        JSON.stringify(rule.triggers),
        JSON.stringify(rule.conditions),
        JSON.stringify(rule.actions),
      ],
    );
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.unregister(ruleId);
    await query('DELETE FROM automations WHERE id = $1', [ruleId]);
  }

  private async logExecution(
    ruleId: string,
    _ruleName: string,
    status: 'success' | 'error' | 'aborted',
    durationMs: number,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO automation_log (automation_id, triggered_by, success, error, duration_ms)
         VALUES ($1, $2, $3, $4, $5)`,
        [ruleId, 'engine', status === 'success', errorMessage ?? null, durationMs],
      );
    } catch (err) {
      logger.warn({ err, ruleId }, 'Failed to log automation execution');
    }
  }
}

export const automationEngine = new AutomationEngine();
