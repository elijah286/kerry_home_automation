// ---------------------------------------------------------------------------
// Bridge event bus → pino logger so key system events show in the terminal
//
// Events that flow through the event bus (integration health, device state,
// automation execution) currently only reach WebSocket clients. This module
// mirrors the important ones into pino, which feeds the in-memory log buffer
// and the SSE stream consumed by the System Terminal UI.
// ---------------------------------------------------------------------------

import { eventBus } from './event-bus.js';
import { logger } from '../logger.js';
import type { ConnectionState } from '@ha/shared';

/** Track last-known integration connection state so we only log transitions. */
const integrationState = new Map<string, ConnectionState>();

/** Track device availability so we only log online/offline transitions, not every poll update. */
const deviceAvailability = new Map<string, boolean>();

/**
 * Start bridging event bus events to the logger.
 * Call once during startup after integrations are registered.
 */
export function startEventLogBridge(): void {
  // -----------------------------------------------------------------------
  // Integration health changes (connected → error, etc.)
  // -----------------------------------------------------------------------
  eventBus.on('integration_health', ({ id, health }) => {
    const prev = integrationState.get(id);
    const next = health.state;

    // Only log transitions, not repeated polls of the same state
    if (prev === next) return;
    integrationState.set(id, next);

    const ctx = { integration: id, state: next, prevState: prev ?? 'unknown' };

    if (next === 'connected') {
      logger.info(ctx, `Integration ${id} connected`);
    } else if (next === 'error') {
      logger.warn(
        { ...ctx, error: health.lastError ?? undefined },
        `Integration ${id} entered error state${health.lastError ? `: ${health.lastError}` : ''}`,
      );
    } else if (next === 'disconnected') {
      logger.warn(ctx, `Integration ${id} disconnected`);
    } else {
      logger.info(ctx, `Integration ${id} → ${next}`);
    }
  });

  // -----------------------------------------------------------------------
  // Device availability changes (online ↔ offline)
  // Only log meaningful transitions — not every temperature/state poll.
  // -----------------------------------------------------------------------
  eventBus.on('device_updated', ({ prev, current }) => {
    // New device discovered (first appearance)
    if (!prev) {
      logger.info(
        { deviceId: current.id, type: current.type, integration: current.integration },
        `Device discovered: ${current.name}`,
      );
      if ('available' in current) {
        deviceAvailability.set(current.id, (current as { available?: boolean }).available ?? true);
      }
      return;
    }

    // Availability transition (online ↔ offline)
    const prevAvail = deviceAvailability.get(current.id);
    const currAvail = 'available' in current ? (current as { available?: boolean }).available : undefined;
    if (currAvail !== undefined && prevAvail !== currAvail) {
      deviceAvailability.set(current.id, currAvail ?? true);
      if (currAvail) {
        logger.info(
          { deviceId: current.id, integration: current.integration },
          `Device online: ${current.name}`,
        );
      } else {
        logger.warn(
          { deviceId: current.id, integration: current.integration },
          `Device offline: ${current.name}`,
        );
      }
    }
  });

  // -----------------------------------------------------------------------
  // Device removed
  // -----------------------------------------------------------------------
  eventBus.on('device_removed', ({ deviceId }) => {
    deviceAvailability.delete(deviceId);
    logger.info({ deviceId }, `Device removed: ${deviceId}`);
  });

  // -----------------------------------------------------------------------
  // Automation executed
  // -----------------------------------------------------------------------
  eventBus.on('automation_executed', ({ automationId, executionId, status, triggeredAt }) => {
    const ctx = { automationId, executionId, status, triggeredAt };
    if (status === 'completed') {
      logger.info(ctx, `Automation completed: ${automationId}`);
    } else if (status === 'failed') {
      logger.warn(ctx, `Automation failed: ${automationId}`);
    } else if (status === 'aborted') {
      logger.warn(ctx, `Automation aborted: ${automationId}`);
    } else {
      // 'running' or any future status
      logger.info(ctx, `Automation ${status}: ${automationId}`);
    }
  });

  // -----------------------------------------------------------------------
  // Commands sent to devices
  // -----------------------------------------------------------------------
  eventBus.on('command', (cmd) => {
    const action = 'action' in cmd ? (cmd as { action?: string }).action : undefined;
    logger.info(
      { deviceId: cmd.deviceId, commandType: cmd.type, action },
      `Command → ${cmd.deviceId}: ${cmd.type}${action ? ` (${action})` : ''}`,
    );
  });

  logger.info('Event log bridge started — system events will appear in the terminal');
}
