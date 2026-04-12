'use client';

import type { VehicleState } from '@ha/shared';
import { sendCommand } from '@/lib/api';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';
import { Badge } from '@/components/ui/Badge';

export function VehicleControl({ device }: { device: VehicleState }) {
  const { send, isPending } = useCommand(device.id);
  const lock = () => send('lock', { type: 'vehicle', action: device.locked ? 'door_unlock' : 'door_lock' });
  const climate = () => send('climate', { type: 'vehicle', action: device.climateOn ? 'climate_stop' : 'climate_start' });
  const charge = () => send('charge', {
    type: 'vehicle',
    action: device.chargeState === 'charging' ? 'charge_stop' : 'charge_start',
  });
  const setChargeLimit = (value: number) => sendCommand(device.id, { type: 'vehicle', action: 'set_charge_limit', chargeLimit: value });
  const trunk = (which: 'rear' | 'front') => send(`trunk_${which}`, { type: 'vehicle', action: 'actuate_trunk', trunk: which });
  const flash = () => send('flash', { type: 'vehicle', action: 'flash_lights' });
  const honk = () => send('honk', { type: 'vehicle', action: 'honk_horn' });

  const asleep = device.sleepState !== 'online';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <Badge variant={asleep ? 'default' : 'success'}>
          {device.sleepState}
        </Badge>
      </div>

      {/* Battery */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span>Battery</span>
          <span>{device.batteryLevel}% &middot; {device.batteryRange} mi</span>
        </div>
        <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-hover)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${device.batteryLevel}%`,
              backgroundColor: device.batteryLevel > 20 ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          />
        </div>
      </div>

      {/* Lock & Climate row */}
      <div className="flex gap-2">
        <button
          onClick={lock}
          disabled={asleep || isPending('lock')}
          className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: device.locked ? 'var(--color-success)' : 'var(--color-danger)',
            color: '#fff',
            opacity: asleep || isPending('lock') ? 0.5 : 1,
          }}
        >
          {isPending('lock') ? <ButtonSpinner /> : device.locked ? 'Locked' : 'Unlocked'}
        </button>
        <button
          onClick={climate}
          disabled={asleep || isPending('climate')}
          className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: device.climateOn ? 'var(--color-accent)' : 'var(--color-bg-hover)',
            color: device.climateOn ? '#fff' : 'var(--color-text-secondary)',
            opacity: asleep || isPending('climate') ? 0.5 : 1,
          }}
        >
          {isPending('climate') ? <ButtonSpinner /> : `Climate ${device.climateOn ? 'ON' : 'OFF'}`}
        </button>
      </div>

      {/* Temps */}
      {device.insideTemp != null && (
        <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span>Inside: {device.insideTemp.toFixed(1)}&deg;C</span>
          {device.outsideTemp != null && <span>Outside: {device.outsideTemp.toFixed(1)}&deg;C</span>}
        </div>
      )}

      {/* Charging */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Charge: {device.chargeState}
            {device.chargeState === 'charging' && ` (${device.chargeRate} mi/hr)`}
          </span>
          {device.chargeState !== 'disconnected' && (
            <button
              onClick={charge}
              disabled={asleep || isPending('charge')}
              className="rounded-md px-2 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: device.chargeState === 'charging' ? 'var(--color-danger)' : 'var(--color-success)',
                color: '#fff',
                opacity: asleep || isPending('charge') ? 0.5 : 1,
              }}
            >
              {isPending('charge') ? <ButtonSpinner /> : device.chargeState === 'charging' ? 'Stop' : 'Start'}
            </button>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Charge limit: {device.chargeLimitSoc}%
          </label>
          <ThrottledSlider
            value={device.chargeLimitSoc}
            onValueCommit={setChargeLimit}
            throttleMs={800}
            min={50}
            max={100}
          />
        </div>
      </div>

      {/* Trunk buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => trunk('front')}
          disabled={asleep || isPending('trunk_front')}
          className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: device.frunkOpen ? 'var(--color-warning)' : 'var(--color-bg-hover)',
            color: device.frunkOpen ? '#fff' : 'var(--color-text-secondary)',
            opacity: asleep || isPending('trunk_front') ? 0.5 : 1,
          }}
        >
          {isPending('trunk_front') ? <ButtonSpinner /> : `Frunk ${device.frunkOpen ? '(Open)' : ''}`}
        </button>
        <button
          onClick={() => trunk('rear')}
          disabled={asleep || isPending('trunk_rear')}
          className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: device.trunkOpen ? 'var(--color-warning)' : 'var(--color-bg-hover)',
            color: device.trunkOpen ? '#fff' : 'var(--color-text-secondary)',
            opacity: asleep || isPending('trunk_rear') ? 0.5 : 1,
          }}
        >
          {isPending('trunk_rear') ? <ButtonSpinner /> : `Trunk ${device.trunkOpen ? '(Open)' : ''}`}
        </button>
      </div>

      {/* Utility buttons */}
      <div className="flex gap-2">
        <button
          onClick={flash}
          disabled={asleep || isPending('flash')}
          className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: 'var(--color-bg-hover)',
            color: 'var(--color-text-secondary)',
            opacity: asleep || isPending('flash') ? 0.5 : 1,
          }}
        >
          {isPending('flash') ? <ButtonSpinner /> : 'Flash Lights'}
        </button>
        <button
          onClick={honk}
          disabled={asleep || isPending('honk')}
          className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: 'var(--color-bg-hover)',
            color: 'var(--color-text-secondary)',
            opacity: asleep || isPending('honk') ? 0.5 : 1,
          }}
        >
          {isPending('honk') ? <ButtonSpinner /> : 'Honk Horn'}
        </button>
      </div>

      {/* Info row */}
      <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {device.sentryMode && <span>Sentry ON</span>}
        {device.odometer > 0 && <span>{device.odometer.toLocaleString()} mi</span>}
        {device.softwareVersion && <span>v{device.softwareVersion}</span>}
      </div>
    </div>
  );
}
