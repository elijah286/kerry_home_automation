// ---------------------------------------------------------------------------
// Icon registry — a single lookup for every glyph the UI can render.
//
// One library (lucide-react, ~1300 stroke icons) powers the whole app so the
// visual language is consistent: thin outlines, uniform corner radius, no
// drop-shadows, no colour bakes. Themes stroke them via `currentColor`, which
// means an LCARS re-skin recolours every glyph without touching components.
//
// Naming:
//   - Lucide's own PascalCase names (e.g. "CloudRain") work directly.
//   - HA-style kebab names (e.g. "mdi:cloud-rain", "weather-cloudy") resolve
//     through an alias table so cards migrated from a Home Assistant
//     dashboard feel familiar. When an alias isn't listed we still try the
//     "turn it into PascalCase and look up lucide" fallback — covers the
//     long tail without hard-coding 7000 rows.
// ---------------------------------------------------------------------------

import type { LucideIcon } from 'lucide-react';
import * as Lucide from 'lucide-react';

// lucide-react exports each icon twice ("Cloud" and "CloudIcon"). We keep the
// short names and drop the "Icon" suffix versions so the picker doesn't show
// duplicates. A few dozen non-icon exports (createLucideIcon, icons, etc.)
// are filtered by shape.
function isIconComponent(v: unknown): v is LucideIcon {
  // Lucide icons are forwardRef render functions wrapped in a React object.
  // Checking for a displayName is a reliable-enough filter.
  return (
    typeof v === 'object' &&
    v !== null &&
    // ForwardRef render functions expose `$$typeof` and `render`.
    ('render' in (v as object) || typeof (v as { displayName?: unknown }).displayName === 'string')
  );
}

const rawLucide = Lucide as unknown as Record<string, unknown>;

/**
 * Full set of lucide icons, keyed by their PascalCase lucide name.
 * ~1300 entries after dedup.
 */
export const LUCIDE_ICONS: Record<string, LucideIcon> = (() => {
  const out: Record<string, LucideIcon> = {};
  for (const key of Object.keys(rawLucide)) {
    if (key.endsWith('Icon')) continue; // drop duplicate `XIcon` alias
    if (!/^[A-Z]/.test(key)) continue;
    const v = rawLucide[key];
    if (isIconComponent(v)) out[key] = v as LucideIcon;
  }
  return out;
})();

/**
 * Aliases let the config language feel like Home Assistant's. Two flavours:
 *   - HA MDI names prefixed `mdi:foo-bar`
 *   - Bare kebab-case shortcuts (`weather-cloudy`) that match HA's icon state
 *     string on weather / media_player / etc.
 *
 * Only the common entries are listed; for anything else we fall through to
 * the PascalCase-conversion heuristic so the long tail still works.
 */
