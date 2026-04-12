'use client';

import type { SensorState } from '@ha/shared';
import { Badge } from '@/components/ui/Badge';
import { Activity, Thermometer, Droplets, DoorOpen } from 'lucide-react';

const SENSOR_ICONS: Record<string, React.ElementType> = {
  motion: Activity,
  temperature: Thermometer,
  humidity: Droplets,
  contact: DoorOpen,
};

export function SensorDisplay({ device }: { device: SensorState }) {
  const Icon = SENSOR_ICONS[device.sensorType] ?? Activity;
  const isBoolean = typeof device.value === 'boolean';

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        <span className="text-sm font-medium">{device.name}</span>
      </div>
      {isBoolean ? (
        <Badge variant={device.value ? 'warning' : 'default'}>
          {device.sensorType === 'motion'
            ? (device.value ? 'Motion' : 'Clear')
            : (device.value ? 'Open' : 'Closed')}
        </Badge>
      ) : (
        <span className="text-sm font-medium">
          {device.value ?? '—'}{device.unit ? ` ${device.unit}` : ''}
        </span>
      )}
    </div>
  );
}
