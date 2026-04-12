/** Pretty-print with sorted keys at each object level (readable diffs). */
export function stableStringify(value: unknown): string {
  const sortKeys = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(sortKeys);
    const o = v as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) {
      sorted[k] = sortKeys(o[k]);
    }
    return sorted;
  };
  try {
    return JSON.stringify(sortKeys(value), null, 2);
  } catch {
    return String(value);
  }
}