export const ICON_ALIASES: Record<string, string> = {
  // -- Weather (HA weather component states + MDI weather-* family) --------
  'weather-sunny':               'Sun',
  'weather-clear':               'Sun',
  'weather-clear-night':         'Moon',
  'weather-night':               'Moon',
  'weather-partly-cloudy':       'CloudSun',
  'weather-partly-cloudy-night': 'CloudMoon',
  'weather-cloudy':              'Cloud',
  'weather-fog':                 'CloudFog',
  'weather-hazy':                'Haze',
  'weather-windy':               'Wind',
  'weather-windy-variant':       'Wind',
  'weather-rainy':               'CloudRain',
  'weather-pouring':             'CloudRainWind',
  'weather-partly-rainy':        'CloudSunRain',
  'weather-lightning':           'CloudLightning',
  'weather-lightning-rainy':     'CloudLightning',
  'weather-partly-lightning':    'CloudLightning',
  'weather-snowy':               'CloudSnow',
  'weather-snowy-heavy':         'Snowflake',
  'weather-snowy-rainy':         'CloudSnow',
  'weather-hail':                'CloudHail',
  'weather-tornado':             'Tornado',
  'weather-hurricane':           'Tornado',

  // -- Home / rooms ---------------------------------------------------------
  'home':                        'Home',
  'home-outline':                'House',
  'door':                        'DoorOpen',
  'door-open':                   'DoorOpen',
  'door-closed':                 'DoorClosed',
  'window-open':                 'AppWindow',
  'window-closed':               'AppWindow',
  'garage':                      'Warehouse',
  'garage-open':                 'Warehouse',
  'bed':                         'Bed',
  'sofa':                        'Sofa',
  'silverware-fork-knife':       'UtensilsCrossed',
  'toilet':                      'ShowerHead',
  'stairs':                      'MoveVertical',

  // -- Lighting -------------------------------------------------------------
  'lightbulb':                   'Lightbulb',
  'lightbulb-outline':           'Lightbulb',
  'lightbulb-on':                'Lightbulb',
  'lightbulb-off':               'LightbulbOff',
  'floor-lamp':                  'Lamp',
  'ceiling-light':               'LampCeiling',
  'desk-lamp':                   'LampDesk',
  'wall-sconce':                 'LampWallUp',
  'led-strip':                   'Minus',

  // -- Climate --------------------------------------------------------------
  'thermostat':                  'Thermometer',
  'thermometer':                 'Thermometer',
  'heat-wave':                   'Flame',
  'snowflake':                   'Snowflake',
  'fire':                        'Flame',
  'fan':                         'Fan',
  'fan-off':                     'FanOff',
  'air-conditioner':             'AirVent',
  'radiator':                    'Thermometer',
  'water-percent':               'Droplets',

  // -- Media ----------------------------------------------------------------
  'television':                  'Tv',
  'television-classic':          'Tv',
  'monitor':                     'Monitor',
  'speaker':                     'Speaker',
  'speaker-wireless':            'Speaker',
  'cast':                        'Cast',
  'play':                        'Play',
  'pause':                       'Pause',
  'stop':                        'Square',
  'skip-next':                   'SkipForward',
  'skip-previous':               'SkipBack',
  'volume-high':                 'Volume2',
  'volume-medium':               'Volume1',
  'volume-low':                  'Volume',
  'volume-off':                  'VolumeX',
  'music':                       'Music',
  'music-note':                  'Music',
  'headphones':                  'Headphones',
  'microphone':                  'Mic',
  'microphone-off':              'MicOff',
  'radio':                       'Radio',

  // -- Doors / locks / security --------------------------------------------
  'lock':                        'Lock',
  'lock-open':                   'LockOpen',
  'shield':                      'Shield',
  'shield-check':                'ShieldCheck',
  'shield-off':                  'ShieldOff',
  'shield-alert':                'ShieldAlert',
  'cctv':                        'Cctv',
  'cctv-off':                    'VideoOff',
  'alarm':                       'AlarmClock',
  'alarm-light':                 'Siren',
  'bell':                        'Bell',
  'bell-off':                    'BellOff',
  'motion-sensor':               'Radar',
  'leak':                        'Droplets',

  // -- Covers / blinds / garages -------------------------------------------
  'blinds':                      'RectangleHorizontal',
  'blinds-open':                 'RectangleHorizontal',
  'blinds-horizontal':           'RectangleHorizontal',
  'curtains':                    'Columns2',
  'garage-variant':              'Warehouse',

  // -- Devices --------------------------------------------------------------
  'power':                       'Power',
  'power-plug':                  'Plug',
  'power-plug-off':              'Unplug',
  'battery':                     'Battery',
  'battery-charging':            'BatteryCharging',
  'battery-full':                'BatteryFull',
  'battery-low':                 'BatteryLow',
  'battery-outline':             'Battery',
  'ev-station':                  'Plug',
  'flash':                       'Zap',
  'flash-off':                   'ZapOff',
  'solar-panel':                 'SunMedium',
  'solar-power':                 'SunMedium',

  // -- Vehicles -------------------------------------------------------------
  'car':                         'Car',
  'car-electric':                'CarFront',
  'car-door':                    'DoorClosed',
  'car-battery':                 'BatteryCharging',
  'garage-alert':                'TriangleAlert',
  'steering':                    'Disc',

  // -- Network / connectivity ---------------------------------------------
  'wifi':                        'Wifi',
  'wifi-off':                    'WifiOff',
  'wifi-strength-4':             'Wifi',
  'ethernet':                    'Cable',
  'router-wireless':             'Router',
  'server':                      'Server',
  'cellphone':                   'Smartphone',
  'laptop':                      'Laptop',

  // -- People / presence ---------------------------------------------------
  'account':                     'User',
  'account-multiple':            'Users',
  'home-account':                'UserRound',
  'walk':                        'PersonStanding',
  'run':                         'Activity',
  'bike':                        'Bike',

  // -- Water / utilities ---------------------------------------------------
  'water':                       'Droplet',
  'water-pump':                  'Droplets',
  'water-boiler':                'Flame',
  'pipe':                        'Pipette',
  'sprinkler':                   'Sprout',
  'pool':                        'Waves',
  'gas-station':                 'Fuel',
  'recycle':                     'Recycle',
  'trash-can':                   'Trash2',

  // -- Nature ---------------------------------------------------------------
  'tree':                        'TreeDeciduous',
  'flower':                      'Flower',
  'leaf':                        'Leaf',
  'pine-tree':                   'TreePine',

  // -- Navigation / UI -----------------------------------------------------
  'map-marker':                  'MapPin',
  'map':                         'Map',
  'compass':                     'Compass',
  'navigation':                  'Navigation',
  'target':                      'Target',
  'crosshairs':                  'Crosshair',

  // -- Time ----------------------------------------------------------------
  'clock':                       'Clock',
  'clock-outline':               'Clock',
  'calendar':                    'Calendar',
  'calendar-today':              'CalendarDays',
  'timer':                       'Timer',
  'timer-outline':               'Timer',
  'hourglass':                   'Hourglass',

  // -- Status --------------------------------------------------------------
  'check':                       'Check',
  'check-circle':                'CircleCheck',
  'close':                       'X',
  'close-circle':                'CircleX',
  'alert':                       'TriangleAlert',
  'alert-circle':                'CircleAlert',
  'information':                 'Info',
  'help':                        'CircleHelp',
  'star':                        'Star',
  'heart':                       'Heart',

  // -- Commerce / misc ------------------------------------------------------
  'cart':                        'ShoppingCart',
  'package':                     'Package',
  'tag':                         'Tag',
  'credit-card':                 'CreditCard',
  'wallet':                      'Wallet',
  'gift':                        'Gift',
  'coffee':                      'Coffee',
  'food':                        'UtensilsCrossed',

  // -- Tools / settings ----------------------------------------------------
  'cog':                         'Settings',
  'wrench':                      'Wrench',
  'tools':                       'Wrench',
  'pencil':                      'Pencil',
  'delete':                      'Trash2',
  'plus':                        'Plus',
  'minus':                       'Minus',
  'refresh':                     'RefreshCw',
  'reload':                      'RefreshCw',
  'sync':                        'RotateCw',
  'update':                      'ArrowUpCircle',
  'filter':                      'Filter',
  'magnify':                     'Search',
  'eye':                         'Eye',
  'eye-off':                     'EyeOff',
};

