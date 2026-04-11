'use client';

import type { DeviceState, CameraState, RecipeLibraryState, WeatherState } from '@ha/shared';
import { LightControl } from './LightControl';
import { MediaPlayerControl } from './MediaPlayerControl';
import { VehicleControl } from './VehicleControl';
import { EnergySiteControl } from './EnergySiteControl';
import { PoolBodyControl, PoolPumpControl, PoolCircuitControl, PoolChemistryControl } from './PoolControl';
import { WeatherDisplay } from './WeatherDisplay';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';
import { sendCommand } from '@/lib/api';
import Link from 'next/link';
import { Camera, CookingPot, ExternalLink } from 'lucide-react';

function SwitchControl({ device }: { device: Extract<DeviceState, { type: 'switch' }> }) {
  const toggle = () => {
    sendCommand(device.id, { type: 'switch', action: device.on ? 'turn_off' : 'turn_on' });
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">{device.name}</span>
      <button
        onClick={toggle}
        className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
        style={{
          backgroundColor: device.on ? 'var(--color-success)' : 'var(--color-bg-hover)',
          color: device.on ? '#fff' : 'var(--color-text-secondary)',
        }}
      >
        {device.on ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

const FAN_SPEEDS = ['low', 'medium', 'medium-high', 'high'] as const;

function FanControl({ device }: { device: Extract<DeviceState, { type: 'fan' }> }) {
  const toggle = () => {
    sendCommand(device.id, {
      type: 'fan',
      action: device.on ? 'turn_off' : 'turn_on',
      ...(device.on ? {} : { speed: 'medium' }),
    });
  };

  const setSpeed = (e: React.ChangeEvent<HTMLSelectElement>) => {
    sendCommand(device.id, { type: 'fan', action: 'set_speed', speed: e.target.value });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <button
          onClick={toggle}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          style={{
            backgroundColor: device.on ? 'var(--color-success)' : 'var(--color-bg-hover)',
            color: device.on ? '#fff' : 'var(--color-text-secondary)',
          }}
        >
          {device.on ? 'ON' : 'OFF'}
        </button>
      </div>
      {device.on && (
        <div className="space-y-1">
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Speed</label>
          <select
            value={device.speed}
            onChange={setSpeed}
            className="w-full rounded-md border px-2 py-1 text-sm"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            {FAN_SPEEDS.map((s) => (
              <option key={s} value={s}>{s.replace('-', ' ')}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function CoverControl({ device }: { device: Extract<DeviceState, { type: 'cover' }> }) {
  const open = () => sendCommand(device.id, { type: 'cover', action: 'open' });
  const close = () => sendCommand(device.id, { type: 'cover', action: 'close' });
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
            className="rounded-md px-2 py-1 text-xs font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}
          >
            Open
          </button>
          <button
            onClick={close}
            className="rounded-md px-2 py-1 text-xs font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}
          >
            Close
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

export function DeviceCard({ device }: { device: DeviceState }) {
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
      return <VehicleControl device={device} />;
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
    default:
      return null;
  }
}
