// ---------------------------------------------------------------------------
// Composite cards: pull multiple entities together, often tied to an area or
// a system-wide concept (alerts, cameras, maps, notifications).
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { cardBaseShape } from '../base.js';
import { actionSchema, severityLevelSchema } from '../actions.js';

// -- Camera -----------------------------------------------------------------

export const cameraCardSchema = z.object({
  type: z.literal('camera'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  /** Playback mode. `auto` lets the client decide based on capability/network. */
  mode: z.enum(['auto', 'live', 'snapshot']).default('auto'),
  /** Fit mode for the video/image element. */
  fit: z.enum(['cover', 'contain']).default('cover'),
  /** Tap action; defaults to navigating to the camera detail view. */
  tapAction: actionSchema.optional(),
  /** Show a subtle live/recording indicator. */
  showStatus: z.boolean().default(true),
}).describe('Camera feed. Client auto-selects live MSE or snapshot polling by capability tier.');

export type CameraCard = z.infer<typeof cameraCardSchema>;

// -- Area summary -----------------------------------------------------------

export const areaSummaryCardSchema = z.object({
  type: z.literal('area-summary'),
  ...cardBaseShape,
  areaId: z.string(),
  /** How the area\'s hero region renders. */
  display: z.enum(['icon', 'picture', 'camera']).default('icon'),
  /** Which binary-sensor device classes pulse an alert indicator. */
  alertClasses: z.array(z.string()).optional(),
  /** Which sensor device classes render small stat pills. */
  sensorClasses: z.array(z.string()).optional(),
  /** Optional per-tile navigation. */
  navigationPath: z.string().optional(),
  /** Override the display name for this tile. */
  name: z.string().optional(),
}).describe('One tile summarizing an area: hero + alert dots + sensor pills. Matches the HA "area" card.');

export type AreaSummaryCard = z.infer<typeof areaSummaryCardSchema>;

// -- Map --------------------------------------------------------------------

export const mapCardSchema = z.object({
  type: z.literal('map'),
  ...cardBaseShape,
  entities: z.array(z.string()).min(1),
  /** Hours of trail history to draw. */
  hoursToShow: z.number().nonnegative().default(0),
  /** Auto-fit to entity bounds. */
  autoFit: z.boolean().default(true),
  /** Force light/dark tile theme; otherwise follows app theme. */
  themeMode: z.enum(['auto', 'light', 'dark']).default('auto'),
}).describe('Geographic map showing tracker entities and optional trails.');

export type MapCard = z.infer<typeof mapCardSchema>;

// -- Alert banner -----------------------------------------------------------

export const alertBannerCardSchema = z.object({
  type: z.literal('alert-banner'),
  ...cardBaseShape,
  /** If set, binds to a specific active notification id. */
  notificationId: z.string().optional(),
  /** Otherwise, filter notifications by severity + category. */
  filter: z.object({
    minSeverity: severityLevelSchema.optional(),
    categories: z.array(z.string()).optional(),
  }).optional(),
  /** Render nothing when no matching notification; vs. show a muted "all clear". */
  hideWhenEmpty: z.boolean().default(true),
}).describe('Inline banner for an active notification. Used to surface alerts contextually on a dashboard.');

export type AlertBannerCard = z.infer<typeof alertBannerCardSchema>;

// -- Notification inbox -----------------------------------------------------

export const notificationInboxCardSchema = z.object({
  type: z.literal('notification-inbox'),
  ...cardBaseShape,
  title: z.string().optional(),
  /** Scope to categories/severity; empty = all visible to the session. */
  filter: z.object({
    minSeverity: severityLevelSchema.optional(),
    categories: z.array(z.string()).optional(),
  }).optional(),
  /** Max rows to render; list becomes scrollable past this. */
  maxRows: z.number().int().positive().default(5),
  /** Show resolved items too (otherwise only active/snoozed). */
  includeResolved: z.boolean().default(false),
}).describe('Inline list of active notifications. Replaces the conditional alert tiles used in the legacy dashboard.');

export type NotificationInboxCard = z.infer<typeof notificationInboxCardSchema>;

// -- Alarm panel ------------------------------------------------------------

export const alarmPanelCardSchema = z.object({
  type: z.literal('alarm-panel'),
  ...cardBaseShape,
  entity: z.string(),
  /** Which arm states to expose in the UI. */
  states: z.array(z.enum(['arm_home', 'arm_away', 'arm_night', 'arm_vacation', 'arm_custom_bypass'])).optional(),
  name: z.string().optional(),
}).describe('Alarm control panel with code entry. Arming transitions gated by backend.');

export type AlarmPanelCard = z.infer<typeof alarmPanelCardSchema>;
