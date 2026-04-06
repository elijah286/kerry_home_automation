'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Thermometer, Flame, Snowflake, Fan, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useEntity } from '@/hooks/useEntity';
import { useSendCommand } from '@/hooks/useSendCommand';

interface ClimateCardProps {
  entityId: string;
  name?: string;
  className?: string;
}

type HvacAction = 'idle' | 'heating' | 'cooling' | 'fan' | 'drying' | 'off';

const hvacConfig: Record<HvacAction, { color: string; icon: typeof Flame; badge: 'default' | 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
  heating: { color: 'text-orange-400', icon: Flame, badge: 'warning', label: 'Heating' },
  cooling: { color: 'text-blue-400', icon: Snowflake, badge: 'info', label: 'Cooling' },
  fan: { color: 'text-emerald-400', icon: Fan, badge: 'success', label: 'Fan' },
  idle: { color: 'text-zinc-500', icon: Thermometer, badge: 'default', label: 'Idle' },
  drying: { color: 'text-yellow-400', icon: Thermometer, badge: 'warning', label: 'Drying' },
  off: { color: 'text-zinc-600', icon: Thermometer, badge: 'default', label: 'Off' },
};

export function ClimateCard({ entityId, name, className }: ClimateCardProps) {
  const { state, attributes, loading } = useEntity(entityId);
  const sendCommand = useSendCommand();
  const [expanded, setExpanded] = useState(false);

  const currentTemp = attributes.current_temperature as number | undefined;
  const targetTemp = attributes.temperature as number | undefined;
  const hvacAction = (attributes.hvac_action as HvacAction) ?? (state as HvacAction) ?? 'idle';
  const minTemp = (attributes.min_temp as number) ?? 50;
  const maxTemp = (attributes.max_temp as number) ?? 90;
  const displayName = name ?? (attributes.friendly_name as string) ?? entityId;

  const config = hvacConfig[hvacAction] ?? hvacConfig.idle;
  const ActionIcon = config.icon;

  const adjustTemp = useCallback(
    (delta: number) => {
      if (targetTemp == null) return;
      const next = Math.min(Math.max(targetTemp + delta, minTemp), maxTemp);
      sendCommand(entityId, 'set_temperature', { temperature: next });
    },
    [entityId, targetTemp, minTemp, maxTemp, sendCommand]
  );

  if (loading) {
    return (
      <Card className={cn('animate-pulse h-28', className)} padding="md">
        <div className="space-y-3">
          <div className="h-4 w-32 rounded bg-white/5" />
          <div className="h-10 w-20 rounded bg-white/5" />
        </div>
      </Card>
    );
  }

  return (
    <Card hoverable onClick={() => setExpanded((v) => !v)} className={className} padding="md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-200">{displayName}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <motion.span
              key={currentTemp}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl font-semibold tabular-nums text-zinc-100"
            >
              {currentTemp ?? '—'}
            </motion.span>
            <span className="text-lg text-zinc-500">°</span>
          </div>
          {targetTemp != null && (
            <p className="text-xs text-zinc-500 mt-0.5">
              Target: {targetTemp}°
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <Badge variant={config.badge} size="sm">{config.label}</Badge>
          <motion.div
            animate={
              hvacAction === 'heating'
                ? { color: '#fb923c' }
                : hvacAction === 'cooling'
                  ? { color: '#60a5fa' }
                  : { color: '#71717a' }
            }
          >
            <ActionIcon size={28} strokeWidth={1.5} className={config.color} />
          </motion.div>
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
            <div className="pt-4 flex items-center justify-center gap-6">
              <button
                onClick={(e) => { e.stopPropagation(); adjustTemp(-1); }}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 active:scale-90 transition-all"
              >
                <Minus size={20} />
              </button>

              <div className="text-center">
                <span className="text-2xl font-semibold tabular-nums text-zinc-100">
                  {targetTemp ?? '—'}°
                </span>
                <p className="text-[10px] text-zinc-600 mt-0.5">TARGET</p>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); adjustTemp(1); }}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 active:scale-90 transition-all"
              >
                <Plus size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
