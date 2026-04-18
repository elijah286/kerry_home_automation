'use client';

import { useEffect, useRef, useState } from 'react';
import { SystemStatsGraph } from '@/components/viz/SystemStatsGraph';

interface Props {
  rangeMs: number;
}

/**
 * Performance dock layout: side-by-side CPU + memory by default, stacked when
 * the container is narrower than ~720px (not enough room to read both).
 */
export function StatusPerformanceView({ rangeMs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setStacked(w < 720);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="grid gap-3 px-3 py-3"
      style={{
        gridTemplateColumns: stacked ? '1fr' : '1fr 1fr',
      }}
    >
      <section className="min-w-0">
        <div
          className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          CPU
        </div>
        <SystemStatsGraph metric="cpu" controlledRangeMs={rangeMs} height={140} smooth />
      </section>
      <section className="min-w-0">
        <div
          className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Memory
        </div>
        <SystemStatsGraph metric="memory" controlledRangeMs={rangeMs} height={140} />
      </section>
    </div>
  );
}
