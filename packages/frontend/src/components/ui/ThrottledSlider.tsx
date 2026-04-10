'use client';

import { useRef, useState, useCallback } from 'react';
import * as Slider from '@radix-ui/react-slider';

interface ThrottledSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueCommit: (value: number) => void;
  throttleMs?: number;
  disabled?: boolean;
}

export function ThrottledSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueCommit,
  throttleMs = 500,
  disabled = false,
}: ThrottledSliderProps) {
  const [localValue, setLocalValue] = useState(value);
  const lastSent = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);

  // Sync external value when not dragging
  if (!isDragging.current && value !== localValue) {
    setLocalValue(value);
  }

  const throttledSend = useCallback(
    (v: number) => {
      const now = Date.now();
      if (now - lastSent.current >= throttleMs) {
        lastSent.current = now;
        onValueCommit(v);
      } else {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          lastSent.current = Date.now();
          onValueCommit(v);
        }, throttleMs - (now - lastSent.current));
      }
    },
    [onValueCommit, throttleMs],
  );

  const handleChange = (values: number[]) => {
    isDragging.current = true;
    setLocalValue(values[0]);
    throttledSend(values[0]);
  };

  const handleCommit = (values: number[]) => {
    isDragging.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastSent.current = Date.now();
    onValueCommit(values[0]);
  };

  return (
    <Slider.Root
      className="relative flex h-5 w-full touch-none select-none items-center"
      value={[localValue]}
      min={min}
      max={max}
      step={step}
      onValueChange={handleChange}
      onValueCommit={handleCommit}
      disabled={disabled}
    >
      <Slider.Track
        className="relative h-1.5 w-full grow rounded-full"
        style={{ backgroundColor: 'var(--color-slider-track)' }}
      >
        <Slider.Range
          className="absolute h-full rounded-full"
          style={{ backgroundColor: 'var(--color-slider-range)' }}
        />
      </Slider.Track>
      <Slider.Thumb
        className="block h-4 w-4 rounded-full shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        style={{ backgroundColor: 'var(--color-slider-thumb)' }}
      />
    </Slider.Root>
  );
}
