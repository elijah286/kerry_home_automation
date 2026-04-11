// ---------------------------------------------------------------------------
// Integration registry: manages lifecycle of all integrations
// ---------------------------------------------------------------------------

import type { DeviceState, IntegrationId, IntegrationHealth, DeviceCommand, ConnectionState } from '@ha/shared';
import { stateStore } from '../state/store.js';
import { eventBus } from '../state/event-bus.js';
import { logger } from '../logger.js';

export interface Integration {
  readonly id: IntegrationId;
  start(): Promise<void>;
  stop(): Promise<void>;
  handleCommand(cmd: DeviceCommand): Promise<void>;
  getHealth(): IntegrationHealth;
}

class IntegrationRegistry {
  private integrations = new Map<IntegrationId, Integration>();

  register(integration: Integration): void {
    this.integrations.set(integration.id, integration);
  }

  get(id: IntegrationId): Integration | undefined {
    return this.integrations.get(id);
  }

  async startAll(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.integrations.values()].map(async (i) => {
        logger.info({ integration: i.id }, 'Starting integration');
        await i.start();
        this.emitHealth(i);
      }),
    );

    for (const [idx, result] of results.entries()) {
      if (result.status === 'rejected') {
        const id = [...this.integrations.keys()][idx];
        logger.error({ integration: id, err: result.reason }, 'Integration failed to start');
      }
    }
  }

  async stopAll(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.integrations.values()].map((i) => i.stop()),
    );
    for (const [idx, result] of results.entries()) {
      if (result.status === 'rejected') {
        const id = [...this.integrations.keys()][idx];
        logger.error({ integration: id, err: result.reason }, 'Integration failed to stop');
      }
    }
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    // Route to correct integration based on device state
    const device = stateStore.get(cmd.deviceId);
    if (!device) {
      throw new Error(`Device not found: ${cmd.deviceId}`);
    }
    const integration = this.integrations.get(device.integration);
    if (!integration) {
      throw new Error(`Integration not found: ${device.integration}`);
    }
    await integration.handleCommand(cmd);
  }

  async restart(id: IntegrationId): Promise<void> {
    const integration = this.integrations.get(id);
    if (!integration) {
      throw new Error(`Integration not registered: ${id}`);
    }
    logger.info({ integration: id }, 'Restarting integration');
    await integration.stop();
    await integration.start();
    this.emitHealth(integration);
  }

  getHealthAll(): Record<IntegrationId, IntegrationHealth> {
    const result = {} as Record<IntegrationId, IntegrationHealth>;
    for (const [id, integration] of this.integrations) {
      result[id] = integration.getHealth();
    }
    return result;
  }

  private emitHealth(i: Integration): void {
    eventBus.emit('integration_health', { id: i.id, health: i.getHealth() });
  }
}

export const registry = new IntegrationRegistry();
