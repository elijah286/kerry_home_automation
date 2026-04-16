// ---------------------------------------------------------------------------
// Notification service — shared types.
//
// A notification is a distinct, addressable event that the system wants to
// surface to one or more users across one or more surfaces (toast, banner,
// inbox, badge). It is *not* the same as a device state; think "your garage
// door has been open for 20 minutes" or "the vacuum is stuck".
//
// Lifecycle:
//   created → delivered → seen → acknowledged → resolved → archived
//
// - `created`       the backend minted it.
// - `delivered`     at least one client received the WS push.
// - `seen`          at least one target user viewed it in the inbox.
// - `acknowledged`  user explicitly dismissed / took action.
// - `resolved`      the condition that caused it no longer holds (ack or
//                   system-cleared).
// - `archived`      soft-delete; kept for history but hidden by default.
//
// Most rows are short-lived; the inbox keeps the last ~30 days. Persistence
// is JSON-on-disk today with a clean path to a `notifications` DB table.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { severityLevelSchema, permissionQuerySchema } from './cards/actions.js';
import { actionSchema } from './cards/actions.js';

// Reuse the severity scale the card schemas already use.
export { severityLevelSchema };
export type { SeverityLevel } from './cards/actions.js';

// -- Category ---------------------------------------------------------------
//
// Open string so integrations can add their own, but the common ones are
// codified for filtering UX.

export const NOTIFICATION_CATEGORIES = [
  'system',
  'security',
  'climate',
  'lighting',
  'media',
  'energy',
  'irrigation',
  'pool',
  'vacuum',
  'vehicle',
  'calendar',
  'update',
  'automation',
  'helper',
  'other',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number] | (string & {});

// -- Surfaces ---------------------------------------------------------------
//
// Where a notification wants to be displayed. Multiple surfaces can be set;
// `inbox` is the fallback and is always implicit.

export const notificationSurfaceSchema = z.enum([
  'toast',   // transient bottom/top pill, auto-dismisses
  'banner',  // persistent top-of-screen banner until acked
  'inbox',   // the notification list
  'badge',   // count bump on the header bell / tab icon
]);
export type NotificationSurface = z.infer<typeof notificationSurfaceSchema>;

// -- Lifecycle --------------------------------------------------------------

export const notificationLifecycleSchema = z.enum([
  'created',
  'delivered',
  'seen',
  'acknowledged',
  'resolved',
  'archived',
]);
export type NotificationLifecycle = z.infer<typeof notificationLifecycleSchema>;

// -- Notification action ----------------------------------------------------
//
// An action attached to a notification (button in the toast/inbox). Reuses
// the card `Action` type so "tap" semantics are identical to card taps.

export const notificationActionSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  /** Rendered hint — styles the button. */
  style: z.enum(['primary', 'secondary', 'danger']).default('secondary'),
  /** What the action does when tapped. */
  action: actionSchema,
  /** If true, taking this action auto-acknowledges the notification. */
  acknowledgesOnInvoke: z.boolean().default(true),
});
export type NotificationAction = z.infer<typeof notificationActionSchema>;

// -- Core notification ------------------------------------------------------

export const notificationSchema = z.object({
  id: z.string(),
  severity: severityLevelSchema,
  category: z.string().default('other'),
  title: z.string().min(1),
  body: z.string().optional(),
  icon: z.string().optional(),

  /** The device that originated this, if any. */
  deviceId: z.string().optional(),
  /** Free-form correlation key so repeat events merge instead of stacking. */
  dedupeKey: z.string().optional(),

  /** Which surfaces to display on. Empty = inbox only. */
  surfaces: z.array(notificationSurfaceSchema).default(['inbox']),

  /** Who this is for. Empty = everyone who can see the home. */
  audience: permissionQuerySchema.optional(),

  /** Optional buttons rendered in toast/inbox. */
  actions: z.array(notificationActionSchema).default([]),

  /** Auto-dismiss delay for toast surface (ms). 0 = sticky. */
  toastTtlMs: z.number().int().nonnegative().default(5000),

  /** Auto-resolve at this ISO timestamp (cleanup timer). */
  expiresAt: z.string().datetime().optional(),

  /** Current lifecycle state. */
  state: notificationLifecycleSchema.default('created'),

  /** Per-user acknowledgements. Map user-id → ISO timestamp. */
  acknowledgements: z.record(z.string().datetime()).default({}),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** When resolved (system-cleared or all-acked). */
  resolvedAt: z.string().datetime().optional(),

  /** Optional context payload for debugging / deep-linking. */
  meta: z.record(z.unknown()).optional(),
});
export type Notification = z.infer<typeof notificationSchema>;

// -- Create / update requests ----------------------------------------------

export const createNotificationRequestSchema = notificationSchema
  .pick({
    severity: true,
    category: true,
    title: true,
    body: true,
    icon: true,
    deviceId: true,
    dedupeKey: true,
    surfaces: true,
    audience: true,
    actions: true,
    toastTtlMs: true,
    expiresAt: true,
    meta: true,
  })
  .partial({
    category: true,
    surfaces: true,
    actions: true,
    toastTtlMs: true,
  });
export type CreateNotificationRequest = z.infer<typeof createNotificationRequestSchema>;

export const updateNotificationRequestSchema = z.object({
  state: notificationLifecycleSchema.optional(),
  acknowledgedByUserId: z.string().optional(),
  body: z.string().optional(),
  title: z.string().optional(),
  severity: severityLevelSchema.optional(),
}).describe('Partial update; omit fields you do not wish to change.');
export type UpdateNotificationRequest = z.infer<typeof updateNotificationRequestSchema>;

// -- WS messages ------------------------------------------------------------

export interface NotificationsSnapshotMessage {
  type: 'notifications_snapshot';
  notifications: Notification[];
}

export interface NotificationCreatedMessage {
  type: 'notification_created';
  notification: Notification;
}

export interface NotificationUpdatedMessage {
  type: 'notification_updated';
  notification: Notification;
}

export interface NotificationRemovedMessage {
  type: 'notification_removed';
  id: string;
}

export type NotificationWsMessage =
  | NotificationsSnapshotMessage
  | NotificationCreatedMessage
  | NotificationUpdatedMessage
  | NotificationRemovedMessage;
