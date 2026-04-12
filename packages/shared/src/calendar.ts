// ---------------------------------------------------------------------------
// Calendar feed types (ICS calendar subscriptions)
// ---------------------------------------------------------------------------

import type { IntegrationId } from './devices.js';

export interface IcalCalendarEvent {
  uid: string;
  summary: string;
  /** ISO 8601 datetime or all-day YYYY-MM-DD */
  start: string;
  end?: string;
  allDay: boolean;
  location?: string;
}

export interface IcalFeedSnapshot {
  integration: IntegrationId;
  entryId: string;
  label: string;
  events: IcalCalendarEvent[];
  fetchedAt: number | null;
  error: string | null;
}
