// ---------------------------------------------------------------------------
// Unified card descriptor: discriminated union across every card type.
//
// This is the single source of truth consumed by:
//   - the frontend `<CardRenderer>` (Phase 1 ticket 1.4)
//   - the dashboard editor form generator (Phase 4)
//   - the future LLM `compose_dashboard` tool (Phase 5)
// ---------------------------------------------------------------------------

import { z } from 'zod';

import {
  headingCardSchema,
  markdownCardSchema,
  buttonCardSchema,
  iframeSandboxCardSchema,
} from './types/primitives.js';
import {
  lightTileCardSchema,
  fanTileCardSchema,
  coverTileCardSchema,
  lockTileCardSchema,
  switchTileCardSchema,
  mediaTileCardSchema,
  thermostatCardSchema,
  vehicleCardSchema,
} from './types/device.js';
import {
  gaugeCardSchema,
  sensorValueCardSchema,
  historyGraphCardSchema,
  entityListCardSchema,
  statisticCardSchema,
} from './types/data.js';
import {
  cameraCardSchema,
  areaSummaryCardSchema,
  mapCardSchema,
  alertBannerCardSchema,
  notificationInboxCardSchema,
  alarmPanelCardSchema,
} from './types/composite.js';
import {
  groupCardSchema,
  conditionalCardSchema,
  verticalStackCardSchema,
  horizontalStackCardSchema,
  __setCardDescriptorRef,
  type GroupCard,
  type ConditionalCard,
  type StackCard,
} from './types/layout.js';

// -- Non-recursive variants ------------------------------------------------

export type NonRecursiveCard =
  | z.infer<typeof headingCardSchema>
  | z.infer<typeof markdownCardSchema>
  | z.infer<typeof buttonCardSchema>
  | z.infer<typeof iframeSandboxCardSchema>
  | z.infer<typeof lightTileCardSchema>
  | z.infer<typeof fanTileCardSchema>
  | z.infer<typeof coverTileCardSchema>
  | z.infer<typeof lockTileCardSchema>
  | z.infer<typeof switchTileCardSchema>
  | z.infer<typeof mediaTileCardSchema>
  | z.infer<typeof thermostatCardSchema>
  | z.infer<typeof vehicleCardSchema>
  | z.infer<typeof gaugeCardSchema>
  | z.infer<typeof sensorValueCardSchema>
  | z.infer<typeof historyGraphCardSchema>
  | z.infer<typeof entityListCardSchema>
  | z.infer<typeof statisticCardSchema>
  | z.infer<typeof cameraCardSchema>
  | z.infer<typeof areaSummaryCardSchema>
  | z.infer<typeof mapCardSchema>
  | z.infer<typeof alertBannerCardSchema>
  | z.infer<typeof notificationInboxCardSchema>
  | z.infer<typeof alarmPanelCardSchema>;

export type CardDescriptor = NonRecursiveCard | GroupCard | ConditionalCard | StackCard;

// -- Runtime union ---------------------------------------------------------
//
// Order matters only in that `discriminatedUnion` requires a flat list. All
// recursive card types are lazy-wrapped above, so they compose cleanly here.

// `z.union` (not `discriminatedUnion`) because recursive members are wrapped
// in `z.lazy` and therefore don\'t satisfy the structural constraints that
// `discriminatedUnion` imposes on its options. Performance difference is
// negligible for our vocabulary size (<30 types).
// Input param widened to `unknown` because individual card schemas use
// `.default(...)` on several fields, which makes the Zod *input* shape wider
// than the inferred output. `CardDescriptor` is the output shape — what the
// runtime always sees after parsing — which is what consumers actually want.
export const cardDescriptorSchema: z.ZodType<CardDescriptor, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    headingCardSchema,
    markdownCardSchema,
    buttonCardSchema,
    iframeSandboxCardSchema,
    lightTileCardSchema,
    fanTileCardSchema,
    coverTileCardSchema,
    lockTileCardSchema,
    switchTileCardSchema,
    mediaTileCardSchema,
    thermostatCardSchema,
    vehicleCardSchema,
    gaugeCardSchema,
    sensorValueCardSchema,
    historyGraphCardSchema,
    entityListCardSchema,
    statisticCardSchema,
    cameraCardSchema,
    areaSummaryCardSchema,
    mapCardSchema,
    alertBannerCardSchema,
    notificationInboxCardSchema,
    alarmPanelCardSchema,
    groupCardSchema,
    conditionalCardSchema,
    verticalStackCardSchema,
    horizontalStackCardSchema,
  ]),
);

// Wire the lazy forward-declared reference inside layout.ts so the recursive
// children actually validate.
__setCardDescriptorRef(cardDescriptorSchema);

// -- Canonical card type list (useful for editor palettes & LLM docs) ------

export const CARD_TYPES = [
  'heading', 'markdown', 'button', 'iframe-sandbox',
  'light-tile', 'fan-tile', 'cover-tile', 'lock-tile', 'switch-tile',
  'media-tile', 'thermostat', 'vehicle',
  'gauge', 'sensor-value', 'history-graph', 'entity-list', 'statistic',
  'camera', 'area-summary', 'map',
  'alert-banner', 'notification-inbox', 'alarm-panel',
  'group', 'conditional', 'vertical-stack', 'horizontal-stack',
] as const;

export type CardType = (typeof CARD_TYPES)[number];
