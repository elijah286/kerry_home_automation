'use client';

import type { VehicleState } from '@ha/shared';
import { sendCommand } from '@/lib/api';
import { useCommand } from '@/hooks/useCommand';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';
import { Badge } from '@/components/ui/Badge';

export function VehicleControl({
  device,
  detailMode = false,
}: {
  device: VehicleState;
  /** When true (device detail page), telemetry list is expanded and taller. */
  detailMode?: boolean;
}) {
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
          <span>
            {device.batteryLevel}%
            {device.usableBatteryLevel != null && device.usableBatteryLevel !== device.batteryLevel && (
              <> (usable {device.usableBatteryLevel}%)</>
            )}
            {' '}&middot; {device.batteryRange} mi
          </span>
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
      {(device.insideTemp != null || device.outsideTemp != null || device.guiTempUnits || device.guiDistanceUnits) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {device.insideTemp != null && <span>Inside: {device.insideTemp.toFixed(1)}&deg;C</span>}
          {device.outsideTemp != null && <span>Outside: {device.outsideTemp.toFixed(1)}&deg;C</span>}
          {(device.guiTempUnits || device.guiDistanceUnits) && (
            <span className="opacity-80">
              [{[device.guiTempUnits, device.guiDistanceUnits].filter(Boolean).join(' · ')}]
            </span>
          )}
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
        {/* Charging details */}
        {device.chargeState === 'charging' && (
          <div
            className="grid grid-cols-2 gap-2 rounded-md p-2 text-xs"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            {device.chargerPower > 0 && (
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>Power: </span>
                <span className="font-medium">{device.chargerPower} kW</span>
              </div>
            )}
            {device.chargerVoltage != null && device.chargerVoltage > 0 && (
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>Voltage: </span>
                <span className="font-medium">{device.chargerVoltage} V</span>
              </div>
            )}
            {device.chargerActualCurrent != null && device.chargerActualCurrent > 0 && (
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>Current: </span>
                <span className="font-medium">{device.chargerActualCurrent} A</span>
              </div>
            )}
            {device.chargeEnergyAdded > 0 && (
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>Added: </span>
                <span className="font-medium">{device.chargeEnergyAdded.toFixed(1)} kWh</span>
              </div>
            )}
            {device.timeToFullCharge > 0 && (
              <div className="col-span-2">
                <span style={{ color: 'var(--color-text-muted)' }}>Time to full: </span>
                <span className="font-medium">
                  {device.timeToFullCharge >= 1
                    ? `${Math.floor(device.timeToFullCharge)}h ${Math.round((device.timeToFullCharge % 1) * 60)}m`
                    : `${Math.round(device.timeToFullCharge * 60)}m`}
                </span>
              </div>
            )}
          </div>
        )}
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

      {/* Driving status */}
      {device.shiftState && (device.shiftState === 'D' || device.shiftState === 'R') && (
        <div
          className="rounded-md p-2 text-xs"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium" style={{ color: 'var(--color-accent)' }}>
              {device.shiftState === 'D' ? 'Driving' : 'Reversing'}
            </span>
            {device.speed != null && (
              <span className="font-medium">{device.speed} mph</span>
            )}
          </div>
          {device.power != null && (
            <div style={{ color: 'var(--color-text-muted)' }}>
              Power: {device.power > 0 ? `${device.power} kW` : `${Math.abs(device.power)} kW regen`}
            </div>
          )}
          {device.heading != null && (
            <div style={{ color: 'var(--color-text-muted)' }}>
              Heading: {device.heading}&deg;
            </div>
          )}
        </div>
      )}

      {/* Location */}
      {device.latitude != null && device.longitude != null && (
        <div className="text-xs space-y-0.5" style={{ color: 'var(--color-text-muted)' }}>
          <div>
            Location: {device.latitude.toFixed(5)}, {device.longitude.toFixed(5)}
          </div>
          {device.locationUpdatedAt != null && (
            <div className="opacity-80">
              GPS sample: {new Date(device.locationUpdatedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Full vehicle_data primitives — charge.climate.drive.vehicle.gui.location.config */}
      {device.vehicleTelemetry && Object.keys(device.vehicleTelemetry).length > 0 && (
        <details open={detailMode} className="rounded-md border text-xs" style={{ borderColor: 'var(--color-border)' }}>
          <summary className="cursor-pointer px-2 py-1.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            All API sensors ({Object.keys(device.vehicleTelemetry).length})
          </summary>
          <div
            className={`${detailMode ? 'max-h-[min(50vh,480px)]' : 'max-h-48'} overflow-y-auto px-2 pb-2 font-mono space-y-0.5 border-t`}
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            {Object.entries(device.vehicleTelemetry)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => (
                <div key={k} className="break-all">
                  <span className="opacity-70">{k}</span>
                  <span className="mx-1">=</span>
                  <span>{v === null ? 'null' : String(v)}</span>
                </div>
              ))}
          </div>
        </details>
      )}

      {/* Info row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {device.sentryMode && <span>Sentry ON</span>}
        {device.isUserPresent && <span>User present</span>}
        {device.windowsOpen && <span>Windows open</span>}
        {device.chargePortOpen && <span>Charge port open</span>}
        {device.seatHeaterLeft > 0 && <span>Seat heater L:{device.seatHeaterLeft}</span>}
        {device.seatHeaterRight > 0 && <span>Seat heater R:{device.seatHeaterRight}</span>}
        {device.steeringWheelHeater && <span>Steering heater ON</span>}
        {device.odometer > 0 && <span>{device.odometer.toLocaleString()} mi</span>}
        {device.softwareVersion && <span>v{device.softwareVersion}</span>}
      </div>
    </div>
  );
}
