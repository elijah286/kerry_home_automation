'use client';

import {
  Thermometer,
  Droplets,
  Sun,
  Battery,
  Zap,
  Activity,
  DoorOpen,
  Square,
  Gauge,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { useEntity } from '@/hooks/useEntity';

interface SensorCardProps {
  entityId: string;
  name?: string;
  className?: string;
}

const DEVICE_CLASS_ICONS: Record<string, LucideIcon> = {
  temperature: Thermometer,
  humidity: Droplets,
  illuminance: Sun,
  battery: Battery,
  power: Zap,
  energy: Zap,
  motion: Activity,
  door: DoorOpen,
  window: Square,
};

function getSensorIcon(attributes: Record<string, unknown>): LucideIcon {
  const deviceClass = attributes.device_class as string | undefined;
  if (deviceClass && DEVICE_CLASS_ICONS[deviceClass]) {
    return DEVICE_CLASS_ICONS[deviceClass];
  }
  return Gauge;
}

function formatSensorValue(state: string | undefined, attributes: Record<string, unknown>): string {
  if (!state || state === 'unknown' || state === 'unavailable') return '—';
  const unit = attributes.unit_of_measurement as string | undefined;
  return unit ? `${state}${unit}` : state;
}

export function SensorCard({ entityId, name, className }: SensorCardProps) {
  const { state, attributes, loading } = useEntity(entityId);
  const displayName = name ?? (attributes.friendly_name as string) ?? entityId;
  const Icon = getSensorIcon(attributes);
  const value = formatSensorValue(state, attributes);

  if (loading) {
    return (
      <Card className={cn('animate-pulse h-[72px]', className)} padding="md">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white/5" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-white/5" />
            <div className="h-4 w-14 rounded bg-white/5" />
          </div>
        </div>
      </Card>
    );
  }

  const isUnavailable = state === 'unavailable' || state === 'unknown';

  return (
    <Card className={cn('min-h-[72px]', className)} padding="md">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            isUnavailable ? 'bg-white/5' : 'bg-accent/10',
          )}
        >
          <Icon
            size={18}
            strokeWidth={1.8}
            className={isUnavailable ? 'text-zinc-600' : 'text-accent'}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-500 truncate">{displayName}</p>
          <p
            className={cn(
              'text-lg font-semibold tabular-nums leading-tight',
              isUnavailable ? 'text-zinc-600' : 'text-zinc-100',
            )}
          >
            {value}
          </p>
        </div>
      </div>
    </Card>
  );
}
