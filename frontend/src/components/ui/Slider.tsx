'use client';

import * as RadixSlider from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  showValue?: boolean;
  unit?: string;
  className?: string;
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = false,
  unit = '',
  className,
}: SliderProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-sm">
          {label && <span className="text-zinc-400">{label}</span>}
          {showValue && (
            <span className="tabular-nums text-zinc-300 font-medium">
              {value}{unit}
            </span>
          )}
        </div>
      )}
      <RadixSlider.Root
        className="relative flex h-5 w-full touch-none items-center select-none"
        value={[value]}
        onValueChange={([v]) => onValueChange(v)}
        min={min}
        max={max}
        step={step}
      >
        <RadixSlider.Track className="relative h-1.5 grow rounded-full bg-white/10">
          <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          className={cn(
            'block h-5 w-5 rounded-full bg-white shadow-md',
            'ring-2 ring-accent/50',
            'hover:ring-accent hover:scale-110',
            'focus-visible:outline-none focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'transition-transform duration-100',
            'before:absolute before:-inset-2.5 before:content-[""]'
          )}
          aria-label={label}
        />
      </RadixSlider.Root>
    </div>
  );
}
