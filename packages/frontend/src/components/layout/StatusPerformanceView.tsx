'use client';

import { SystemStatsGraph } from '@/components/viz/SystemStatsGraph';

interface Props {
  rangeMs: number;
}

export function StatusPerformanceView({ rangeMs }: Props) {
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <section>
        <div
          className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          CPU
        </div>
        <SystemStatsGraph metric="cpu" controlledRangeMs={rangeMs} height={140} />
      </section>
      <section>
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
