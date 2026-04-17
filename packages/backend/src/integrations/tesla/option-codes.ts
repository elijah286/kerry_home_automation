// ---------------------------------------------------------------------------
// Tesla option-code parser.
//
// `vehicle_config.option_codes` is a comma-separated list of ~50 3-4 letter
// codes describing the build: paint ("PPSW" = Pearl White), wheels ("W38B" =
// Aero 18"), trim, interior, etc. Tesla's own configurator uses these codes
// (via the `options=…` param) to render the compositor image of that specific
// VIN's car.
//
// Two outputs needed for the dashboard card:
//   1. The `model=` family (model3, models, modelx, modely) derived from the
//      option codes. The compositor rejects requests without a model, so when
//      we can't resolve one we return null and the card uses a silhouette.
//   2. A best-effort "Pearl White 19″ Sport" label pair to show under the
//      vehicle name. We only carry a small lookup; anything unknown is
//      dropped rather than fabricated.
//
// Tesla does not publish a canonical option-code list; community-maintained
// tables (EVTV, teslaapi.io, teslams) overlap ~90%. We list the common
// post-2017 paint and wheel codes, which covers every car this integration is
// likely to see. Additions are one-line edits — no logic change required.
// ---------------------------------------------------------------------------

// Order matters: more specific codes (refresh wheels, special paints) first so
// a partial-prefix lookup never returns the generic ancestor by accident.

const PAINT_COLORS: Record<string, string> = {
  PBSB: 'Solid Black',
  PBCW: 'Catalina White',
  PMBL: 'Obsidian Black',
  PMMB: 'Metallic Blue',
  PMNG: 'Midnight Silver',
  PMSS: 'Silver Metallic',
  PPMR: 'Multi-Coat Red',
  PPSB: 'Deep Blue Metallic',
  PPSR: 'Signature Red',
  PPSW: 'Pearl White',
  PPTI: 'Titanium Metallic',
  PSSB: 'Sapphire Blue',
  PMAB: 'Anza Brown Metallic',
  PPAG: 'Agate Green',
  PPGR: 'Green',
  PMTG: 'Dolphin Grey',
  PN00: 'Ultra Red',
  PN01: 'Quicksilver',
  PN02: 'Stealth Grey',
  PN03: 'Lunar Silver',
  PN04: 'Glacier Blue',
};

const WHEEL_NAMES: Record<string, string> = {
  W38B: '18″ Aero Wheels',
  W39B: '19″ Sport Wheels',
  WT19: '19″ Tempest Wheels',
  WT20: '20″ Induction Wheels',
  W32P: '20″ Performance Wheels',
  W40B: '20″ Überturbine Wheels',
  WTAS: '20″ Arachnid Wheels',
  WTSG: '21″ Sonic Carbon Arachnid',
  WY18B: '18″ Gemini Wheels',
  WY19B: '19″ Sport Wheels',
  WY20P: '21″ Überturbine Wheels',
  W20X: '20″ Cyberstream Wheels',
  W21X: '21″ Crossflow Wheels',
  WTBX: '20″ Turbine Wheels',
  WPBK: '22″ Onyx Black Turbine Wheels',
  WTTB: '22″ Turbine Wheels',
  WT22P: '22″ Arachnid Wheels',
  W19B: '19″ Nova Wheels',
};

const TRIM_NAMES: Record<string, string> = {
  MTS04: 'Model S Standard',
  MT103: 'Model S 100D',
  MTP03: 'Model S Performance',
  MTS05: 'Model S Dual Motor',
  MTX01: 'Model X Standard',
  MT100: 'Model X P100D',
  MTY05: 'Model Y Performance',
  MTY04: 'Model Y Long Range',
  MTY03: 'Model Y Standard Range',
  MDL3: 'Model 3 (Standard Range)',
  MDLS: 'Model S',
  MDLX: 'Model X',
  MDLY: 'Model Y',
};

// Compositor `model=` families, keyed by the first 2-3 letters of the trim
// code. Falls back to the VIN's 3rd character when trim isn't recognised
// (S = models, 3 = model3, X = modelx, Y = modely) — this is the letter
// Tesla uses in VIN position 4 to denote model family.
const MODEL_FROM_TRIM: Array<[RegExp, string]> = [
  [/^MTS/, 'models'],
  [/^MDL?S/, 'models'],
  [/^MTX/, 'modelx'],
  [/^MDL?X/, 'modelx'],
  [/^MTY/, 'modely'],
  [/^MDL?Y/, 'modely'],
  [/^MT3|^MDL?3|^M3/, 'model3'],
];

export interface ResolvedOptions {
  model: string | null;
  optionCodes: string | null;
  paintColor: string | null;
  wheelName: string | null;
  trimName: string | null;
}

/** Parse a raw option-codes string from `vehicle_config.option_codes` into
 *  the compositor inputs + friendly labels. Any unknown code is simply
 *  ignored — the output is always safe to render. */
export function parseOptionCodes(raw: unknown, vin?: string): ResolvedOptions {
  const normalised = typeof raw === 'string' ? raw.trim() : '';
  const codes = normalised ? normalised.split(',').map((c) => c.trim()).filter(Boolean) : [];

  let paint: string | null = null;
  let wheels: string | null = null;
  let trim: string | null = null;
  let model: string | null = null;

  for (const code of codes) {
    if (!paint && PAINT_COLORS[code]) paint = PAINT_COLORS[code];
    if (!wheels && WHEEL_NAMES[code]) wheels = WHEEL_NAMES[code];
    if (!trim && TRIM_NAMES[code]) trim = TRIM_NAMES[code];
    if (!model) {
      for (const [re, m] of MODEL_FROM_TRIM) {
        if (re.test(code)) { model = m; break; }
      }
    }
  }

  // VIN character 4 is the model family (S/3/X/Y) for post-2017 cars. Use it
  // only when the option codes didn't resolve a model.
  if (!model && vin && vin.length >= 4) {
    const c = vin[3]?.toUpperCase();
    if (c === 'S') model = 'models';
    else if (c === 'X') model = 'modelx';
    else if (c === 'Y') model = 'modely';
    else if (c === '3') model = 'model3';
  }

  return {
    model,
    optionCodes: normalised || null,
    paintColor: paint,
    wheelName: wheels,
    trimName: trim,
  };
}
