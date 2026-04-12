import type { ResolvedColors } from './LCARSVariantProvider';

/**
 * Single continuous vertical strip: elbow colors flow into segment stripes so the rail
 * meets the top/bottom SVG elbows without a hard hue break.
 */
export function lcarsVerticalRailGradient(colors: ResolvedColors): string {
  const { elbowTop, elbowBottom, verticalSegments } = colors;
  const mid = verticalSegments.length ? verticalSegments : [elbowTop, elbowBottom];
  const stops = [elbowTop, ...mid, elbowBottom];
  if (stops.length < 2) return elbowTop;
  const n = stops.length - 1;
  return `linear-gradient(180deg, ${stops.map((c, i) => `${c} ${((i / n) * 100).toFixed(1)}%`).join(', ')})`;
}
