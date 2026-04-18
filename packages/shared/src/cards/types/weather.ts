// ---------------------------------------------------------------------------
// Weather card — multi-pane renderer for a WeatherState entity.
//
// One weather entity is rich enough to fill an entire dashboard row: current
// conditions, an hourly strip, a multi-day forecast, an alerts banner, and an
// optional radar tile. This card exposes three size modes (compact, normal,
// expanded) that pick sensible layout densities, plus fine-grained toggles so
// users can show/hide humidity, precipitation %, wind, dewpoint, hi/lo, etc.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { cardBaseShape } from '../base.js';

// Backward-compat: earlier versions used `size: compact | default | hero`.
// Migrate silently at parse time so existing dashboard YAML keeps validating.
const LEGACY_SIZE_TO_MODE: Record<string, string> = {
  default: 'normal',
  hero: 'expanded',
};

const weatherCardObject = z.object({
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
  daysToShow: z.number().int().min(1).max(7).default(5),
  /** Radar tile source. `rainviewer` is free/no-key; `none` hides the pane. */
  radarProvider: z.enum(['none', 'rainviewer']).default('rainviewer'),
  /** Radar zoom level (Leaflet / Slippy-map tiles, 0–18). */
  radarZoom: z.number().int().min(0).max(18).default(8),
  /** Suppress alerts quieter than this severity. NWS uses Minor/Moderate/Severe/Extreme. */
  minAlertSeverity: z.enum(['Minor', 'Moderate', 'Severe', 'Extreme']).default('Minor'),
  /** Layout density. Controls font/icon sizes and how dense the stat grid is.
   *  `compact` is a single row suitable for a small tile; `normal` shows the
   *  headline plus a stat strip; `expanded` adds a stat grid and roomier panes. */
  mode: z.enum(['compact', 'normal', 'expanded']).default('normal'),

  // -- Current-pane detail toggles ------------------------------------------
  showHumidity: z.boolean().default(true),
  showWind: z.boolean().default(true),
  showFeelsLike: z.boolean().default(true),
  showDewpoint: z.boolean().default(false),

  // -- Hourly / daily detail toggles ---------------------------------------
  /** Show precipitation % chips in hourly and daily. */
  showPrecipitation: z.boolean().default(true),
  /** Show hi/lo temperature pair on daily rows. */
  showHighLow: z.boolean().default(true),
  /** Show tiny alert badge in the card header when any visible alerts exist. */
  showAlertBadge: z.boolean().default(true),
}).describe('Weather card with current, hourly, daily, alerts, and radar panes.');

export const weatherCardSchema = z.preprocess((input) => {
  if (!input || typeof input !== 'object') return input;
  const obj = input as Record<string, unknown>;
  if ('size' in obj && !('mode' in obj)) {
    const { size, ...rest } = obj;
    return {
      ...rest,
      mode: typeof size === 'string'
        ? (LEGACY_SIZE_TO_MODE[size] ?? size)
        : size,
    };
  }
  return input;
}, weatherCardObject);

export type WeatherCard = z.infer<typeof weatherCardObject>;
