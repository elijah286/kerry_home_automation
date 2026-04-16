// ---------------------------------------------------------------------------
// WebSocket event types (server → client)
// ---------------------------------------------------------------------------

import type { DeviceState, IntegrationId } from './devices.js';
import type { AutomationExecutionStatus } from './automations.js';
import type { Notification } from './notifications.js';

export type ConnectionState =
  | 'init'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface IntegrationHealth {
  state: ConnectionState;
  lastConnected: number | null;
  lastError: string | null;
  failureCount: number;
}

export type WsServerMessage =
  | { type: 'snapshot'; devices: DeviceState[]; integrations: Record<IntegrationId, IntegrationHealth> }
  | { type: 'device_updated'; device: DeviceState }
  | { type: 'device_removed'; deviceId: string }
  | { type: 'integration_health'; id: IntegrationId; health: IntegrationHealth }
  | { type: 'automation_executed'; automationId: string; executionId: string; status: AutomationExecutionStatus; triggeredAt: number }
  | { type: 'session_refresh'; userId: string }
  | { type: 'notifications_snapshot'; notifications: Notification[] }
  | { type: 'notification_created'; notification: Notification }
  | { type: 'notification_updated'; notification: Notification }
  | { type: 'notification_removed'; id: string };

export type WsClientMessage =
  | { type: 'ping' };
