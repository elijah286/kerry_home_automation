'use client';

// ---------------------------------------------------------------------------
// Card wrapper around <NotificationInbox>. This replaces the conditional
// alert tiles used in the legacy Lovelace dashboard.
// ---------------------------------------------------------------------------

import type { NotificationInboxCard as NotificationInboxCardDescriptor } from '@ha/shared';
import { NotificationInbox } from '@/components/notifications/NotificationInbox';

export function NotificationInboxCard({ card }: { card: NotificationInboxCardDescriptor }) {
  return (
    <NotificationInbox
      title={card.title ?? 'Notifications'}
      filter={{
        minSeverity: card.filter?.minSeverity,
        categories: card.filter?.categories,
        includeResolved: card.includeResolved,
      }}
      maxRows={card.maxRows}
    />
  );
}
