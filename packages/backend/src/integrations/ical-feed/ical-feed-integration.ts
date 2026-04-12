// ---------------------------------------------------------------------------
// Poll ICS calendar subscription URLs and cache events in Redis for the calendar UI
// ---------------------------------------------------------------------------

import type { IntegrationHealth, ConnectionState, IntegrationId } from '@ha/shared';
import type { Integration } from '../registry.js';
import { redis } from '../../state/redis.js';
import { logger } from '../../logger.js';
import { eventBus } from '../../state/event-bus.js';
import * as entryStore from '../../db/integration-entry-store.js';
import { parseIcsToEvents } from './parse-ics.js';

const REFRESH_MS = 15 * 60_000;

function redisKey(integration: IntegrationId, entryId: string): string {
  return `ical:${integration}:${entryId}`;
}

export class IcalFeedIntegration implements Integration {
  readonly id = 'calendar' as const;
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private stopping = false;
  private lastError: string | null = null;
  private lastOk: number | null = null;

  async start(): Promise<void> {
    const entries = await entryStore.getEntries(this.id);
    this.stopping = false;
    this.lastError = null;

    for (const entry of entries) {
      if (!entry.enabled) continue;
      const url = entry.config.ical_url?.trim();
      if (!url) continue;

      const run = async () => {
        if (this.stopping) return;
        await this.fetchOne(entry.id, url, entry.label || 'Calendar');
      };

      await run();
      const t = setInterval(() => {
        run().catch(() => {});
      }, REFRESH_MS);
      this.timers.set(entry.id, t);
    }

    logger.info({ integration: this.id, feeds: this.timers.size }, 'ICS calendar integration started');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }

  async handleCommand(): Promise<void> {}

  getHealth(): IntegrationHealth {
    const state: ConnectionState =
      this.timers.size > 0 ? (this.lastError ? 'error' : 'connected') : 'disconnected';
    return {
      state,
      lastConnected: this.lastOk,
      lastError: this.lastError,
      failureCount: this.lastError ? 1 : 0,
    };
  }

  private emitHealth(): void {
    eventBus.emit('integration_health', { id: this.id, health: { ...this.getHealth(), state: this.getHealth().state } });
  }

  private async fetchOne(entryId: string, rawUrl: string, label: string): Promise<void> {
    const fetchUrl = rawUrl.replace(/^webcal:/i, 'https:');
    try {
      const res = await fetch(fetchUrl, {
        headers: { Accept: 'text/calendar, application/octet-stream, */*', 'User-Agent': 'HomeAutomation/1.0' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      const events = parseIcsToEvents(text);
      const payload = JSON.stringify({
        integration: this.id,
        entryId,
        label,
        events,
        fetchedAt: Date.now(),
        error: null,
      });
      await redis.set(redisKey(this.id, entryId), payload);
      this.lastOk = Date.now();
      this.lastError = null;
      this.emitHealth();
      logger.info({ integration: this.id, entryId, events: events.length }, 'ICS feed refreshed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      await redis.set(
        redisKey(this.id, entryId),
        JSON.stringify({
          integration: this.id,
          entryId,
          label,
          events: [],
          fetchedAt: Date.now(),
          error: msg,
        }),
      );
      this.emitHealth();
      logger.warn({ integration: this.id, entryId, err: msg }, 'ICS feed fetch failed');
    }
  }
}
