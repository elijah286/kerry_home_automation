// ---------------------------------------------------------------------------
// Aggregated ICS calendar feeds for the UI
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { getAggregatedCalendarFeeds } from '../lib/calendar-feeds.js';

export async function registerCalendarRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/calendar/feeds', async () => {
    const feeds = await getAggregatedCalendarFeeds();
    return { feeds };
  });
}
