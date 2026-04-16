// ---------------------------------------------------------------------------
// Layout cards: compose other cards. `group` handles row/col/grid; `conditional`
// handles show/hide based on state or user; `vertical-stack` / `horizontal-stack`
// are convenience sugar over `group`.
//
// These are the only composition primitives. Any new "grid-like" or
// "conditional" behavior goes here rather than leaking into device/data cards.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { cardBaseShape, type LayoutHints } from '../base.js';
import { conditionSchema, type ConditionExpr } from '../actions.js';
import type { CardDescriptor } from '../schema.js';

export type GroupDirection = 'row' | 'column' | 'grid';
export type GroupGap = 'none' | 'sm' | 'md' | 'lg';

// -- Group (row / column / grid) --------------------------------------------

export interface GroupCard {
  type: 'group';
  id?: string;
  layoutHints?: LayoutHints;
  direction: GroupDirection;
  /** When direction=grid, the number of columns; ignored for row/column. */
  columns?: number;
  /** Force square tiles when direction=grid. */
  square?: boolean;
  /** Gap between children in spacing tokens. */
  gap?: GroupGap;
  children: CardDescriptor[];
  /** Optional title rendered above the group (shortcut for a heading + group pair). */
  title?: string;
}

export const groupCardSchema: z.ZodType<GroupCard, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    type: z.literal('group'),
    ...cardBaseShape,
    direction: z.enum(['row', 'column', 'grid']),
    columns: z.number().int().min(1).max(12).optional(),
    square: z.boolean().optional(),
    gap: z.enum(['none', 'sm', 'md', 'lg']).optional(),
    children: z.array(cardDescriptorRef),
    title: z.string().optional(),
  }),
);

// -- Conditional ------------------------------------------------------------

export interface ConditionalCard {
  type: 'conditional';
  id?: string;
  layoutHints?: LayoutHints;
  when: ConditionExpr;
  then: CardDescriptor;
  else?: CardDescriptor;
}

export const conditionalCardSchema: z.ZodType<ConditionalCard, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    type: z.literal('conditional'),
    ...cardBaseShape,
    when: conditionSchema,
    then: cardDescriptorRef,
    else: cardDescriptorRef.optional(),
  }),
);

// -- Vertical / horizontal stack (sugar) ------------------------------------

export interface StackCard {
  type: 'vertical-stack' | 'horizontal-stack';
  id?: string;
  layoutHints?: LayoutHints;
  gap?: GroupGap;
  children: CardDescriptor[];
}

export const verticalStackCardSchema: z.ZodType<StackCard, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    type: z.literal('vertical-stack'),
    ...cardBaseShape,
    gap: z.enum(['none', 'sm', 'md', 'lg']).optional(),
    children: z.array(cardDescriptorRef),
  }),
);

export const horizontalStackCardSchema: z.ZodType<StackCard, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    type: z.literal('horizontal-stack'),
    ...cardBaseShape,
    gap: z.enum(['none', 'sm', 'md', 'lg']).optional(),
    children: z.array(cardDescriptorRef),
  }),
);

// Forward-declared reference to the union. Defined in `cards/schema.ts`
// and assigned via `__setCardDescriptorRef` to break the import cycle.
// The forward ref and setter use a widened Input param to match
// `cardDescriptorSchema`, which carries defaults. See schema.ts.
let cardDescriptorRef!: z.ZodType<CardDescriptor, z.ZodTypeDef, unknown>;
export function __setCardDescriptorRef(ref: z.ZodType<CardDescriptor, z.ZodTypeDef, unknown>) {
  cardDescriptorRef = ref;
}
