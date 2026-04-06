'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Slider } from '@/components/ui/Slider';
import { useEntity } from '@/hooks/useEntity';
import { useSendCommand } from '@/hooks/useSendCommand';

interface LightCardProps {
  entityId: string;
  name?: string;
  className?: string;
}

export function LightCard({ entityId, name, className }: LightCardProps) {
  const { state, attributes, loading } = useEntity(entityId);
  const sendCommand = useSendCommand();
  const [expanded, setExpanded] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const isOn = state === 'on';
  const brightness = typeof attributes.brightness === 'number'
    ? Math.round((attributes.brightness as number) / 255 * 100)
    : 0;
  const displayName = name ?? (attributes.friendly_name as string) ?? entityId;

  const handleToggle = useCallback(() => {
    sendCommand(entityId, 'toggle');
  }, [entityId, sendCommand]);

  const handleBrightness = useCallback(
    (val: number) => {
      sendCommand(entityId, 'turn_on', { brightness: Math.round(val * 2.55) });
    },
    [entityId, sendCommand]
  );

  const handlePointerDown = () => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setExpanded((e) => !e);
    }, 500);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (!didLongPress.current) handleToggle();
  };

  const handlePointerLeave = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  if (loading) {
    return (
      <Card className={cn('animate-pulse h-24', className)} padding="md">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-white/5" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-28 rounded bg-white/5" />
            <div className="h-2.5 w-16 rounded bg-white/5" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card hoverable className={className} padding="md">
      <div
        className="flex items-center gap-3"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <motion.div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            isOn ? 'bg-amber-400/15' : 'bg-white/5'
          )}
          animate={
            isOn
              ? { boxShadow: '0 0 20px rgba(251,191,36,0.25)' }
              : { boxShadow: '0 0 0px transparent' }
          }
          transition={{ duration: 0.4 }}
        >
          <motion.div animate={{ scale: isOn ? 1 : 0.85, opacity: isOn ? 1 : 0.4 }}>
            <Lightbulb
              size={22}
              strokeWidth={1.8}
              className={isOn ? 'text-amber-400' : 'text-zinc-600'}
              fill={isOn ? 'rgba(251,191,36,0.3)' : 'none'}
            />
          </motion.div>
        </motion.div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{displayName}</p>
          <p className="text-xs text-zinc-500">
            {isOn ? `${brightness}% brightness` : 'Off'}
          </p>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors px-1"
        >
          {expanded ? 'close' : 'adjust'}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pt-4">
              <Slider
                value={brightness}
                onValueChange={handleBrightness}
                min={1}
                max={100}
                label="Brightness"
                showValue
                unit="%"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
