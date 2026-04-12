// ---------------------------------------------------------------------------
// Aggregated ICS calendar feeds for the UI
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import type { IcalFeedSnapshot, IntegrationId } from '@ha/shared';
import { redis } from '../state/redis.js';
import * as entryStore from '../db/integration-entry-store.js';

const ICAL_IDS: IntegrationId[] = ['calendar'];

export async function registerCalendarRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/calendar/feeds', async () => {
    const feeds: IcalFeedSnapshot[] = [];

    for (const integration of ICAL_IDS) {
      const entries = await entryStore.getEntries(integration);
      for (const entry of entries) {
        if (!entry.enabled) continue;
        const label = entry.config.label?.trim() || entry.label || 'Calendar';
        const raw = await redis.get(`ical:${integration}:${entry.id}`);
        if (raw) {
          try {
            feeds.push(JSON.parse(raw) as IcalFeedSnapshot);
            continue;
          } catch {
            /* fall through */
          }
        }
        feeds.push({
          integration,
          entryId: entry.id,
          label,
          events: [],
          fetchedAt: null,
          error: 'Not synced yet — wait for the next refresh or restart the integration.',
        });
      }
    }

    return { feeds };
  });
}
