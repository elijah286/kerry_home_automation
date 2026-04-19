'use client';

import type {
  DeviceState, CameraState, RecipeLibraryState, WeatherState, GarageDoorState,
  SensorState, SprinklerState, VacuumState, ThermostatState,
  HelperToggleState, HelperCounterState, HelperTimerState, HelperButtonState,
  HelperNumberState, HelperTextState, HelperDateTimeState, HelperSensorState,
  NetworkDeviceState,
} from '@ha/shared';
import { LightControl } from './LightControl';
import { MediaPlayerControl } from './MediaPlayerControl';
import { VehicleControl } from './VehicleControl';
import { EnergySiteControl } from './EnergySiteControl';
import { PoolBodyControl, PoolPumpControl, PoolCircuitControl, PoolChemistryControl } from './PoolControl';
import { WeatherDisplay } from './WeatherDisplay';
import { GarageDoorControl } from './GarageDoorControl';
import { LockControl } from './LockControl';
import { SensorDisplay } from './SensorDisplay';
import { SprinklerControl } from './SprinklerControl';
import { VacuumControl } from './VacuumControl';
import { ThermostatControl } from './ThermostatControl';
import { EnergyMonitorControl } from './EnergyMonitorControl';
import { WaterSoftenerControl } from './WaterSoftenerControl';
import { ScreensaverControl } from './ScreensaverControl';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { sendCommand } from '@/lib/api';
import { useCommand } from '@/hooks/useCommand';
import { Select } from '@/components/ui/Select';
import Link from 'next/link';
import { Camera, CookingPot, ExternalLink } from 'lucide-react';

