// ---------------------------------------------------------------------------
// Sun integration: solar position & daylight via SunCalc (local computation)
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { mapSunState } from './mapper.js';

// Update every 60 seconds — sun position changes continuously
const POLL_INTERVAL_MS = 60 * 1000;

interface SunCtx {
  entryId: string;
  label: string;
  lat: number;
  lon: number;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class SunIntegration implements Integration {
  readonly id = 'sun' as const;
  private ctx: SunCtx | null = null;
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('sun');
    if (entries.length === 0) {
      logger.info('Sun: no entries configured');
      return;
    }

    this.stopping = false;
    this.emitHealth('connecting');

    const entry = entries.find((e) => e.enabled);
    if (!entry) {
      logger.info('Sun: no enabled entries');
      return;
    }

    const lat = parseFloat(entry.config.latitude);
    const lon = parseFloat(entry.config.longitude);
    if (isNaN(lat) || isNaN(lon)) {
      logger.error({ entryId: entry.id }, 'Sun: invalid lat/lon');
      this.lastError = 'Invalid latitude/longitude';
      this.emitHealth('error');
      return;
    }

    const label = entry.config.label || entry.label || 'Sun';
    this.ctx = { entryId: entry.id, label, lat, lon, pollTimer: null };

    // Initial computation
    this.poll();
    this.lastConnected = Date.now();

    // Periodic updates
    this.ctx.pollTimer = setInterval(() => {
      if (this.stopping) return;
      this.poll();
    }, POLL_INTERVAL_MS);

    this.emitHealth('connected');
    logger.info({ lat, lon }, 'Sun integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.ctx?.pollTimer) clearInterval(this.ctx.pollTimer);
    this.ctx = null;
  }

  async handleCommand(_cmd: DeviceCommand): Promise<void> {
    // Sun is read-only
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.ctx ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private poll(): void {
    if (!this.ctx) return;
    const state = mapSunState(this.ctx.entryId, this.ctx.label, this.ctx.lat, this.ctx.lon);
    stateStore.update(state);
    this.lastConnected = Date.now();
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
