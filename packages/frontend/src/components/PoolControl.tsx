'use client';

import type { PoolBodyState, PoolPumpState, PoolCircuitState, PoolChemistryState } from '@ha/shared';
import { sendCommand } from '@/lib/api';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { Badge } from '@/components/ui/Badge';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';

export function PoolBodyControl({ device }: { device: PoolBodyState }) {
  const { send, isPending } = useCommand(device.id);
  const toggle = () => send('toggle', { type: 'pool_body', action: device.on ? 'turn_off' : 'turn_on' });
  const busy = isPending('toggle');

  const setTemp = (value: number) => {
    sendCommand(device.id, { type: 'pool_body', action: 'set_setpoint', setPoint: value });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{device.name}</span>
        <div className="flex items-center gap-2">
          {device.heaterOn && <Badge variant="warning">Heating</Badge>}
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
      </div>

      {/* Current temp */}
      {device.currentTemp != null && (
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span>Water Temp</span>
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {device.currentTemp}°F
          </span>
        </div>
      )}

      {/* Setpoint */}
      {device.setPoint != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span>Heat Setpoint</span>
            <span>{device.setPoint}°F</span>
          </div>
          <ThrottledSlider
            value={device.setPoint}
            min={60}
            max={104}
            onValueCommit={setTemp}
            throttleMs={500}
          />
        </div>
      )}
    </div>
  );
}

export function PoolPumpControl({ device }: { device: PoolPumpState }) {
  const { send, isPending } = useCommand(device.id);
  const toggle = () => send('toggle', { type: 'pool_pump', action: device.on ? 'turn_off' : 'turn_on' });
  const busy = isPending('toggle');

  return (
    <div className="space-y-2">
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
        <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {device.rpm != null && <span>{device.rpm} RPM</span>}
          {device.watts != null && <span>{device.watts} W</span>}
        </div>
      )}
    </div>
  );
}

export function PoolCircuitControl({ device }: { device: PoolCircuitState }) {
  const { send, isPending } = useCommand(device.id);
  const toggle = () => send('toggle', { type: 'pool_circuit', action: device.on ? 'turn_off' : 'turn_on' });
  const busy = isPending('toggle');

  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm font-medium">{device.name}</span>
        <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {device.circuitFunction}
        </span>
      </div>
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

export function PoolChemistryControl({ device }: { device: PoolChemistryState }) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{device.name}</span>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {device.ph != null && (
          <div className="rounded-md p-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <div style={{ color: 'var(--color-text-muted)' }}>
              pH{device.phSetpoint != null && <span className="ml-1">(target: {device.phSetpoint.toFixed(1)})</span>}
            </div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {device.ph.toFixed(1)}
            </div>
          </div>
        )}
        {device.orp != null && (
          <div className="rounded-md p-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <div style={{ color: 'var(--color-text-muted)' }}>
              ORP{device.orpSetpoint != null && <span className="ml-1">(target: {device.orpSetpoint})</span>}
            </div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {device.orp} mV
            </div>
          </div>
        )}
        {device.saltPpm != null && (
          <div className="rounded-md p-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <div style={{ color: 'var(--color-text-muted)' }}>Salt</div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {device.saltPpm} ppm
            </div>
          </div>
        )}
        {device.waterTemp != null && (
          <div className="rounded-md p-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <div style={{ color: 'var(--color-text-muted)' }}>Water Temp</div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {device.waterTemp}&deg;F
            </div>
          </div>
        )}
        {device.alkalinity != null && (
          <div className="rounded-md p-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <div style={{ color: 'var(--color-text-muted)' }}>Alkalinity</div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {device.alkalinity} ppm
            </div>
          </div>
        )}
        {device.calciumHardness != null && (
          <div className="rounded-md p-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <div style={{ color: 'var(--color-text-muted)' }}>Calcium</div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {device.calciumHardness} ppm
            </div>
          </div>
        )}
        {device.cya != null && (
          <div className="rounded-md p-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <div style={{ color: 'var(--color-text-muted)' }}>CYA</div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {device.cya} ppm
            </div>
          </div>
        )}
        {device.saturationIndex != null && (
          <div className="rounded-md p-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <div style={{ color: 'var(--color-text-muted)' }}>LSI</div>
            <div className="text-sm font-medium" style={{
              color: device.saturationIndex >= -0.3 && device.saturationIndex <= 0.3
                ? 'var(--color-success)'
                : 'var(--color-warning)',
            }}>
              {device.saturationIndex.toFixed(2)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
