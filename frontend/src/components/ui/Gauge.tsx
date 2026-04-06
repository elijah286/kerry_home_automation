'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type GaugeSize = 'sm' | 'md' | 'lg';

interface GaugeProps {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
  size?: GaugeSize;
  color?: string;
  className?: string;
}

const dimensions: Record<GaugeSize, { svgSize: number; r: number; stroke: number; fontSize: string; unitSize: string; labelSize: string }> = {
  sm: { svgSize: 80, r: 32, stroke: 6, fontSize: 'text-lg', unitSize: 'text-[10px]', labelSize: 'text-[10px]' },
  md: { svgSize: 120, r: 48, stroke: 8, fontSize: 'text-2xl', unitSize: 'text-xs', labelSize: 'text-xs' },
  lg: { svgSize: 160, r: 64, stroke: 10, fontSize: 'text-3xl', unitSize: 'text-sm', labelSize: 'text-sm' },
};

const ARC_SPAN = 240;

export function Gauge({
  value,
  min = 0,
  max = 100,
  label,
  unit = '',
  size = 'md',
  color,
  className,
}: GaugeProps) {
  const { svgSize, r, stroke, fontSize, unitSize, labelSize } = dimensions[size];
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const circumference = 2 * Math.PI * r;
  const arcLength = (ARC_SPAN / 360) * circumference;
  const clamped = Math.min(Math.max(value, min), max);
  const fraction = (clamped - min) / (max - min);
  const filledLength = fraction * arcLength;
  const startAngle = 90 + (360 - ARC_SPAN) / 2;

  const resolvedColor = color ?? '#3b82f6';

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div className="relative" style={{ width: svgSize, height: svgSize }}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          className="-rotate-90"
          style={{ transform: `rotate(${startAngle}deg)` }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={stroke}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          <motion.circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={resolvedColor}
            strokeWidth={stroke}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
            initial={{ strokeDashoffset: arcLength }}
            animate={{ strokeDashoffset: arcLength - filledLength }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{
              filter: `drop-shadow(0 0 6px ${resolvedColor}40)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn(fontSize, 'font-semibold tabular-nums text-zinc-100 leading-none')}>
            {Math.round(clamped)}
          </span>
          {unit && (
            <span className={cn(unitSize, 'text-zinc-500 mt-0.5')}>{unit}</span>
          )}
        </div>
      </div>
      {label && (
        <span className={cn(labelSize, 'text-zinc-500 text-center')}>{label}</span>
      )}
    </div>
  );
}