function SwitchControl({ device }: { device: Extract<DeviceState, { type: 'switch' }> }) {
  const { send, isPending } = useCommand(device.id);
  const toggle = () => send('toggle', { type: 'switch', action: device.on ? 'turn_off' : 'turn_on' });
  const busy = isPending('toggle');
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">{device.name}</span>
      <button
        onClick={toggle}
        disabled={busy}
        className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
        style={{
          backgroundColor: device.on ? 'var(--color-success)' : 'var(--color-bg-hover)',
          color: device.on ? '#fff' : 'var(--color-text-secondary)',
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? <ButtonSpinner /> : device.on ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

const FAN_SPEEDS = ['low', 'medium', 'medium-high', 'high'] as const;

function FanControl({ device }: { device: Extract<DeviceState, { type: 'fan' }> }) {
  const { send, isPending } = useCommand(device.id);
  const toggle = () => send('toggle', {
    type: 'fan',
    action: device.on ? 'turn_off' : 'turn_on',
    ...(device.on ? {} : { speed: 'medium' }),
  });
  const setSpeed = (value: string) => {
    send('speed', { type: 'fan', action: 'set_speed', speed: value });
  };
  const busy = isPending('toggle');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <button
          onClick={toggle}
          disabled={busy}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          style={{
            backgroundColor: device.on ? 'var(--color-success)' : 'var(--color-bg-hover)',
            color: device.on ? '#fff' : 'var(--color-text-secondary)',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? <ButtonSpinner /> : device.on ? 'ON' : 'OFF'}
        </button>
      </div>
      {device.on && (
        <div className="space-y-1">
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Speed</label>
          <Select
            value={device.speed}
            onValueChange={setSpeed}
            disabled={isPending('speed')}
            options={FAN_SPEEDS.map((s) => ({ value: s, label: s.replace('-', ' ') }))}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}

function CoverControl({ device }: { device: Extract<DeviceState, { type: 'cover' }> }) {
  const { send, isPending } = useCommand(device.id);
  const open = () => send('open', { type: 'cover', action: 'open' });
  const close = () => send('close', { type: 'cover', action: 'close' });
  const setPosition = (value: number) => {
    sendCommand(device.id, { type: 'cover', action: 'set_position', position: value });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <div className="flex gap-1">
          <button
            onClick={open}
            disabled={isPending('open')}
            className="rounded-md px-2 py-1 text-xs font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', opacity: isPending('open') ? 0.7 : 1 }}
          >
            {isPending('open') ? <ButtonSpinner /> : 'Open'}
          </button>
          <button
            onClick={close}
            disabled={isPending('close')}
            className="rounded-md px-2 py-1 text-xs font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', opacity: isPending('close') ? 0.7 : 1 }}
          >
            {isPending('close') ? <ButtonSpinner /> : 'Close'}
          </button>
        </div>
      </div>
      <ThrottledSlider
        value={device.position}
        onValueCommit={setPosition}
        throttleMs={500}
      />
      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {device.position}% open
      </div>
    </div>
  );
}

function CameraControl({ device }: { device: CameraState }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <span
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: device.online ? 'var(--color-success)' : 'var(--color-danger)' }}
        >
          <Camera className="h-3.5 w-3.5" />
          {device.online ? 'Online' : 'Offline'}
        </span>
      </div>
      <Link
        href="/cameras"
        className="flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
        style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}
      >
        View Camera Feed <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

function RecipeLibraryControl({ device }: { device: RecipeLibraryState }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <CookingPot className="h-3.5 w-3.5" />
          {device.recipeCount} recipes
        </span>
      </div>
      {device.lastSync && (
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Last synced: {new Date(device.lastSync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      )}
      <Link
        href="/recipes"
        className="flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
        style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}
      >
        View Recipes <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

// -- Helper Controls ----------------------------------------------------------

function HelperToggleControl({ device }: { device: HelperToggleState }) {
  const { send, isPending } = useCommand(device.id);
  const toggle = () => send('toggle', { type: 'helper_toggle', action: 'toggle' });
  const busy = isPending('toggle');
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">{device.displayName || device.name}</span>
      <button onClick={toggle} disabled={busy} className="rounded-md px-3 py-1 text-xs font-medium transition-colors" style={{ backgroundColor: device.on ? 'var(--color-success)' : 'var(--color-bg-hover)', color: device.on ? '#fff' : 'var(--color-text-secondary)', opacity: busy ? 0.7 : 1 }}>
        {busy ? <ButtonSpinner /> : device.on ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

function HelperCounterControl({ device }: { device: HelperCounterState }) {
  const { send, isPending } = useCommand(device.id);
  const inc = () => send('inc', { type: 'helper_counter', action: 'increment' });
  const dec = () => send('dec', { type: 'helper_counter', action: 'decrement' });
  const reset = () => send('reset', { type: 'helper_counter', action: 'reset' });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.displayName || device.name}</span>
        <span className="text-lg font-bold" style={{ color: 'var(--color-accent)' }}>{device.value}</span>
      </div>
      <div className="flex gap-1.5">
        <button onClick={dec} disabled={isPending('dec')} className="flex-1 rounded-md px-2 py-1 text-xs border" style={{ borderColor: 'var(--color-border)' }}>
          {isPending('dec') ? <ButtonSpinner /> : '−'}
        </button>
        <button onClick={reset} disabled={isPending('reset')} className="flex-1 rounded-md px-2 py-1 text-xs border" style={{ borderColor: 'var(--color-border)' }}>
          {isPending('reset') ? <ButtonSpinner /> : 'Reset'}
        </button>
        <button onClick={inc} disabled={isPending('inc')} className="flex-1 rounded-md px-2 py-1 text-xs border" style={{ borderColor: 'var(--color-border)' }}>
          {isPending('inc') ? <ButtonSpinner /> : '+'}
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function HelperTimerControl({ device }: { device: HelperTimerState }) {
  const { send, isPending } = useCommand(device.id);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.displayName || device.name}</span>
        <div className="text-right">
          <span className="text-lg font-mono font-bold" style={{ color: device.status === 'active' ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
            {formatTime(device.remaining)}
          </span>
          <div className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>{device.status}</div>
        </div>
      </div>
      <div className="flex gap-1.5">
        {device.status === 'idle' && (
          <button onClick={() => send('start', { type: 'helper_timer', action: 'start' })} disabled={isPending('start')} className="flex-1 rounded-md px-2 py-1 text-xs text-white" style={{ backgroundColor: 'var(--color-success)' }}>
            {isPending('start') ? <ButtonSpinner /> : 'Start'}
          </button>
        )}
        {device.status === 'active' && (
          <>
            <button onClick={() => send('pause', { type: 'helper_timer', action: 'pause' })} disabled={isPending('pause')} className="flex-1 rounded-md px-2 py-1 text-xs border" style={{ borderColor: 'var(--color-border)' }}>
              {isPending('pause') ? <ButtonSpinner /> : 'Pause'}
            </button>
            <button onClick={() => send('cancel', { type: 'helper_timer', action: 'cancel' })} disabled={isPending('cancel')} className="flex-1 rounded-md px-2 py-1 text-xs border" style={{ borderColor: 'var(--color-border)' }}>
              {isPending('cancel') ? <ButtonSpinner /> : 'Cancel'}
            </button>
          </>
        )}
        {device.status === 'paused' && (
          <>
            <button onClick={() => send('start', { type: 'helper_timer', action: 'start' })} disabled={isPending('start')} className="flex-1 rounded-md px-2 py-1 text-xs text-white" style={{ backgroundColor: 'var(--color-success)' }}>
              {isPending('start') ? <ButtonSpinner /> : 'Resume'}
            </button>
            <button onClick={() => send('cancel', { type: 'helper_timer', action: 'cancel' })} disabled={isPending('cancel')} className="flex-1 rounded-md px-2 py-1 text-xs border" style={{ borderColor: 'var(--color-border)' }}>
              {isPending('cancel') ? <ButtonSpinner /> : 'Cancel'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function HelperButtonControl({ device }: { device: HelperButtonState }) {
  const { send, isPending } = useCommand(device.id);
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm font-medium">{device.displayName || device.name}</span>
        {device.lastPressed && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Last pressed: {new Date(device.lastPressed).toLocaleTimeString()}
          </p>
        )}
      </div>
      <button onClick={() => send('press', { type: 'helper_button', action: 'press' })} disabled={isPending('press')} className="rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: 'var(--color-accent)' }}>
        {isPending('press') ? <ButtonSpinner /> : 'Press'}
      </button>
    </div>
  );
}

function HelperNumberControl({ device }: { device: HelperNumberState }) {
  const { send } = useCommand(device.id);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.displayName || device.name}</span>
        <span className="text-sm font-bold">{device.value}{device.unit ? ` ${device.unit}` : ''}</span>
      </div>
      {device.mode === 'slider' ? (
        <ThrottledSlider min={device.min} max={device.max} step={device.step} value={device.value} onValueCommit={(v: number) => send('set', { type: 'helper_number', action: 'set', value: v })} />
      ) : (
        <input type="number" value={device.value} min={device.min} max={device.max} step={device.step} onChange={(e) => send('set', { type: 'helper_number', action: 'set', value: Number(e.target.value) })} className="w-full px-2 py-1 text-sm rounded border" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }} />
      )}
    </div>
  );
}

function HelperTextControl({ device }: { device: HelperTextState }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">{device.displayName || device.name}</span>
      <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{device.value || '(empty)'}</span>
    </div>
  );
}

function HelperDateTimeControl({ device }: { device: HelperDateTimeState }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">{device.displayName || device.name}</span>
      <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{device.value || '(not set)'}</span>
    </div>
  );
}

function NetworkDeviceControl({ device }: { device: NetworkDeviceState }) {
  const { send, isPending } = useCommand(device.id);
  const canBlock = device.deviceType === 'client';
  if (!canBlock) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{device.displayName || device.name}</span>
          <span className="text-xs" style={{ color: device.connected ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
            {device.connected ? 'Online' : 'Offline'}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {device.deviceType.toUpperCase()}
          {device.model ? ` · ${device.model}` : ''}
          {device.ip ? ` · ${device.ip}` : ''}
          {device.mac ? ` · ${device.mac}` : ''}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.displayName || device.name}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Client</span>
      </div>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {device.ip ?? 'No IP'}
        {device.mac ? ` · ${device.mac}` : ''}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => send('block', { type: 'network_device', action: 'block_network_access' })}
          disabled={isPending('block')}
          className="rounded-md px-3 py-1 text-xs font-medium border"
          style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
        >
          {isPending('block') ? <ButtonSpinner /> : 'Block access'}
        </button>
        <button
          type="button"
          onClick={() => send('unblock', { type: 'network_device', action: 'unblock_network_access' })}
          disabled={isPending('unblock')}
          className="rounded-md px-3 py-1 text-xs font-medium border"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {isPending('unblock') ? <ButtonSpinner /> : 'Allow access'}
        </button>
      </div>
    </div>
  );
}

function HelperSensorControl({ device }: { device: HelperSensorState }) {
  const displayValue = typeof device.value === 'boolean'
    ? (device.value ? 'On' : 'Off')
    : device.value !== null ? String(device.value) : 'N/A';
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm font-medium">{device.displayName || device.name}</span>
        <p className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>{device.helperKind.replace('_', ' ')}</p>
      </div>
      <span className="text-lg font-bold" style={{ color: 'var(--color-accent)' }}>
        {displayValue}{device.unit ? ` ${device.unit}` : ''}
      </span>
    </div>
  );
}

export function DeviceCard({
  device,
  variant = 'default',
}: {
  device: DeviceState;
  /** `detail` — e.g. Tesla: expand telemetry on the device detail page. */
  variant?: 'default' | 'detail';
}) {
  switch (device.type) {
    case 'light':
      return <LightControl device={device} />;
    case 'switch':
      return <SwitchControl device={device} />;
    case 'fan':
      return <FanControl device={device} />;
    case 'cover':
      return <CoverControl device={device} />;
    case 'media_player':
      return <MediaPlayerControl device={device} />;
    case 'vehicle':
      return <VehicleControl device={device} detailMode={variant === 'detail'} />;
    case 'energy_site':
      return <EnergySiteControl device={device} />;
    case 'pool_body':
      return <PoolBodyControl device={device} />;
    case 'pool_pump':
      return <PoolPumpControl device={device} />;
    case 'pool_circuit':
      return <PoolCircuitControl device={device} />;
    case 'pool_chemistry':
      return <PoolChemistryControl device={device} />;
    case 'camera':
      return <CameraControl device={device} />;
    case 'recipe_library':
      return <RecipeLibraryControl device={device} />;
    case 'weather':
      return <WeatherDisplay device={device} />;
    case 'garage_door':
      return <GarageDoorControl device={device} />;
    case 'lock':
      return <LockControl device={device} />;
    case 'sensor':
      return <SensorDisplay device={device} />;
    case 'sprinkler':
      return <SprinklerControl device={device} />;
    case 'vacuum':
      return <VacuumControl device={device} />;
    case 'thermostat':
      return <ThermostatControl device={device as ThermostatState} />;
    case 'energy_monitor':
      return <EnergyMonitorControl device={device} />;
    case 'water_softener':
      return <WaterSoftenerControl device={device} />;
    case 'screensaver':
      return <ScreensaverControl device={device} />;
    case 'helper_toggle':
      return <HelperToggleControl device={device} />;
    case 'helper_counter':
      return <HelperCounterControl device={device} />;
    case 'helper_timer':
      return <HelperTimerControl device={device} />;
    case 'helper_button':
      return <HelperButtonControl device={device} />;
    case 'helper_number':
      return <HelperNumberControl device={device} />;
    case 'helper_text':
      return <HelperTextControl device={device} />;
    case 'helper_datetime':
      return <HelperDateTimeControl device={device} />;
    case 'helper_sensor':
      return <HelperSensorControl device={device} />;
    case 'network_device':
      return <NetworkDeviceControl device={device} />;
    default:
      return null;
  }
}
