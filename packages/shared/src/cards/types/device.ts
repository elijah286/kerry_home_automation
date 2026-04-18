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

// -- Cover tile (shades, garage doors, blinds) ------------------------------
//
// The card descriptor hints the renderer about the underlying cover shape
// ("blind" draws animated slats, "garage" renders the door graphic, "shade"
// uses a linear curtain). 'auto' lets the renderer pick from the device
// class — which is what every card gets by default.

export const coverTileCardSchema = z.object({
  type: z.literal('cover-tile'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  icon: z.string().optional(),
  /** Render a draggable position slider with live preview. */
  showPositionControl: z.boolean().default(true),
  /** Which visual to use. `auto` picks by device_class. */
  visual: z.enum(['auto', 'blind', 'shade', 'curtain', 'garage', 'gate']).default('auto'),
  /** When true, show the current position as a percentage chip. */
  showPercentage: z.boolean().default(true),
}).describe('Shade / blind / garage door / curtain control with an animated visual.');

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
//
// One tile shape covers every media_player / music_player device class —
// TV, AV receiver, speaker, music streamer. The `variant` hint picks the
// layout: a receiver exposes source + surround mode; a TV exposes a D-pad;
// a speaker hides app-launchers; a music streamer shows a scrub bar and
// shuffle/repeat. `auto` infers from device.device_class.

export const mediaTileCardSchema = z.object({
  type: z.literal('media-tile'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  /** Which controls to expose. Compact layouts show fewer.
   *  - 'shuffle' / 'repeat': music-style toggles
   *  - 'seek': scrub bar with position/duration
   *  - 'source': input-select dropdown (receiver / TV)
   *  - 'sound-program': surround mode chooser (receiver)
   *  - 'channels': numeric keypad (TV)
   *  - 'dpad': up/down/left/right/enter (TV)
   */
  controls: z.array(z.enum([
    'play-pause', 'skip', 'volume', 'mute', 'source', 'power',
    'shuffle', 'repeat', 'seek', 'sound-program', 'channels', 'dpad',
  ])).optional(),
  /** Show now-playing artwork when available. */
  showArtwork: z.boolean().default(true),
  /** Layout variant. `auto` picks from device.device_class. */
  variant: z.enum(['auto', 'tv', 'receiver', 'speaker', 'music']).default('auto'),
  /** For receivers with zone support: which zone this tile controls. */
  zone: z.string().optional(),
}).describe('Media player (TV, receiver, speaker, music streamer) with layout variants.');

export type MediaTileCard = z.infer<typeof mediaTileCardSchema>;

// -- Thermostat -------------------------------------------------------------
//
// Richer config than the first-cut thermostat: presets, fan mode, humidity
// display, optional inline history.

export const thermostatCardSchema = z.object({
  type: z.literal('thermostat'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  /** Show mode (heat/cool/auto/off) selector. */
  showModeControl: z.boolean().default(true),
  /** Show hold/preset buttons (home, away, sleep, vacation). */
  showPresets: z.boolean().default(true),
  /** Show fan-mode selector (auto / on / circulate). */
  showFanControl: z.boolean().default(true),
  /** Show a graph of recent setpoint/temperature. */
  showHistory: z.boolean().default(false),
  /** Show indoor humidity chip next to the temperature. */
  showHumidity: z.boolean().default(true),
  /** Card size. `hero` fills the cell; `compact` is a slim one-liner. */
  size: z.enum(['compact', 'default', 'hero']).default('default'),
}).describe('Thermostat with setpoint, mode, presets, fan, and optional history.');

export type ThermostatCard = z.infer<typeof thermostatCardSchema>;

// -- Vehicle card (legacy generic) ------------------------------------------
//
// Kept for dashboards that already reference `type: vehicle`. The preferred
// new path is the `tesla` card below, which adds the compositor image and
// Tesla-specific controls. When neither card is appropriate, the generic
// card degrades to the same section layout as before.

export const vehicleCardSchema = z.object({
  type: z.literal('vehicle'),
  ...cardBaseShape,
  entity: z.string(),
  /** What to show in the summary: battery, location, climate, or all. */
  sections: z.array(z.enum(['battery', 'location', 'climate', 'doors', 'charging'])).optional(),
}).describe('Generic vehicle summary: battery, location, climate, doors, charging.');

export type VehicleCard = z.infer<typeof vehicleCardSchema>;

// -- Tesla card (rich, compositor-backed) -----------------------------------
//
// Builds the Tesla configurator compositor URL from
// `optionCodes` + `compositorModel` on the VehicleState, layering live
// controls (battery chip, climate toggle, lock, trunks, sentry, charge
// control) over the rendered car. Falls back to an SVG silhouette when
// compositor data is unavailable.

export const teslaCardSchema = z.object({
  type: z.literal('tesla'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  /** Which overlay chips to show. `auto` = everything supported. */
  sections: z.array(z.enum([
    'battery', 'range', 'climate', 'locks', 'charging', 'sentry',
    'windows', 'trunks', 'location', 'speed', 'seatHeaters', 'defrost',
    'software',
  ])).optional(),
  /** Hide the vehicle image. Useful when embedding in tight stacks. */
  hideImage: z.boolean().default(false),
  /** Vehicle image source. `compositor` uses Tesla's live renderer; `silhouette`
   *  uses the generic SVG; `live-map` shows an embedded OpenStreetMap with the
   *  vehicle pinned at its current GPS position; `auto` picks compositor when
   *  optionCodes+model are present, otherwise silhouette. */
  imageSource: z.enum(['auto', 'compositor', 'silhouette', 'live-map']).default('auto'),
  /** Size of the rendered car. Compositor accepts 250–1920; typical dashboards
   *  look best around 720. */
  imageSize: z.number().int().min(250).max(1920).default(720),
  /** View angle. Tesla compositor accepts STUD_3QTR (default), STUD_SIDE,
   *  STUD_REAR, STUD_SEAT (interior). */
  imageView: z.enum(['STUD_3QTR', 'STUD_SIDE', 'STUD_REAR', 'STUD_SEAT']).default('STUD_3QTR'),
  /** Show a Google Maps link next to the GPS coordinates row. */
  showMap: z.boolean().default(false),
}).describe('Tesla summary with live compositor image and controls laid over the car.');

export type TeslaCard = z.infer<typeof teslaCardSchema>;

// -- Door / window binary-sensor card ---------------------------------------
//
// Renders the open/closed state of a contact sensor with a door-or-window
// glyph and a last-changed timestamp. Read-only; tapping routes to the
// device detail page by default.

export const doorWindowCardSchema = z.object({
  type: z.literal('door-window'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  /** Override the visual. `auto` = pick from device_class (door/window/garage_door). */
  visual: z.enum(['auto', 'door', 'window', 'garage', 'gate']).default('auto'),
  /** Show the last-changed timestamp as a tiny footer. */
  showLastChanged: z.boolean().default(true),
  /** Render in big / hero size. */
  size: z.enum(['compact', 'default', 'hero']).default('default'),
}).describe('Contact sensor (door / window / garage / gate) with open/closed visual.');

export type DoorWindowCard = z.infer<typeof doorWindowCardSchema>;

// -- Battery-level card -----------------------------------------------------
//
// Dedicated battery display for any numeric "battery" sensor or any device
// with a `batteryLevel` field (vehicles, some locks). Shows a charging icon
// when applicable, colours by severity band (<=20% warning, <=10% critical).

export const batteryCardSchema = z.object({
  type: z.literal('battery'),
  ...cardBaseShape,
  entity: z.string(),
  name: z.string().optional(),
  /** Show range / remaining time when the underlying device provides it. */
  showRemaining: z.boolean().default(true),
  /** Linear or radial gauge style. */
  style: z.enum(['linear', 'radial', 'chip']).default('linear'),
  /** Override severity thresholds. Two-entry tuple [warning%, critical%]. */
  thresholds: z.tuple([z.number(), z.number()]).optional(),
}).describe('Battery level with severity thresholds and charging indicator.');

export type BatteryCard = z.infer<typeof batteryCardSchema>;
