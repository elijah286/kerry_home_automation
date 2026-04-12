/**
 * Walk a nested object using explicit path segments (handles keys that contain dots).
 */
export function getValueAtSegments(obj: unknown, segments: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of segments) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Human label for a path (segments joined). */
export function formatFieldPath(segments: string[]): string {
  return segments.join(' › ');
}
