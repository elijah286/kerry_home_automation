// ---------------------------------------------------------------------------
// WebSocket event types (server → client)
// ---------------------------------------------------------------------------

import type { DeviceState, IntegrationId } from './devices.js';

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
  | { type: 'integration_health'; id: IntegrationId; health: IntegrationHealth };

export type WsClientMessage =
  | { type: 'ping' };
