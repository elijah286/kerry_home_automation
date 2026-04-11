// ---------------------------------------------------------------------------
// Weather integration: National Weather Service API
// Each entry = one location (lat/lon)
// ---------------------------------------------------------------------------

import type { DeviceCommand, IntegrationHealth, ConnectionState } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { NWSClient } from './nws-client.js';
import { mapWeatherState } from './mapper.js';

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

interface LocationCtx {
  entryId: string;
  label: string;
  client: NWSClient;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class WeatherIntegration implements Integration {
  readonly id = 'weather' as const;
  private locations = new Map<string, LocationCtx>();
  private stopping = false;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('weather');
    if (entries.length === 0) {
      logger.info('Weather: no entries configured');
      return;
    }

    this.stopping = false;
    this.emitHealth('connecting');

    for (const entry of entries) {
      if (!entry.enabled) continue;
      const lat = parseFloat(entry.config.latitude);
      const lon = parseFloat(entry.config.longitude);
      if (isNaN(lat) || isNaN(lon)) {
        logger.error({ entryId: entry.id }, 'Weather: invalid lat/lon');
        continue;
      }

      const label = entry.config.label || entry.label || 'Weather';
      const client = new NWSClient(lat, lon);
      const ctx: LocationCtx = { entryId: entry.id, label, client, pollTimer: null };
      this.locations.set(entry.id, ctx);

      // Initial poll
      try {
        await this.poll(ctx);
        this.lastConnected = Date.now();
      } catch (err) {
        logger.error({ err, entryId: entry.id }, 'Weather: initial poll failed');
        this.lastError = String(err);
      }

      // Start periodic polling
      ctx.pollTimer = setInterval(() => {
        if (this.stopping) return;
        this.poll(ctx).catch((err) => {
          logger.error({ err, entryId: entry.id }, 'Weather poll error');
          this.lastError = String(err);
        });
      }, POLL_INTERVAL_MS);
    }

    if (this.locations.size > 0 && this.lastConnected) {
      this.emitHealth('connected');
    } else if (this.locations.size > 0) {
      this.emitHealth('error');
    }

    logger.info({ locations: this.locations.size }, 'Weather integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const ctx of this.locations.values()) {
      if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    }
    this.locations.clear();
  }

  async handleCommand(_cmd: DeviceCommand): Promise<void> {
    // Weather is read-only
  }

  getHealth(): IntegrationHealth {
    return {
      state: this.lastConnected ? 'connected' : this.locations.size > 0 ? 'error' : 'disconnected',
      lastConnected: this.lastConnected,
      lastError: this.lastError,
      failureCount: 0,
    };
  }

  private async poll(ctx: LocationCtx): Promise<void> {
    const [observation, forecast] = await Promise.all([
      ctx.client.getCurrentConditions(),
      ctx.client.getForecast(),
    ]);

    const state = mapWeatherState(ctx.entryId, ctx.label, observation, forecast);
    stateStore.update(state);
    this.lastConnected = Date.now();
  }

  private emitHealth(state: ConnectionState): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state } });
  }
}
