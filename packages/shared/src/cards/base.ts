// ---------------------------------------------------------------------------
// Base fields shared by every card descriptor.
//
// Kept intentionally tiny: stable id for editor diffing, and layout hints the
// grid engine can use when auto-placing. Conditional visibility is handled by
// wrapping a card in `{ type: 'conditional', when, then }` rather than adding
// a `visibility` prop to every variant — this gives the LLM one consistent
// tool for show/hide logic.
// ---------------------------------------------------------------------------

import { z } from 'zod';

export const cardSizeHintSchema = z.enum(['sm', 'md', 'lg', 'xl']);
export type CardSizeHint = z.infer<typeof cardSizeHintSchema>;

export const layoutHintsSchema = z.object({
  /** Preferred column span in the parent grid (1..12). Grid may override on narrow viewports. */
  columnSpan: z.number().int().min(1).max(12).optional(),
  /** Preferred row span for dense grids. */
  rowSpan: z.number().int().min(1).max(12).optional(),
  /** Minimum intrinsic width bucket. Grid uses this to decide column count on small screens. */
  minWidth: cardSizeHintSchema.optional(),
  /** If true, card prefers to fill available space instead of sizing to content. */
  fill: z.boolean().optional(),
});

export type LayoutHints = z.infer<typeof layoutHintsSchema>;

/** Fields every card carries. Spread into each variant via Zod `.extend`. */
export const cardBaseShape = {
  /** Stable identifier (uuid or slug). Optional in wire format; editor generates one. */
  id: z.string().optional(),
  layoutHints: layoutHintsSchema.optional(),
} as const;
