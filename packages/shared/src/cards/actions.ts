// ---------------------------------------------------------------------------
// Shared primitives for the card registry: actions, conditions, permissions.
//
// These types are the atoms used by every card descriptor. They are intentionally
// closed (no arbitrary code, no JSX) so a dashboard document round-trips cleanly
// through JSON and can be composed by the editor or an LLM.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { USER_ROLES, Permission } from '../auth.js';

// -- Actions ----------------------------------------------------------------
//
// An `Action` is what happens in response to user interaction (tap, hold,
// double-tap). All side effects must be expressible as one of these variants.

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('none'),
  }).describe('Do nothing on interaction.'),

  z.object({
    type: z.literal('toggle'),
    /** Optional override; otherwise the card\'s primary entity is toggled. */
    entity: z.string().optional(),
  }).describe('Toggle the target entity (on<->off, open<->closed, locked<->unlocked).'),

  z.object({
    type: z.literal('more-info'),
    entity: z.string().optional(),
  }).describe('Open the standard more-info dialog for the entity.'),

  z.object({
    type: z.literal('navigate'),
    /** Absolute app path, e.g. "/dashboards/garage" */
    path: z.string(),
  }).describe('Navigate within the app to the given path.'),

  z.object({
    type: z.literal('command'),
    deviceId: z.string(),
    /** Command name understood by the target integration (e.g. "set_brightness") */
    command: z.string(),
    /** Optional JSON params; must be serializable */
    params: z.record(z.unknown()).optional(),
  }).describe('Send a typed command to a device.'),

  z.object({
    type: z.literal('fire-helper'),
    /** ID of a helper (button/counter/toggle/timer) to activate or press. */
    helperId: z.string(),
    /** Optional operation for counter/timer helpers; defaults to "press"/"toggle". */
    op: z.enum(['press', 'toggle', 'increment', 'decrement', 'reset', 'start', 'pause', 'cancel']).optional(),
  }).describe('Trigger a helper-device action (useful for buttons and counters).'),
]);

export type Action = z.infer<typeof actionSchema>;

// -- Conditions -------------------------------------------------------------
//
// Used by the `conditional` card to show/hide content based on device state or
// the current user. Deliberately limited to a handful of operators — anything
// fancier belongs in an automation, not the UI.

// `z.lazy` for recursion; the base leaf conditions first, then combinators.

const conditionLeafSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('state'),
    entity: z.string(),
    /** Accept string|number|boolean for comparison */
    equals: z.union([z.string(), z.number(), z.boolean()]),
  }).describe('True when entity state equals the given value.'),

  z.object({
    type: z.literal('state-in'),
    entity: z.string(),
    values: z.array(z.union([z.string(), z.number(), z.boolean()])).min(1),
  }).describe('True when entity state is one of the given values.'),

  z.object({
    type: z.literal('attribute'),
    entity: z.string(),
    attribute: z.string(),
    equals: z.union([z.string(), z.number(), z.boolean()]),
  }).describe('True when a specific attribute on the entity equals the given value.'),

  z.object({
    type: z.literal('numeric-state'),
    entity: z.string(),
    /** Optional attribute path; defaults to the primary numeric state */
    attribute: z.string().optional(),
    op: z.enum(['gt', 'lt', 'gte', 'lte', 'eq', 'neq']),
    value: z.number(),
  }).describe('Numeric comparison against entity state or a numeric attribute.'),

  z.object({
    type: z.literal('available'),
    entity: z.string(),
    /** True = match when entity is reachable; false = match when unavailable. */
    available: z.boolean(),
  }).describe('Match on whether the entity is currently reachable.'),

  z.object({
    type: z.literal('user'),
    /** At least one of these must match the current user's role. */
    hasRole: z.array(z.enum(USER_ROLES)).optional(),
    /** The current session must hold all listed permissions. */
    hasPermission: z.array(z.nativeEnum(Permission)).optional(),
    /** If true, session must be PIN-elevated. */
    requiresElevation: z.boolean().optional(),
  }).describe('Gate visibility on the current user, their role, or elevation.'),
]);

export type ConditionLeaf = z.infer<typeof conditionLeafSchema>;

export interface ConditionAnd { type: 'and'; conditions: ConditionExpr[] }
export interface ConditionOr { type: 'or'; conditions: ConditionExpr[] }
export interface ConditionNot { type: 'not'; condition: ConditionExpr }
export type ConditionExpr = ConditionLeaf | ConditionAnd | ConditionOr | ConditionNot;

export const conditionSchema: z.ZodType<ConditionExpr> = z.lazy(() =>
  z.union([
    conditionLeafSchema,
    z.object({
      type: z.literal('and'),
      conditions: z.array(conditionSchema).min(1),
    }),
    z.object({
      type: z.literal('or'),
      conditions: z.array(conditionSchema).min(1),
    }),
    z.object({
      type: z.literal('not'),
      condition: conditionSchema,
    }),
  ]),
);

// -- Permission queries -----------------------------------------------------
//
// Describes "who is allowed to see this thing". Used for dashboard visibility,
// card visibility (via the `conditional` card), and notification audience.
//
// Matching rules: a session matches if ANY of the clauses (`roles`, `userIds`,
// `permissions`) matches. Empty `PermissionQuery` means "everyone".

export const permissionQuerySchema = z.object({
  /** If present, user must have one of these roles. */
  roles: z.array(z.enum(USER_ROLES)).optional(),
  /** If present, user must be one of these ids. */
  userIds: z.array(z.string()).optional(),
  /** If present, user must hold all these permissions. */
  permissions: z.array(z.nativeEnum(Permission)).optional(),
  /** If true, content is only visible while the session is PIN-elevated. */
  requiresElevation: z.boolean().optional(),
}).describe('Visibility predicate against the current session.');

export type PermissionQuery = z.infer<typeof permissionQuerySchema>;

// -- Severity (shared with notifications) -----------------------------------

export const severityLevelSchema = z.enum(['critical', 'warning', 'info', 'success']);
export type SeverityLevel = z.infer<typeof severityLevelSchema>;