/**
 * Emoji → lucide mapping. Legacy dashboards (and the original seed YAML)
 * used colourful emoji glyphs for card icons. The new default look is
 * simple stroke icons, so we auto-upgrade any known emoji to its closest
 * lucide equivalent. Users who explicitly type an emoji that isn't in
 * this table still see the emoji rendered literally (via IconGlyph's
 * emoji fallback) — this table is an upgrade, not a hard replacement.
 */
export const EMOJI_ICONS: Record<string, string> = {
  // Home / doors / windows
  '🚪': 'DoorOpen',
  '🔒': 'Lock',
  '🔓': 'LockOpen',
  '🔑': 'Key',
  '🏠': 'Home',
  '🏡': 'Home',
  '🏚️': 'House',
  '🪟': 'Blinds',
  // Lights / power / electricity
  '💡': 'Lightbulb',
  '🔌': 'Plug',
  '⚡': 'Zap',
  '🔋': 'BatteryFull',
  '⏻': 'Power',
  '☀️': 'Sun',
  '🌙': 'Moon',
  // Climate / weather
  '🌡️': 'Thermometer',
  '💧': 'Droplet',
  '🔥': 'Flame',
  '❄️': 'Snowflake',
  '🌬️': 'Wind',
  '🌤️': 'CloudSun',
  '☁️': 'Cloud',
  '🌧️': 'CloudRain',
  '🌨️': 'CloudSnow',
  '⛈️': 'CloudLightning',
  // Security / alarms / presence
  '🛡️': 'Shield',
  '🚨': 'Siren',
  '🔔': 'Bell',
  '👁️': 'Eye',
  '📷': 'Camera',
  '📹': 'Video',
  '🎥': 'Video',
  '🏃': 'PersonStanding',
  '🚶': 'PersonStanding',
  '🚷': 'Ban',
  '👤': 'User',
  '👥': 'Users',
  // Cleaning / household
  '🧹': 'Brush',
  '🧽': 'Brush',
  '🚿': 'ShowerHead',
  '🛁': 'Bath',
  '🚽': 'Toilet',
  // Furniture / rooms
  '🛏️': 'Bed',
  '🛋️': 'Sofa',
  '🪑': 'Armchair',
  // Media / entertainment
  '📺': 'Tv',
  '🎵': 'Music',
  '🎶': 'Music2',
  '🎬': 'Film',
  '🎮': 'Gamepad2',
  '🔊': 'Volume2',
  '🔇': 'VolumeX',
  '▶️': 'Play',
  '⏸️': 'Pause',
  '⏹️': 'Square',
  // Tools / settings
  '⚙️': 'Settings',
  '🔧': 'Wrench',
  '🛠️': 'Wrench',
  '🔨': 'Hammer',
  '📋': 'ClipboardList',
  '📝': 'Notebook',
  // Time
  '⏰': 'AlarmClock',
  '🕒': 'Clock',
  '⏱️': 'Timer',
  '⏳': 'Hourglass',
  // Network
  '🌐': 'Globe',
  '📶': 'Wifi',
  '📡': 'Satellite',
  // Vehicles / transport
  '🚗': 'Car',
  '🚙': 'Car',
  '🏍️': 'Bike',
  '🚲': 'Bike',
  '✈️': 'Plane',
  // Nature
  '🌳': 'Trees',
  '🌲': 'TreePine',
  '🌱': 'Sprout',
  '🪴': 'Sprout',
  '🌸': 'Flower',
  // Status
  '✅': 'CheckCircle2',
  '❌': 'XCircle',
  '⚠️': 'TriangleAlert',
  'ℹ️': 'Info',
  '⭐': 'Star',
  '❤️': 'Heart',
  // Misc
  '🏊': 'Waves',
  '🏖️': 'Sun',
  '🍳': 'ChefHat',
  '☕': 'Coffee',
  '👟': 'Footprints',
  '🎯': 'Target',
  '🔍': 'Search',
  '📊': 'BarChart3',
  '📈': 'TrendingUp',
  '📉': 'TrendingDown',
};

