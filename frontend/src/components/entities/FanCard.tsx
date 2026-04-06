'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Fan } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Slider } from '@/components/ui/Slider';
import { Toggle } from '@/components/ui/Toggle';
import { useEntity } from '@/hooks/useEntity';
import { useSendCommand } from '@/hooks/useSendCommand';

interface FanCardProps {
  entityId: string;
  name?: string;
  className?: string;
}

export function FanCard({ entityId, name, className }: FanCardProps) {
  const { state, attributes, loading } = useEntity(entityId);
  const sendCommand = useSendCommand();
  const [expanded, setExpanded] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const isOn = state === 'on';
  const percentage = typeof attributes.percentage === 'number' ? (attributes.percentage as number) : 0;
  const oscillating = attributes.oscillating === true;
  const presetModes = (attributes.preset_modes as string[]) ?? [];
  const currentPreset = attributes.preset_mode as string | undefined;
  const displayName = name ?? (attributes.friendly_name as string) ?? entityId;

  const handleToggle = useCallback(() => {
    sendCommand(entityId, 'toggle');
  }, [entityId, sendCommand]);

  const handlePercentage = useCallback(
    (val: number) => {
      sendCommand(entityId, 'set_percentage', { percentage: val });
    },
    [entityId, sendCommand],
  );

  const handleOscillate = useCallback(
    (checked: boolean) => {
      sendCommand(entityId, 'oscillate', { oscillating: checked });
    },
    [entityId, sendCommand],
  );

  const handlePreset = useCallback(
    (mode: string) => {
      sendCommand(entityId, 'set_preset_mode', { preset_mode: mode });
    },
    [entityId, sendCommand],
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
            isOn ? 'bg-emerald-400/15' : 'bg-white/5',
          )}
          animate={
            isOn
              ? { boxShadow: '0 0 20px rgba(52,211,153,0.25)' }
              : { boxShadow: '0 0 0px transparent' }
          }
          transition={{ duration: 0.4 }}
        >
          <motion.div
            animate={{
              scale: isOn ? 1 : 0.85,
              opacity: isOn ? 1 : 0.4,
              rotate: isOn ? 360 : 0,
            }}
            transition={{
              scale: { duration: 0.3 },
              opacity: { duration: 0.3 },
              rotate: isOn
                ? { duration: 2, repeat: Infinity, ease: 'linear' }
                : { duration: 0.3 },
            }}
          >
            <Fan
              size={22}
              strokeWidth={1.8}
              className={isOn ? 'text-emerald-400' : 'text-zinc-600'}
            />
          </motion.div>
        </motion.div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{displayName}</p>
          <p className="text-xs text-zinc-500">
            {isOn
              ? currentPreset
                ? `${currentPreset} · ${percentage}%`
                : `${percentage}% speed`
              : 'Off'}
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
            <div className="pt-4 space-y-4">
              <Slider
                value={percentage}
                onValueChange={handlePercentage}
                min={0}
                max={100}
                label="Speed"
                showValue
                unit="%"
              />

              <div className="flex items-center justify-between">
                <Toggle
                  checked={oscillating}
                  onChange={handleOscillate}
                  label="Oscillate"
                  size="sm"
                />
              </div>

              {presetModes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500">Preset</p>
                  <div className="flex flex-wrap gap-1.5">
                    {presetModes.map((mode) => (
                      <button
                        key={mode}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreset(mode);
                        }}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-xs transition-colors',
                          mode === currentPreset
                            ? 'bg-accent/15 text-accent'
                            : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200',
                        )}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
