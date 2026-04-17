'use client';

// ---------------------------------------------------------------------------
// VehicleCard — Tesla vehicle summary tile.
//
// The full VehicleControl page exposes every capability (trunk, flash, honk,
// charge limits, etc.); this card is the at-a-glance version for a dashboard.
// The `sections` descriptor field filters which rows render.
//
// The battery section is always visible by convention (matching Lovelace's
// default vehicle card); if `sections` is set, we respect it literally.
// ---------------------------------------------------------------------------

import type { VehicleCard as VehicleCardDescriptor, VehicleState } from '@ha/shared';
import { BatteryCharging, Battery, MapPin, Thermometer, Lock, Unlock, Plug } from 'lucide-react';
import { useDevice } from '@/hooks/useDevice';
import { useCommand } from '@/hooks/useCommand';
import { token, severityVar } from '@/lib/tokens';
import { withEntityBoundary } from '../EntityBoundary';

type Section = NonNullable<VehicleCardDescriptor['sections']>[number];

export function VehicleCard({ card }: { card: VehicleCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(card.entity, device, (d) => {
    if (d.type !== 'vehicle') return <div />;
    return <VehicleBody card={card} device={d} />;
  });
}

function VehicleBody({ card, device }: { card: VehicleCardDescriptor; device: VehicleState }) {
  const { send, isPending } = useCommand(device.id);
  const label = device.displayName ?? device.name;
  const sections: Section[] = card.sections ?? ['battery', 'location', 'climate', 'doors', 'charging'];
  const includes = (s: Section) => sections.includes(s);

  const batteryColor =
    device.batteryLevel <= 10 ? severityVar('critical')
      : device.batteryLevel <= 25 ? severityVar('warning')
      : severityVar('success');

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="vehicle"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background: device.sleepState === 'online' ? token('--color-success') : token('--color-bg-hover'),
            color: device.sleepState === 'online' ? '#fff' : token('--color-text-muted'),
          }}
          title={`Vehicle is ${device.sleepState}`}
        >
          {device.sleepState}
        </span>
      </div>

      {includes('battery') && (
        <div>
          <div className="flex items-center gap-2 text-xs">
            {device.chargeState === 'charging'
              ? <BatteryCharging className="h-4 w-4" style={{ color: batteryColor }} />
              : <Battery className="h-4 w-4" style={{ color: batteryColor }} />}
            <span className="tabular-nums font-medium">{device.batteryLevel}%</span>
            <span style={{ color: token('--color-text-muted') }}>· {Math.round(device.batteryRange)} mi</span>
          </div>
          <div
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: token('--color-bg-hover') }}
          >
            <div
              className="h-full"
              style={{ width: `${device.batteryLevel}%`, background: batteryColor }}
            />
          </div>
        </div>
      )}

      {includes('location') && device.latitude != null && device.longitude != null && (
        <div className="flex items-center gap-2 text-xs" style={{ color: token('--color-text-secondary') }}>
          <MapPin className="h-3.5 w-3.5" />
          <span className="tabular-nums">
            {device.latitude.toFixed(3)}, {device.longitude.toFixed(3)}
          </span>
          {device.speed != null && device.speed > 0 && (
            <span style={{ color: token('--color-text-muted') }}>· {Math.round(device.speed)} mph</span>
          )}
        </div>
      )}

      {includes('climate') && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2" style={{ color: token('--color-text-secondary') }}>
            <Thermometer className="h-3.5 w-3.5" />
            <span className="tabular-nums">
              {device.insideTemp != null ? `${cToF(device.insideTemp).toFixed(0)}°F` : '—'}
              {' inside'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => send('climate', {
              type: 'vehicle', action: device.climateOn ? 'climate_stop' : 'climate_start',
            })}
            disabled={isPending('climate')}
            className="rounded-md px-2 py-0.5 text-[11px] font-medium"
            style={{
              background: device.climateOn ? token('--color-accent') : token('--color-bg-hover'),
              color: device.climateOn ? '#fff' : token('--color-text-secondary'),
            }}
          >
            Climate {device.climateOn ? 'ON' : 'OFF'}
          </button>
        </div>
      )}

      {includes('doors') && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2" style={{ color: token('--color-text-secondary') }}>
            {device.locked
              ? <Lock className="h-3.5 w-3.5" style={{ color: token('--color-success') }} />
              : <Unlock className="h-3.5 w-3.5" style={{ color: token('--color-warning') }} />}
            <span>{device.locked ? 'Locked' : 'Unlocked'}</span>
            {device.windowsOpen && <span style={{ color: token('--color-warning') }}>· windows open</span>}
          </div>
          <button
            type="button"
            onClick={() => send('lock', {
              type: 'vehicle', action: device.locked ? 'door_unlock' : 'door_lock',
            })}
            disabled={isPending('lock')}
            className="rounded-md px-2 py-0.5 text-[11px] font-medium"
            style={{
              background: token('--color-bg-hover'),
              color: token('--color-text-secondary'),
            }}
          >
            {device.locked ? 'Unlock' : 'Lock'}
          </button>
        </div>
      )}

      {includes('charging') && device.chargeState !== 'disconnected' && (
        <div className="flex items-center gap-2 text-xs" style={{ color: token('--color-text-secondary') }}>
          <Plug className="h-3.5 w-3.5" />
          <span className="tabular-nums">
            {device.chargeState === 'charging'
              ? `+${device.chargeRate.toFixed(0)} mi/hr · ${device.chargerPower.toFixed(1)} kW`
              : device.chargeState === 'complete'
                ? 'Charge complete'
                : 'Charger stopped'}
          </span>
          {device.timeToFullCharge > 0 && (
            <span style={{ color: token('--color-text-muted') }}>
              · {device.timeToFullCharge.toFixed(1)}h to full
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}
