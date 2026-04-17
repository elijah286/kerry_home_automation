'use client';

// ---------------------------------------------------------------------------
// IconGlyph — render an icon by name as a stroke-only outline glyph.
//
// Rules of thumb:
//   - Colour is always `currentColor` so themes propagate via CSS text-color.
//     Never pass explicit fill/colour; set it on the parent via a token.
//   - Stroke width 1.75 (lucide's default) across the app so nothing looks
//     heavier than anything else.
//   - If the name doesn't resolve and the string is a single emoji-range
//     character, we render it as text instead. That's the only escape hatch
//     — arbitrary text icons are banned because they break the consistent
//     visual language the user called out.
// ---------------------------------------------------------------------------

import type { ComponentProps } from 'react';
import { resolveIcon } from './registry';

export interface IconGlyphProps {
  /** Icon name. Any of: lucide PascalCase ("CloudRain"), MDI ("mdi:cloud-rain"),
   *  kebab ("cloud-rain"), or an emoji character. */
  name: string | undefined | null;
  /** Pixel size. Defaults to 16. */
  size?: number;
  /** Stroke width. Defaults to 1.75 (lucide default). */
  strokeWidth?: number;
  className?: string;
  style?: ComponentProps<'svg'>['style'];
  /** Optional accessible label. Omit for purely decorative icons. */
  'aria-label'?: string;
}

// Single emoji character range — covers the common pictographic planes.
// Not an exhaustive Unicode emoji matcher (doesn't need to be; this is a
// fallback, not a primary path).
const EMOJI_RE = /^\p{Extended_Pictographic}(?:\uFE0F)?$/u;

export function IconGlyph({
  name, size = 16, strokeWidth = 1.75, className, style, ...aria
}: IconGlyphProps) {
  const Icon = resolveIcon(name ?? undefined);
  if (Icon) {
    return (
      <Icon
        width={size}
        height={size}
        strokeWidth={strokeWidth}
        className={className}
        style={style}
        aria-hidden={!aria['aria-label']}
        aria-label={aria['aria-label']}
      />
    );
  }
  // Emoji fallback — only when the raw name is a single emoji character.
  // Anything else renders a thin dash placeholder so the layout doesn't
  // jump when an icon fails to resolve.
  if (name && EMOJI_RE.test(name.trim())) {
    return (
      <span
        className={className}
        style={{ fontSize: size, lineHeight: 1, ...style }}
        aria-hidden={!aria['aria-label']}
        aria-label={aria['aria-label']}
      >
        {name.trim()}
      </span>
    );
  }
  return (
    <span
      className={className}
      style={{ width: size, height: size, display: 'inline-block', opacity: 0.4, ...style }}
      aria-hidden
    >
      —
    </span>
  );
}