// True when the string consists of a single Extended_Pictographic scalar
// (with an optional variation selector). We use this to short-circuit the
// alias lookup — emoji shouldn't match `mdi:` stripping or kebab→Pascal.
const EMOJI_RE = /^\p{Extended_Pictographic}(?:\uFE0F)?$/u;

/**
 * Resolve an icon name from any of our supported formats to a lucide component.
 *
 * Resolution order:
 *   1. Emoji alias table (🚪 → DoorOpen, etc.) — legacy dashboards come
 *      through here so they auto-render as stroke icons.
 *   2. Exact PascalCase lucide name ("CloudRain")
 *   3. HA alias table (`mdi:cloud-rain` or `cloud-rain` / `weather-cloudy`)
 *   4. Kebab-case → PascalCase conversion ("cloud-rain" → "CloudRain")
 *   5. null (caller falls back to emoji text or a dash)
 */
export function resolveIcon(name: string | undefined | null): LucideIcon | null {
  if (!name) return null;
  const s = name.trim();
  if (!s) return null;

  // 1. Emoji → lucide upgrade (common path for legacy dashboards)
  if (EMOJI_ICONS[s]) {
    return LUCIDE_ICONS[EMOJI_ICONS[s]] ?? null;
  }
  // Unmapped emoji: signal "not a lucide" so IconGlyph falls back to
  // rendering the emoji verbatim. Don't try the Pascal-case heuristic
  // on a pictograph — it won't end well.
  if (EMOJI_RE.test(s)) return null;

  // 2. Direct lucide name
  if (LUCIDE_ICONS[s]) return LUCIDE_ICONS[s];

  // 3. Strip `mdi:` prefix and look up alias / lucide
  const stripped = s.replace(/^mdi:/i, '');
  if (ICON_ALIASES[stripped]) {
    return LUCIDE_ICONS[ICON_ALIASES[stripped]] ?? null;
  }

  // 4. Kebab → Pascal
  const pascal = stripped.split(/[-_\s]+/).filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
  if (LUCIDE_ICONS[pascal]) return LUCIDE_ICONS[pascal];

  return null;
}

