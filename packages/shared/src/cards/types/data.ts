// ---------------------------------------------------------------------------
// Data-display cards: sensors, gauges, history graphs, entity lists.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { cardBaseShape } from '../base.js';
import { severityLevelSchema } from '../actions.js';

// -- Gauge ------------------------------------------------------------------

export const gaugeSeveritySchema = z.object({
  /** State at/above which this band applies. */
  from: z.number(),
  level: severityLevelSchema,
});

export const gaugeCardSchema = z.object({
  type: z.literal('gauge'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  min: z.number(),
  max: z.number(),
  unit: z.string().optional(),
  /** Optional severity bands, sorted low→high by `from`. */
  severity: z.array(gaugeSeveritySchema).optional(),
  /** Show a small sparkline beneath the gauge. */
  showSparkline: z.boolean().default(false),
}).describe('Radial or linear gauge for a numeric entity with optional severity bands.');

export type GaugeCard = z.infer<typeof gaugeCardSchema>;

// -- Sensor value -----------------------------------------------------------

export const sensorValueCardSchema = z.object({
  type: z.literal('sensor-value'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  icon: z.string().optional(),
  /** How to render the value. `big` is a hero display. */
  style: z.enum(['compact', 'big']).default('compact'),
  /** Format hint: "number" is default; others apply transforms. */
  format: z.enum(['number', 'percent', 'temperature', 'duration', 'bytes', 'relative-time']).optional(),
  /** Decimal places for numeric formats. */
  precision: z.number().int().min(0).max(6).optional(),
}).describe('Single sensor value with optional hero styling.');

export type SensorValueCard = z.infer<typeof sensorValueCardSchema>;

// -- History graph ----------------------------------------------------------

export const historyGraphCardSchema = z.object({
  type: z.literal('history-graph'),
  ...cardBaseShape,
  entities: z.array(z.string()).min(1),
  title: z.string().optional(),
  /** Hours of history to render (capability-tier may downsample). */
  hoursToShow: z.number().positive().default(12),
  logarithmicScale: z.boolean().default(false),
  /** Limit points sent to the client; renderer enforces by tier. */
  maxPoints: z.number().int().positive().optional(),
}).describe('Time-series graph for one or more entities over a rolling window.');

export type HistoryGraphCard = z.infer<typeof historyGraphCardSchema>;

// -- Entity list ------------------------------------------------------------

export const entityListCardSchema = z.object({
  type: z.literal('entity-list'),
  ...cardBaseShape,
  title: z.string().optional(),
  entities: z.array(
    z.union([
      z.string(),
      z.object({
        entity: z.string(),
        name: z.string().optional(),
        icon: z.string().optional(),
        /** Override render style for this row. */
        style: z.enum(['default', 'toggle', 'value-only']).optional(),
      }),
    ]),
  ).min(1),
  /** Show a toggle in the header that applies to every toggleable row. */
  showHeaderToggle: z.boolean().default(false),
}).describe('List of entities with state and optional inline controls.');

export type EntityListCard = z.infer<typeof entityListCardSchema>;

// -- Statistic (aggregated over period) -------------------------------------

export const statisticCardSchema = z.object({
  type: z.literal('statistic'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  /** Aggregation over the configured period. */
  stat: z.enum(['mean', 'min', 'max', 'sum', 'change', 'last']),
  /** Rolling window. */
  period: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  unit: z.string().optional(),
  precision: z.number().int().min(0).max(6).optional(),
}).describe('Aggregated statistic for a numeric entity over a rolling period.');

export type StatisticCard = z.infer<typeof statisticCardSchema>;
