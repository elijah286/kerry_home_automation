// ---------------------------------------------------------------------------
// Helpers integration: virtual devices from user-defined helper definitions
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth } from '@ha/shared';
import type { Integration } from '../registry.js';
import { helperEngine } from '../../helpers/engine.js';
import { logger } from '../../logger.js';

export class HelpersIntegration implements Integration {
  readonly id = 'helpers' as const;
  private running = false;
  private lastError: string | null = null;

  async start(): Promise<void> {
    try {
      await helperEngine.start();
      this.running = true;
      this.lastError = null;
      logger.info('Helpers integration started');
    } catch (err: any) {
      this.lastError = err.message;
      logger.error({ err }, 'Helpers integration failed to start');
    }
  }

  async stop(): Promise<void> {
    helperEngine.stop();
    this.running = false;
    logger.info('Helpers integration stopped');
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    await helperEngine.handleCommand(cmd);
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.running ? 'connected' : 'disconnected',
      lastConnected: this.running ? Date.now() : null,
      lastError: this.lastError,
      failureCount: 0,
    };
  }
}
