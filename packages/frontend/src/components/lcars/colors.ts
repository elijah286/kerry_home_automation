// ============================================================
// LCARS Color Palette System
// Supports multiple show variants: TNG, DS9, Voyager
// ============================================================

export interface LCARSPalette {
  id: string;
  name: string;

  // Frame structure colors
  elbowTop: string;
  elbowBottom: string;
  headerBar: string;
  footerBar: string;
  verticalSegments: string[];   // top-to-bottom color segments
  footerSegments: string[];     // left-to-right footer bar segments

  // Navigation
  navColors: string[];          // rotating pill colors
  navActive: string;            // active pill highlight

  // Semantic
  accent: string;
  muted: string;
  text: string;                 // text on colored bars

  // Red Alert overrides
  redAlert: {
    elbowTop: string;
    elbowBottom: string;
    headerBar: string;
    footerBar: string;
    verticalSegments: string[];
    footerSegments: string[];
    navColors: string[];
    navActive: string;
    accent: string;
    vignette: string;
  };
}

// ---- TNG (The Next Generation) ----
// Classic gold/butterscotch/lilac/magenta palette
export const TNG_PALETTE: LCARSPalette = {
  id: 'tng',
  name: 'TNG',
  elbowTop: '#ff9966',       // butterscotch
  elbowBottom: '#cc6699',    // magenta
  headerBar: '#ff9966',
  footerBar: '#cc6699',
  verticalSegments: ['#ff9900', '#cc99cc', '#ffcc99', '#ff9900'],
  footerSegments: ['#cc6699', '#cc99cc', '#ffcc99', '#ff9900'],
  navColors: ['#ff9966', '#cc99cc', '#ffcc99', '#cc99ff', '#ffaa90', '#99ccff', '#ff9966'],
  navActive: '#ff9900',
  accent: '#ff9900',
  muted: '#666688',
  text: '#000000',
  /* Reference: white frame + black gutters + bright red / grey chrome (e.g. redalert3.gif on LCARS ODN) */
  redAlert: {
    elbowTop: '#ffffff',
    elbowBottom: '#ffffff',
    headerBar: '#ffffff',
    footerBar: '#ffffff',
    verticalSegments: ['#f2f2f2', '#ffffff', '#e8e8e8', '#ffffff'],
    footerSegments: ['#ff0000', '#cc0000', '#990000', '#ff0000'],
    navColors: ['#ff0000', '#ee0000', '#a0a0a0', '#ff0000', '#dd0000', '#b0b0b0', '#cc0000'],
    navActive: '#ff2222',
    accent: '#ff0000',
    vignette: '#ff220033',
  },
};

// ---- DS9 (Deep Space Nine) ----
// More purples, blues, cooler tones
export const DS9_PALETTE: LCARSPalette = {
  id: 'ds9',
  name: 'DS9',
  elbowTop: '#cc99cc',       // lilac
  elbowBottom: '#6666cc',    // medium blue
  headerBar: '#cc99cc',
  footerBar: '#6666cc',
  verticalSegments: ['#9999cc', '#cc6699', '#ffcc99', '#9999cc'],
  footerSegments: ['#6666cc', '#9999cc', '#cc99cc', '#ffcc99'],
  navColors: ['#cc99cc', '#9999cc', '#ffcc99', '#cc6699', '#99ccff', '#cc99ff', '#9999cc'],
  navActive: '#ffcc99',
  accent: '#ffcc99',
  muted: '#666688',
  text: '#000000',
  redAlert: {
    elbowTop: '#ffffff',
    elbowBottom: '#ffffff',
    headerBar: '#ffffff',
    footerBar: '#ffffff',
    verticalSegments: ['#f2f2f2', '#ffffff', '#e8e8e8', '#ffffff'],
    footerSegments: ['#ff0000', '#cc0000', '#990000', '#ff0000'],
    navColors: ['#ff0000', '#ee0000', '#a0a0a0', '#ff0000', '#dd0000', '#b0b0b0', '#cc0000'],
    navActive: '#ff2222',
    accent: '#ff0000',
    vignette: '#ff220033',
  },
};

// ---- Voyager ----
// More colorful: ice, sky, lime tones mixed with gold
export const VOY_PALETTE: LCARSPalette = {
  id: 'voyager',
  name: 'Voyager',
  elbowTop: '#ff9966',       // butterscotch
  elbowBottom: '#9999ff',    // sky blue
  headerBar: '#ff9966',
  footerBar: '#9999ff',
  verticalSegments: ['#ff9900', '#99ccff', '#cccc66', '#ff9900'],
  footerSegments: ['#9999ff', '#99ccff', '#cccc66', '#ff9900'],
  navColors: ['#ff9966', '#cc99ff', '#99ccff', '#cccc66', '#ffaa90', '#9999ff', '#ff9966'],
  navActive: '#ff9900',
  accent: '#ff9900',
  muted: '#666688',
  text: '#000000',
  redAlert: {
    elbowTop: '#ffffff',
    elbowBottom: '#ffffff',
    headerBar: '#ffffff',
    footerBar: '#ffffff',
    verticalSegments: ['#f2f2f2', '#ffffff', '#e8e8e8', '#ffffff'],
    footerSegments: ['#ff0000', '#cc0000', '#990000', '#ff0000'],
    navColors: ['#ff0000', '#ee0000', '#a0a0a0', '#ff0000', '#dd0000', '#b0b0b0', '#cc0000'],
    navActive: '#ff2222',
    accent: '#ff0000',
    vignette: '#ff220033',
  },
};

export const LCARS_PALETTES: Record<string, LCARSPalette> = {
  tng: TNG_PALETTE,
  ds9: DS9_PALETTE,
  voyager: VOY_PALETTE,
};

// Backward-compatible export for existing code
export const LCARS_COLORS = {
  gold: '#ff9900',
  butterscotch: '#ff9966',
  sunflower: '#ffcc99',
  lilac: '#cc99cc',
  africanViolet: '#cc99ff',
  magenta: '#cc6699',
  peach: '#ff8866',
  almond: '#ffaa90',
  almondCreme: '#ffbbaa',
  tomato: '#ff5555',
  mars: '#ff2200',
  red: '#cc4444',
  sky: '#aaaaff',
  ice: '#99ccff',
  bluey: '#8899ff',
  blue: '#5566ff',
  gray: '#666688',
  limaBean: '#cccc66',
  green: '#999933',
  orange: '#ff8800',
};
