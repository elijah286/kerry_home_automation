// ---------------------------------------------------------------------------
// Automation types — trigger/condition/action model
// ---------------------------------------------------------------------------

import type { DeviceCommand } from './commands.js';

// -- Triggers ----------------------------------------------------------------

export type TimeTrigger = {
  type: 'time';
  /** Standard 5-field cron expression */
  cron: string;
};

export type DeviceStateTrigger = {
  type: 'device_state';
  deviceId: string;
  /** Property name on the device state (e.g. "on", "brightness", "power") */
  attribute: string;
  from?: unknown;
  to?: unknown;
  /** Duration the state must be held before firing, e.g. "00:05:00" */
  for?: string;
};

export type SunTrigger = {
  type: 'sun';
  event: 'sunrise' | 'sunset';
  /** Offset from sun event, e.g. "-00:15:00" for 15 min before */
  offset?: string;
};

export type ManualTrigger = {
  type: 'manual';
};

export type AutomationTrigger =
  | TimeTrigger
  | DeviceStateTrigger
  | SunTrigger
  | ManualTrigger;

// -- Conditions --------------------------------------------------------------

export type DeviceStateCondition = {
  type: 'device_state';
  deviceId: string;
  attribute: string;
  op: 'eq' | 'gt' | 'lt' | 'gte' | 'lte';
  value: unknown;
};

export type TimeWindowCondition = {
  type: 'time_window';
  /** HH:MM 24-hour format */
  after: string;
  /** HH:MM 24-hour format */
  before: string;
};

export type AndCondition = {
  type: 'and';
  conditions: AutomationCondition[];
};

export type OrCondition = {
  type: 'or';
  conditions: AutomationCondition[];
};

export type NotCondition = {
  type: 'not';
  condition: AutomationCondition;
};

export type AutomationCondition =
  | DeviceStateCondition
  | TimeWindowCondition
  | AndCondition
  | OrCondition
  | NotCondition;

// -- Actions -----------------------------------------------------------------

export type DeviceCommandAction = {
  type: 'device_command';
  deviceId: string;
  command: DeviceCommand;
};

export type DelayAction = {
  type: 'delay';
  /** Duration string: "HH:MM:SS" or number of seconds */
  duration: string;
};

export type ConditionalAction = {
  type: 'condition';
  condition: AutomationCondition;
  then: AutomationAction[];
  else?: AutomationAction[];
};

export type CallAutomationAction = {
  type: 'call_automation';
  automationId: string;
};

export type LogAction = {
  type: 'log';
  message: string;
};

export type AutomationAction =
  | DeviceCommandAction
  | DelayAction
  | ConditionalAction
  | CallAutomationAction
  | LogAction;

// -- Definition & Runtime ----------------------------------------------------

export type AutomationMode = 'single' | 'restart' | 'queued' | 'parallel';

export interface AutomationDefinition {
  id: string;
  name: string;
  group?: string;
  description?: string;
  enabled: boolean;
  mode: AutomationMode;
  triggers: AutomationTrigger[];
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

export interface Automation extends AutomationDefinition {
  createdAt: string;
  updatedAt: string;
  lastTriggered: string | null;
}

export interface AutomationCreate {
  id: string;
  name: string;
  group?: string;
  description?: string;
  enabled?: boolean;
  mode?: AutomationMode;
  triggers: AutomationTrigger[];
  conditions?: AutomationCondition[];
  actions: AutomationAction[];
}

export interface AutomationUpdate {
  name?: string;
  group?: string | null;
  description?: string | null;
  enabled?: boolean;
  mode?: AutomationMode;
  triggers?: AutomationTrigger[];
  conditions?: AutomationCondition[];
  actions?: AutomationAction[];
}

// -- Execution Log -----------------------------------------------------------

export type AutomationExecutionStatus = 'running' | 'completed' | 'failed' | 'aborted';

export interface AutomationActionLog {
  index: number;
  actionType: string;
  deviceId?: string;
  result: 'success' | 'failed' | 'skipped';
  error?: string;
  durationMs: number;
}

export interface AutomationExecutionLog {
  id: string;
  automationId: string;
  triggeredAt: string;
  triggerType: string;
  triggerDetail?: Record<string, unknown>;
  conditionsPassed: boolean;
  actionsExecuted: AutomationActionLog[];
  status: AutomationExecutionStatus;
  error?: string;
  completedAt?: string;
}
