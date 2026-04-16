// ---------------------------------------------------------------------------
// Theme token vocabulary — source of truth.
//
// Every theme declares the same set of CSS custom properties. A token is just
// a named CSS variable; themes assign values. Cards and shared UI consume the
// names listed here via the `token()` helper in `@ha/frontend` — never hex
// literals — so a single theme switch (CSS var swap on :root) repaints the
// whole UI with no React re-renders.
//
// Naming convention:
//   --color-*      palette + semantic colors
//   --radius-*     corner radii
//   --shadow-*     elevation shadows (reserved; not used yet)
//   --font-*       font families / sizes
//   --space-*      spacing scale (reserved; not used yet)
//
// When a theme omits a token, the root block in `ThemeProvider` holds the
// fallback, so a partial theme never renders broken.
// ---------------------------------------------------------------------------

// -- Categorized token names (used by validation + editor autocomplete) -----

export const SURFACE_TOKENS = [
  '--color-bg',
  '--color-bg-secondary',
  '--color-bg-card',
  '--color-bg-hover',
] as const;

export const TEXT_TOKENS = [
  '--color-text',
  '--color-text-secondary',
  '--color-text-muted',
] as const;

export const BORDER_TOKENS = [
  '--color-border',
  '--color-border-hover',
] as const;

export const ACCENT_TOKENS = [
  '--color-accent',
  '--color-accent-hover',
] as const;

/**
 * Semantic severity tokens. Legacy themes use `--color-success|warning|danger`;
 * those remain the concrete values. `--color-severity-info` is new and falls
 * back to `--color-accent` until themes override it. The mapping lives in
 * `severityVar()` on the frontend — themes do not need to rename existing vars.
 */
export const SEVERITY_TOKENS = [
  '--color-success',
  '--color-warning',
  '--color-danger',
] as const;

export const CHROME_TOKENS = [
  '--color-sidebar-bg',
  '--color-sidebar-text',
  '--color-sidebar-text-active',
  '--color-sidebar-active-bg',
  '--color-sidebar-hover',
  '--color-table-header',
  '--color-table-row-hover',
  '--color-table-stripe',
  '--color-slider-track',
  '--color-slider-range',
  '--color-slider-thumb',
] as const;

export const RADIUS_TOKENS = [
  '--radius',
  '--radius-sm',
  '--radius-lg',
] as const;

// -- Full token list ---------------------------------------------------------

/** Every token a card or shared UI component is allowed to consume. */
export const THEME_TOKENS = [
  ...SURFACE_TOKENS,
  ...TEXT_TOKENS,
  ...BORDER_TOKENS,
  ...ACCENT_TOKENS,
  ...SEVERITY_TOKENS,
  ...CHROME_TOKENS,
  ...RADIUS_TOKENS,
] as const;

export type ThemeTokenName = (typeof THEME_TOKENS)[number];

/** Map of token name → CSS value. Each theme\'s light/dark block matches this shape. */
export type ThemeTokens = Partial<Record<ThemeTokenName, string>>;

// -- Severity mapping --------------------------------------------------------
//
// The card registry speaks in `SeverityLevel` (critical|warning|info|success).
// Legacy themes speak in `--color-*`. This table is the one place that
// translates between them so cards stay theme-agnostic.

export const SEVERITY_TO_TOKEN: Record<
  'critical' | 'warning' | 'info' | 'success',
  ThemeTokenName
> = {
  critical: '--color-danger',
  warning:  '--color-warning',
  // No dedicated info token yet; accent is a deliberate, theme-aware fallback.
  info:     '--color-accent',
  success:  '--color-success',
};

// -- Required-token contract -------------------------------------------------
//
// The subset every theme MUST provide for cards to render without fallback.
// The validation script (`scripts/check-theme-tokens.mjs`) enforces this.

export const REQUIRED_THEME_TOKENS: readonly ThemeTokenName[] = [
  ...SURFACE_TOKENS,
  ...TEXT_TOKENS,
  ...BORDER_TOKENS,
  ...ACCENT_TOKENS,
  ...SEVERITY_TOKENS,
] as const;
