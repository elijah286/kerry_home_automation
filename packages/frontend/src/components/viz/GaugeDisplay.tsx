'use client';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GaugeThreshold {
  /** Value at which this color starts (inclusive) */
  value: number;
  color: string;
}

interface GaugeDisplayProps {
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
  /** Thresholds for color ranges, sorted ascending by value.
   *  E.g., [{ value: 0, color: 'red' }, { value: 50, color: 'yellow' }, { value: 80, color: 'green' }] */
  thresholds?: GaugeThreshold[];
  /** Size of the gauge in px (width & height). Default 160. */
  size?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const START_ANGLE = 135;  // degrees from 12 o'clock, clockwise
const SWEEP = 270;        // total arc sweep in degrees
const STROKE_WIDTH = 14;

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToXY(cx, cy, r, endDeg);
  const end = polarToXY(cx, cy, r, startDeg);
  const sweep = endDeg - startDeg;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GaugeDisplay({
  value,
  min = 0,
  max = 100,
  unit = '%',
  label,
  thresholds,
  size = 160,
  className,
}: GaugeDisplayProps) {
  const [animatedValue, setAnimatedValue] = useState(value);
  const prevValueRef = useRef(value);

  // Animate value changes
  useEffect(() => {
    const from = prevValueRef.current;
    const to = value;
    prevValueRef.current = value;

    if (from === to) return;

    const duration = 600;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedValue(from + (to - from) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value]);

  const range = max - min;
  const clamped = Math.max(min, Math.min(max, animatedValue));
  const fraction = range > 0 ? (clamped - min) / range : 0;

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - STROKE_WIDTH - 4) / 2;

  // Determine fill color based on thresholds
  let fillColor = 'var(--color-accent)';
  if (thresholds && thresholds.length > 0) {
    // Find the last threshold whose value <= current value
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (value >= thresholds[i].value) {
        fillColor = thresholds[i].color;
        break;
      }
    }
  }

  const valueAngle = START_ANGLE + SWEEP * fraction;

  // Build threshold arc segments for the background
  const bgSegments: { from: number; to: number; color: string }[] = [];
  if (thresholds && thresholds.length > 0) {
    for (let i = 0; i < thresholds.length; i++) {
      const tFrom = thresholds[i].value;
      const tTo = i < thresholds.length - 1 ? thresholds[i + 1].value : max;
      const fromAngle = START_ANGLE + SWEEP * ((Math.max(tFrom, min) - min) / range);
      const toAngle = START_ANGLE + SWEEP * ((Math.min(tTo, max) - min) / range);
      bgSegments.push({ from: fromAngle, to: toAngle, color: thresholds[i].color });
    }
  }

  // Format display value
  const displayValue = Number.isInteger(value) ? value.toString() : value.toFixed(1);

  return (
    <div className={`flex flex-col items-center ${className ?? ''}`}>
      <svg width={size} height={size * 0.85} viewBox={`0 0 ${size} ${size * 0.85}`}>
        {/* Background arc */}
        {bgSegments.length > 0 ? (
          bgSegments.map((seg, i) => (
            <path
              key={i}
              d={describeArc(cx, cy, r, seg.from, seg.to)}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="butt"
              opacity={0.15}
            />
          ))
        ) : (
          <path
            d={describeArc(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP)}
            fill="none"
            stroke="var(--color-chart-grid)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />
        )}

        {/* Value arc */}
        {fraction > 0.005 && (
          <path
            d={describeArc(cx, cy, r, START_ANGLE, valueAngle)}
            fill="none"
            stroke={fillColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            style={{ transition: 'none' }} // animated via state
          />
        )}

        {/* Center text */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-text)"
          fontSize={size * 0.2}
          fontWeight={600}
          fontFamily="system-ui, sans-serif"
        >
          {displayValue}
        </text>
        <text
          x={cx}
          y={cy + size * 0.13}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-text-muted)"
          fontSize={size * 0.1}
          fontFamily="system-ui, sans-serif"
        >
          {unit}
        </text>

        {/* Min/Max labels */}
        <text
          x={polarToXY(cx, cy, r + STROKE_WIDTH, START_ANGLE).x}
          y={polarToXY(cx, cy, r + STROKE_WIDTH, START_ANGLE).y + 12}
          textAnchor="middle"
          fill="var(--color-text-muted)"
          fontSize={9}
          fontFamily="system-ui, sans-serif"
        >
          {min}
        </text>
        <text
          x={polarToXY(cx, cy, r + STROKE_WIDTH, START_ANGLE + SWEEP).x}
          y={polarToXY(cx, cy, r + STROKE_WIDTH, START_ANGLE + SWEEP).y + 12}
          textAnchor="middle"
          fill="var(--color-text-muted)"
          fontSize={9}
          fontFamily="system-ui, sans-serif"
        >
          {max}
        </text>
      </svg>

      {label && (
        <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {label}
        </div>
      )}
    </div>
  );
}
