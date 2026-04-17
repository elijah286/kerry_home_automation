// ---------------------------------------------------------------------------
// Weather card — multi-pane renderer for a WeatherState entity.
//
// A single weather entity (one NWS location) is rich enough to fill an entire
// dashboard row: current conditions, an hourly strip, a 7-day forecast, an
// alerts banner, and an optional radar tile. Rather than ship five separate
// card types, this one card exposes which panes to show. The renderer lays
// them out vertically inside the card frame; LCARS and other themes re-skin
// the frame without touching the pane layout.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { cardBaseShape } from '../base.js';

export const weatherCardSchema = z.object({
  type: z.literal('weather'),
  ...cardBaseShape,
  /** Weather entity id (one per configured location). */
  entity: z.string(),
  name: z.string().optional(),
  /** Which panes to render, in the listed order. */
  panes: z.array(z.enum(['current', 'hourly', 'daily', 'alerts', 'radar']))
    .default(['current', 'hourly', 'daily']),
  /** Units. `auto` follows the user profile; the NWS API returns imperial
   *  natively and the renderer converts when this is `metric`. */
  units: z.enum(['auto', 'imperial', 'metric']).default('auto'),
  /** Hours to show in the hourly strip (max 48, which is NWS's forecast window). */
  hoursToShow: z.number().int().min(1).max(48).default(12),
  /** Days to show in the daily strip (NWS returns up to 14 periods = 7 days). */
  daysToShow: z.number().int().min(1).max(7).default(7),
  /** Radar tile source. `rainviewer` is free/no-key; `none` hides the pane
   *  even if 'radar' is in panes. */
  radarProvider: z.enum(['none', 'rainviewer']).default('rainviewer'),
  /** Radar zoom level (Leaflet / Slippy-map tiles, 0–18). */
  radarZoom: z.number().int().min(0).max(18).default(8),
  /** Suppress alerts quieter than this severity. NWS uses Minor/Moderate/Severe/Extreme. */
  minAlertSeverity: z.enum(['Minor', 'Moderate', 'Severe', 'Extreme']).default('Minor'),
  /** Card size — `hero` fills the cell with a big current-conditions panel. */
  size: z.enum(['compact', 'default', 'hero']).default('default'),
}).describe('Weather card with current, hourly, daily, alerts, and radar panes.');

export type WeatherCard = z.infer<typeof weatherCardSchema>;