/** List of all canonical icon names available to pickers.
 *  Sorted alphabetically. Includes every lucide icon (the alias table is for
 *  inbound resolution — the picker only shows canonical names). */
export const ICON_NAMES: string[] = Object.keys(LUCIDE_ICONS).sort();

/** Broad category groupings for the picker sidebar. A name can appear in
 *  multiple groups; we match on substrings so the groups don't need
 *  hand-curation. */
export const ICON_GROUPS: ReadonlyArray<{ id: string; label: string; match: RegExp }> = [
  { id: 'weather',   label: 'Weather',    match: /(Cloud|Sun|Moon|Rain|Snow|Wind|Storm|Haze|Tornado|Umbrella|Thermom|Droplet|Flame|Snowflake)/i },
  { id: 'home',      label: 'Home',       match: /(Home|House|Door|Window|Lamp|Light|Bed|Sofa|Kitchen|Bath|Warehouse|Chair|Couch)/i },
  { id: 'security',  label: 'Security',   match: /(Lock|Shield|Key|Alarm|Bell|Cctv|Siren|Eye|Radar)/i },
  { id: 'media',     label: 'Media',      match: /(Play|Pause|Skip|Volume|Tv|Monitor|Speaker|Music|Headphone|Mic|Radio|Cast)/i },
  { id: 'devices',   label: 'Devices',    match: /(Phone|Laptop|Tablet|Cpu|Hard|Keyboard|Mouse|Router|Printer|Battery|Plug|Fan|Thermometer|Refrigerator)/i },
  { id: 'vehicles',  label: 'Vehicles',   match: /(Car|Bike|Bus|Truck|Train|Plane|Ship|Scooter|Motor)/i },
  { id: 'nature',    label: 'Nature',     match: /(Tree|Leaf|Flower|Mountain|Sprout|Forest|Bird|Fish|Bug|Cat|Dog)/i },
  { id: 'status',    label: 'Status',     match: /(Check|Cross|Alert|Triangle|Info|Help|Star|Heart|Square|Circle)/i },
  { id: 'ui',        label: 'UI',         match: /(Arrow|Chevron|Plus|Minus|Search|Filter|Settings|Menu|Grid|List|Tag|Bookmark)/i },
];
