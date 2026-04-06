'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type ToggleSize = 'sm' | 'md' | 'lg';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: ToggleSize;
  className?: string;
}

const trackSize: Record<ToggleSize, string> = {
  sm: 'w-9 h-5',
  md: 'w-11 h-6',
  lg: 'w-14 h-8',
};

const thumbDiameter: Record<ToggleSize, number> = {
  sm: 14,
  md: 18,
  lg: 24,
};

const thumbOffset: Record<ToggleSize, { off: number; on: number }> = {
  sm: { off: 3, on: 19 },
  md: { off: 3, on: 23 },
  lg: { off: 4, on: 28 },
};

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
  className,
}: ToggleProps) {
  const d = thumbDiameter[size];
  const offset = thumbOffset[size];

  return (
    <label
      className={cn(
        'inline-flex items-center gap-2.5 select-none',
        disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer',
        className
      )}
    >
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative rounded-full transition-colors duration-200',
          trackSize[size],
          checked
            ? 'bg-accent shadow-[0_0_12px_rgba(59,130,246,0.3)]'
            : 'bg-white/10'
        )}
      >
        <motion.span
          className="absolute top-1/2 block rounded-full bg-white shadow-md"
          style={{ width: d, height: d }}
          animate={{ x: checked ? offset.on : offset.off, y: '-50%' }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
      {label && (
        <span className="text-sm text-zinc-300">{label}</span>
      )}
    </label>
  );
}
