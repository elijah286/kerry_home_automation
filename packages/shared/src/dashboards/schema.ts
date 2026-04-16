// ---------------------------------------------------------------------------
// Dashboard document — the interchange format between the editor, the
// renderer, and (eventually) the LLM.
//
// One JSONB row per document. Admin-authored, user-authored, and LLM-generated
// dashboards all use this shape with different `owner` / `createdBy` values.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { cardDescriptorSchema } from '../cards/schema.js';
import { permissionQuerySchema } from '../cards/actions.js';

// -- Section --------------------------------------------------------------

export const dashboardSectionSchema = z.object({
  /** Stable identifier for drag-and-drop diffing. */
  id: z.string().optional(),
  title: z.string().optional(),
  /** Grid column span for this section when the outer layout is `sections`. */
  columnSpan: z.number().int().min(1).max(12).optional(),
  cards: z.array(cardDescriptorSchema).default([]),
});

export type DashboardSection = z.infer<typeof dashboardSectionSchema>;

// -- Top-level layout ------------------------------------------------------

export const dashboardLayoutSchema = z.object({
  /**
   * `sections` = multi-column section layout (matches HA's `type: sections`).
   * `panel`    = single card fills the viewport (used for maps, cameras).
   * `stack`    = single vertical column, simplest for mobile-first dashboards.
   */
  type: z.enum(['sections', 'panel', 'stack']).default('sections'),
  /** Maximum columns for `sections` layout. Grid collapses to fewer on narrow viewports. */
  maxColumns: z.number().int().min(1).max(6).default(3),
  /** Pack sections densely (matches HA's `dense_section_placement`). */
  dense: z.boolean().default(false),
});

export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;

// -- Ownership + provenance -----------------------------------------------

export const dashboardOwnerSchema = z.union([
  z.object({ kind: z.literal('system') }),
  z.object({ kind: z.literal('user'), userId: z.string() }),
]).describe('Who owns the document. System-owned dashboards ship with the app.');

export type DashboardOwner = z.infer<typeof dashboardOwnerSchema>;

export const dashboardCreatedBySchema = z.enum(['system', 'user', 'llm']);
export type DashboardCreatedBy = z.infer<typeof dashboardCreatedBySchema>;

// -- Document -------------------------------------------------------------

export const dashboardDocSchema = z.object({
  /** Stable id; backend may override on insert. */
  id: z.string(),
  /** URL path segment, unique per owner (e.g. "garage", "movie-room"). */
  path: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string(),
  icon: z.string().optional(),

  owner: dashboardOwnerSchema,
  createdBy: dashboardCreatedBySchema.default('user'),

  /** Visibility predicate. Empty = visible to everyone. */
  visibility: permissionQuerySchema.optional(),

  layout: dashboardLayoutSchema,
  sections: z.array(dashboardSectionSchema).default([]),

  /** Non-section layouts (`panel`, `stack`) drop cards here directly. */
  cards: z.array(cardDescriptorSchema).default([]),

  /** Is this dashboard pinned to the owner\'s primary dashboard list? */
  pinned: z.boolean().default(false),

  /** Kiosk defaulting: when non-null, this dashboard is the default for that areaId. */
  defaultForAreaId: z.string().optional(),

  /** Free-form tags for search/filtering. */
  tags: z.array(z.string()).optional(),

  /** Version counter, bumped on each save. Editor uses this for optimistic concurrency. */
  revision: z.number().int().nonnegative().default(0),

  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type DashboardDoc = z.infer<typeof dashboardDocSchema>;

// -- API payloads ---------------------------------------------------------

export const createDashboardRequestSchema = dashboardDocSchema.pick({
  path: true,
  title: true,
  icon: true,
  visibility: true,
  layout: true,
  sections: true,
  cards: true,
  defaultForAreaId: true,
  tags: true,
}).extend({
  createdBy: dashboardCreatedBySchema.optional(),
});

export type CreateDashboardRequest = z.infer<typeof createDashboardRequestSchema>;

export const updateDashboardRequestSchema = createDashboardRequestSchema.partial().extend({
  /** Optimistic concurrency: reject if server revision has advanced past this. */
  expectedRevision: z.number().int().nonnegative().optional(),
  pinned: z.boolean().optional(),
});

export type UpdateDashboardRequest = z.infer<typeof updateDashboardRequestSchema>;
