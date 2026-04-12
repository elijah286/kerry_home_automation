'use client';

import type { EnergySiteState } from '@ha/shared';
import { sendCommand } from '@/lib/api';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';

const MODE_LABELS: Record<string, string> = {
  self_consumption: 'Self-Powered',
  backup: 'Backup Only',
  autonomous: 'Time-Based Control',
};

function formatPower(watts: number): string {
  if (Math.abs(watts) >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  return `${Math.round(watts)} W`;
}

function formatEnergy(wh: number): string {
  if (wh >= 1000) return `${(wh / 1000).toFixed(1)} kWh`;
  return `${Math.round(wh)} Wh`;
}

export function EnergySiteControl({ device }: { device: EnergySiteState }) {
  const { send, isPending } = useCommand(device.id);

  const setBackupReserve = (value: number) => {
    sendCommand(device.id, { type: 'energy_site', action: 'set_backup_reserve', backupReservePercent: value });
  };

  const setMode = (value: string) => {
    send('mode', {
      type: 'energy_site',
      action: 'set_operation_mode',
      operationMode: value as EnergySiteState['operationMode'],
    });
  };

  const toggleStormMode = () => {
    send('storm', { type: 'energy_site', action: 'set_storm_mode', stormModeEnabled: !device.stormModeEnabled });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium">{device.name}</span>
          {device.batteryCount > 0 && (
            <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
              {device.batteryCount} Powerwall{device.batteryCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {device.gridServicesActive && (
            <Badge variant="info">Grid Services</Badge>
          )}
          <Badge variant={device.gridStatus === 'connected' ? 'success' : 'warning'}>
            Grid {device.gridStatus}
          </Badge>
        </div>
      </div>

      {/* Battery */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span>Powerwall</span>
          <span>
            {device.batteryPercentage}%
            {device.totalPackEnergy > 0 && (
              <span className="ml-1">({formatEnergy(device.energyLeft)} / {formatEnergy(device.totalPackEnergy)})</span>
            )}
          </span>
        </div>
        <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-hover)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${device.batteryPercentage}%`,
              backgroundColor: device.batteryPercentage > 20 ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          />
        </div>
      </div>

      {/* Power flows */}
      <div
        className="grid grid-cols-2 gap-2 rounded-lg p-3 text-xs"
        style={{ backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <div className="space-y-0.5">
          <div style={{ color: 'var(--color-text-muted)' }}>Solar</div>
          <div className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>
            {formatPower(device.solarPower)}
          </div>
        </div>
        <div className="space-y-0.5">
          <div style={{ color: 'var(--color-text-muted)' }}>Home</div>
          <div className="text-sm font-medium">
            {formatPower(device.loadPower)}
          </div>
        </div>
        <div className="space-y-0.5">
          <div style={{ color: 'var(--color-text-muted)' }}>Battery</div>
          <div className="text-sm font-medium" style={{ color: device.batteryPower > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {device.batteryPower > 0 ? '' : '+'}{formatPower(Math.abs(device.batteryPower))}
            <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>
              {device.batteryPower > 0 ? 'discharging' : device.batteryPower < 0 ? 'charging' : 'idle'}
            </span>
          </div>
        </div>
        <div className="space-y-0.5">
          <div style={{ color: 'var(--color-text-muted)' }}>Grid</div>
          <div className="text-sm font-medium" style={{ color: device.gridPower > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {formatPower(Math.abs(device.gridPower))}
            <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>
              {device.gridPower > 0 ? 'importing' : device.gridPower < 0 ? 'exporting' : 'idle'}
            </span>
          </div>
        </div>
        {device.generatorPower !== 0 && (
          <div className="space-y-0.5">
            <div style={{ color: 'var(--color-text-muted)' }}>Generator</div>
            <div className="text-sm font-medium">{formatPower(device.generatorPower)}</div>
          </div>
        )}
        {device.gridServicesPower !== 0 && (
          <div className="space-y-0.5">
            <div style={{ color: 'var(--color-text-muted)' }}>Grid Services</div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
              {formatPower(device.gridServicesPower)}
            </div>
          </div>
        )}
      </div>

      {/* Wall Connectors */}
      {device.wallConnectors.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Wall Connectors</div>
          {device.wallConnectors.map((wc) => (
            <div
              key={wc.din}
              className="flex items-center justify-between rounded-md px-3 py-1.5 text-xs"
              style={{ backgroundColor: 'var(--color-bg-secondary)' }}
            >
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {wc.vin ? `Vehicle ...${wc.vin.slice(-4)}` : 'No vehicle'}
              </span>
              <span className="font-medium">
                {wc.power > 0 ? formatPower(wc.power) : wc.state > 0 ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Backup reserve slider */}
      <div className="space-y-1">
        <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Backup Reserve: {device.backupReservePercent}%
        </label>
        <ThrottledSlider
          value={device.backupReservePercent}
          onValueCommit={setBackupReserve}
          throttleMs={800}
        />
      </div>

      {/* Operation mode */}
      <div className="space-y-1">
        <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Operation Mode</label>
        <Select
          value={device.operationMode}
          onValueChange={setMode}
          disabled={isPending('mode')}
          options={Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label }))}
          className="w-full"
        />
      </div>

      {/* Storm mode */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Storm Watch</span>
        <button
          onClick={toggleStormMode}
          disabled={isPending('storm')}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          style={{
            backgroundColor: device.stormModeEnabled ? 'var(--color-accent)' : 'var(--color-bg-hover)',
            color: device.stormModeEnabled ? '#fff' : 'var(--color-text-secondary)',
            opacity: isPending('storm') ? 0.7 : 1,
          }}
        >
          {isPending('storm') ? <ButtonSpinner /> : device.stormModeEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}
