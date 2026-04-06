'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ArrowDown, Hand, Blinds } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Slider } from '@/components/ui/Slider';
import { useEntity } from '@/hooks/useEntity';
import { useSendCommand } from '@/hooks/useSendCommand';

interface CoverCardProps {
  entityId: string;
  name?: string;
  className?: string;
}

function BlindVisual({ position }: { position: number }) {
  const slats = 6;
  const openFraction = position / 100;

  return (
    <div className="flex flex-col items-center justify-center w-12 h-16 rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden px-1.5 py-1">
      {Array.from({ length: slats }).map((_, i) => (
        <motion.div
          key={i}
          className="w-full bg-zinc-500 rounded-[1px]"
          initial={false}
          animate={{
            height: 2,
            marginBottom: Math.max(1, openFraction * 6),
            opacity: 0.3 + openFraction * 0.5,
          }}
          transition={{ duration: 0.4, delay: i * 0.03 }}
        />
      ))}
    </div>
  );
}

export function CoverCard({ entityId, name, className }: CoverCardProps) {
  const { state, attributes, loading } = useEntity(entityId);
  const sendCommand = useSendCommand();
  const [expanded, setExpanded] = useState(false);

  const position = typeof attributes.current_position === 'number'
    ? (attributes.current_position as number)
    : state === 'open' ? 100 : 0;
  const displayName = name ?? (attributes.friendly_name as string) ?? entityId;
  const isOpen = state === 'open' || position > 0;

  const open = useCallback(() => {
    sendCommand(entityId, 'open_cover');
  }, [entityId, sendCommand]);

  const close = useCallback(() => {
    sendCommand(entityId, 'close_cover');
  }, [entityId, sendCommand]);

  const stop = useCallback(() => {
    sendCommand(entityId, 'stop_cover');
  }, [entityId, sendCommand]);

  const setPosition = useCallback(
    (val: number) => {
      sendCommand(entityId, 'set_cover_position', { position: val });
    },
    [entityId, sendCommand]
  );

  if (loading) {
    return (
      <Card className={cn('animate-pulse h-24', className)} padding="md">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/5" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-28 rounded bg-white/5" />
            <div className="h-2.5 w-16 rounded bg-white/5" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card hoverable onClick={() => setExpanded((v) => !v)} className={className} padding="md">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <BlindVisual position={position} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Blinds size={16} strokeWidth={1.8} className={isOpen ? 'text-accent' : 'text-zinc-600'} />
            <p className="text-sm font-medium text-zinc-200 truncate">{displayName}</p>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {position === 100 ? 'Fully open' : position === 0 ? 'Closed' : `${position}% open`}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); open(); }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300 active:scale-90 transition-all"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); stop(); }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300 active:scale-90 transition-all"
          >
            <Hand size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); close(); }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300 active:scale-90 transition-all"
          >
            <ArrowDown size={14} />
          </button>
        </div>
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
                value={position}
                onValueChange={setPosition}
                min={0}
                max={100}
                label="Position"
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
