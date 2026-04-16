// ---------------------------------------------------------------------------
// Device-specific tiles. Each binds to exactly one entity and renders the
// canonical control surface for that device class.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { cardBaseShape } from '../base.js';
import { actionSchema } from '../actions.js';

// -- Light tile -------------------------------------------------------------

export const lightTileCardSchema = z.object({
  type: z.literal('light-tile'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  icon: z.string().optional(),
  /** Show a brightness slider. */
  showBrightness: z.boolean().default(true),
  /** Show color/temperature controls when the underlying light supports them. */
  showColor: z.boolean().default(false),
  tapAction: actionSchema.optional(),
}).describe('Dimmable/colorable light control with tap-to-toggle and optional sliders.');

export type LightTileCard = z.infer<typeof lightTileCardSchema>;

// -- Fan tile ---------------------------------------------------------------

export const fanTileCardSchema = z.object({
  type: z.literal('fan-tile'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  icon: z.string().optional(),
  showSpeedControl: z.boolean().default(true),
}).describe('Fan control with speed selection.');

export type FanTileCard = z.infer<typeof fanTileCardSchema>;

// -- Cover tile (shades, garage doors) --------------------------------------

export const coverTileCardSchema = z.object({
  type: z.literal('cover-tile'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  icon: z.string().optional(),
  /** Render open/close/stop buttons instead of a toggle. */
  showPositionControl: z.boolean().default(false),
}).describe('Shade / garage door / blind control.');

export type CoverTileCard = z.infer<typeof coverTileCardSchema>;

// -- Lock tile --------------------------------------------------------------

export const lockTileCardSchema = z.object({
  type: z.literal('lock-tile'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  icon: z.string().optional(),
}).describe('Door lock control. Unlock requires PIN elevation by default (enforced by renderer).');

export type LockTileCard = z.infer<typeof lockTileCardSchema>;

// -- Switch tile ------------------------------------------------------------

export const switchTileCardSchema = z.object({
  type: z.literal('switch-tile'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  icon: z.string().optional(),
}).describe('On/off switch control.');

export type SwitchTileCard = z.infer<typeof switchTileCardSchema>;

// -- Media player tile ------------------------------------------------------

export const mediaTileCardSchema = z.object({
  type: z.literal('media-tile'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  /** Which controls to expose. Compact layouts show fewer. */
  controls: z.array(z.enum(['play-pause', 'skip', 'volume', 'mute', 'source', 'power'])).optional(),
  /** Show now-playing artwork when available. */
  showArtwork: z.boolean().default(true),
}).describe('Media player (TV, receiver, streamer) with playback and volume controls.');

export type MediaTileCard = z.infer<typeof mediaTileCardSchema>;

// -- Thermostat -------------------------------------------------------------

export const thermostatCardSchema = z.object({
  type: z.literal('thermostat'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  /** Show mode (heat/cool/auto/off) selector. */
  showModeControl: z.boolean().default(true),
  /** Show a graph of recent setpoint/temperature. */
  showHistory: z.boolean().default(false),
}).describe('Thermostat with setpoint, mode, and current temperature.');

export type ThermostatCard = z.infer<typeof thermostatCardSchema>;

// -- Vehicle card -----------------------------------------------------------

export const vehicleCardSchema = z.object({
  type: z.literal('vehicle'),
  ...cardBaseShape,
  entity: z.string(),
  /** What to show in the summary: battery, location, climate, or all. */
  sections: z.array(z.enum(['battery', 'location', 'climate', 'doors', 'charging'])).optional(),
}).describe('Electric-vehicle summary: battery, location, climate, doors, charging status.');

export type VehicleCard = z.infer<typeof vehicleCardSchema>;
