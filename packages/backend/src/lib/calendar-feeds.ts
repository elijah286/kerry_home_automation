// ---------------------------------------------------------------------------
// Shared calendar feed aggregation (ICS snapshots in Redis)
// ---------------------------------------------------------------------------

import type { IcalCalendarEvent, IcalFeedSnapshot, IntegrationId } from '@ha/shared';
import { redis } from '../state/redis.js';
import * as entryStore from '../db/integration-entry-store.js';

const ICAL_IDS: IntegrationId[] = ['calendar'];

export async function getAggregatedCalendarFeeds(): Promise<IcalFeedSnapshot[]> {
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

  return feeds;
}

function eventStartAsTime(e: IcalCalendarEvent): number {
  if (e.allDay && /^\d{4}-\d{2}-\d{2}$/.test(e.start)) {
    return new Date(`${e.start}T00:00:00`).getTime();
  }
  return new Date(e.start).getTime();
}

/** Events that start on or after `from` and before `to` (half-open by start time). */
export function filterCalendarEventsInRange(
  feeds: IcalFeedSnapshot[],
  fromMs: number,
  toMs: number,
  feedLabelContains?: string,
): { feeds: { label: string; entryId: string; integration: string; events: IcalCalendarEvent[] }[]; range: { from: string; to: string } } {
  const needle = feedLabelContains?.trim().toLowerCase();
  const out: { label: string; entryId: string; integration: string; events: IcalCalendarEvent[] }[] = [];

  for (const f of feeds) {
    if (needle && !f.label.toLowerCase().includes(needle)) continue;
    const events = (f.events ?? [])
      .filter((e: IcalCalendarEvent) => {
        const t = eventStartAsTime(e);
        return t >= fromMs && t < toMs;
      })
      .sort((a: IcalCalendarEvent, b: IcalCalendarEvent) => eventStartAsTime(a) - eventStartAsTime(b));
    out.push({
      label: f.label,
      entryId: f.entryId,
      integration: f.integration,
      events,
    });
  }

  return {
    feeds: out,
    range: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() },
  };
}
