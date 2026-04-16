// ---------------------------------------------------------------------------
// Token helpers. The single path for card components to reference theme
// colors and radii. Any card that resolves a color outside these helpers is
// a bug — catch it in review or with the `scripts/check-card-tokens.mjs`
// grep check introduced in Phase 1.4.
//
// Usage:
//   import { token, severityVar } from '@/lib/tokens';
//   <div style={{ background: token('--color-bg-card'), color: token('--color-text') }} />
//   <span style={{ color: severityVar('critical') }} />
//
// These helpers just produce `var(--...)` strings. They do not read the live
// computed value — letting the browser resolve the variable is faster and
// repaints for free on theme switch. If a card ever needs the raw value (e.g.
// to feed a canvas/chart lib), call `resolveToken()` which does a DOM read.
// ---------------------------------------------------------------------------

import {
  SEVERITY_TO_TOKEN,
  type SeverityLevel,
  type ThemeTokenName,
} from '@ha/shared';

/** Return a CSS `var(...)` reference for the given theme token. */
export function token(name: ThemeTokenName, fallback?: string): string {
  return fallback ? `var(${name}, ${fallback})` : `var(${name})`;
}

/** Return a CSS `var(...)` reference for a semantic severity level. */
export function severityVar(level: SeverityLevel, fallback?: string): string {
  return token(SEVERITY_TO_TOKEN[level], fallback);
}

/**
 * Read the current computed value of a token from the document root.
 * Prefer `token()` whenever possible; this triggers a style recompute and is
 * only appropriate for canvas/WebGL consumers that can\'t use CSS variables.
 */
export function resolveToken(name: ThemeTokenName): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
