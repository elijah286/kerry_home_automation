'use client';

import { ecobeeSelectablePresetKeys, type ThermostatMode, type ThermostatState } from '@ha/shared';
import { ThrottledSlider } from '@/components/ui/ThrottledSlider';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { Select } from '@/components/ui/Select';
import { useCommand } from '@/hooks/useCommand';
import { useState } from 'react';

const PRESET_UNSET = '__preset_unset__';

const HVAC_OPTIONS: { value: ThermostatMode; label: string }[] = [
  { value: 'heat', label: 'Heat' },
  { value: 'cool', label: 'Cool' },
  { value: 'auto', label: 'Auto' },
  { value: 'off', label: 'Off' },
  { value: 'auxHeatOnly', label: 'Aux heat only' },
];

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        {children}
      </span>
    </div>
  );
}

export function ThermostatControl({ device }: { device: ThermostatState }) {
  const { send, isPending } = useCommand(device.id);
  const e = device.ecobee;
  const [vacName, setVacName] = useState('');
  const [vacCool, setVacCool] = useState(78);
  const [vacHeat, setVacHeat] = useState(66);
  const [climateForSensors, setClimateForSensors] = useState(() => e?.climates[0]?.name ?? '');
  const [sensorPick, setSensorPick] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const s of device.sensors) m[s.id] = e?.activeSensorNames.includes(s.name) ?? false;
    return m;
  });

  const presetKeys = e ? ecobeeSelectablePresetKeys(e.climates) : [];
  const presetOptions: { value: string; label: string }[] = [
    ...presetKeys.map((k) => ({ value: k, label: k.replace(/_/g, ' ') })),
    { value: 'temp', label: 'Temperature hold' },
    { value: 'none', label: 'Resume schedule' },
  ];
  if (e?.presetMode && !presetOptions.some((o) => o.value === e.presetMode)) {
    presetOptions.unshift({ value: e.presetMode, label: e.presetMode });
  }

  const outdoor = e?.outdoor;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Detail label="Indoor temp">{device.temperature != null ? `${device.temperature.toFixed(1)}°F` : '—'}</Detail>
        <Detail label="Humidity">{device.humidity != null ? `${device.humidity}%` : '—'}</Detail>
        <Detail label="HVAC action">{device.hvacAction}</Detail>
        <Detail label="Fan">{e?.fanRunning ? 'On' : 'Off'} (set: {device.fanMode})</Detail>
        <Detail label="Climate mode">{e?.climateMode ?? '—'}</Detail>
        <Detail label="Preset">{e?.presetMode ?? '—'}</Detail>
        <Detail label="Fan min / hour">{e != null ? `${e.fanMinOnTime} min` : '—'}</Detail>
        <Detail label="Heat–cool min Δ">{e != null ? `${e.heatCoolMinDelta}°F` : '—'}</Detail>
        <Detail label="Equipment">{e?.equipmentRunning || '—'}</Detail>
      </div>

      {outdoor && (
        <div
          className="rounded-lg p-3 space-y-1 text-sm"
          style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="font-medium text-xs" style={{ color: 'var(--color-text-secondary)' }}>Outdoor (Ecobee)</div>
          <div style={{ color: 'var(--color-text-muted)' }}>
            {outdoor.temperatureF != null && <span>{outdoor.temperatureF.toFixed(1)}°F </span>}
            {outdoor.condition && <span>· {outdoor.condition} </span>}
            {outdoor.highF != null && outdoor.lowF != null && (
              <span>
                · H {outdoor.highF.toFixed(0)} / L {outdoor.lowF.toFixed(0)}
              </span>
            )}
          </div>
          {(outdoor.station || outdoor.timestamp) && (
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {outdoor.station && <span>{outdoor.station} </span>}
              {outdoor.timestamp && <span>· {outdoor.timestamp}</span>}
            </div>
          )}
        </div>
      )}

      {device.sensors.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Sensors</div>
          <div className="space-y-1.5">
            {device.sensors.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs rounded px-2 py-1.5"
                style={{ backgroundColor: 'var(--color-bg-hover)' }}
              >
                <span className="font-medium">{s.name}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>{s.sensorType}</span>
                {s.temperature != null && <span>{s.temperature.toFixed(1)}°F</span>}
                {s.humidity != null && <span>{s.humidity}% RH</span>}
                {s.occupancy && <span style={{ color: 'var(--color-accent)' }}>Occupied</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {e && e.activeSensorNames.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            Active for current preset
          </div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {e.activeSensorNames.join(', ')}
          </div>
        </div>
      )}

      <div className="space-y-3 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Controls</div>

        <div className="space-y-1">
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>HVAC mode</label>
          <Select
            value={device.hvacMode}
            disabled={isPending('hvac')}
            onValueChange={(v) => send('hvac', { type: 'thermostat', action: 'set_hvac_mode', hvacMode: v as ThermostatMode })}
            options={HVAC_OPTIONS}
            className="w-full"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Fan mode</label>
          <div className="flex gap-2">
            {(['auto', 'on'] as const).map((fm) => (
              <button
                key={fm}
                type="button"
                disabled={isPending('fan')}
                onClick={() => send('fan', { type: 'thermostat', action: 'set_fan_mode', fanMode: fm })}
                className="rounded-md px-3 py-1 text-xs font-medium capitalize"
                style={{
                  backgroundColor: device.fanMode === fm ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                  color: device.fanMode === fm ? '#fff' : 'var(--color-text-secondary)',
                }}
              >
                {isPending('fan') ? <ButtonSpinner /> : fm}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Heat setpoint °F</label>
            <ThrottledSlider
              value={device.heatSetpoint}
              min={45}
              max={85}
              step={0.5}
              throttleMs={400}
              onValueCommit={(v) =>
                send('heat', { type: 'thermostat', action: 'set_heat_setpoint', temperature: v })
              }
            />
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{device.heatSetpoint.toFixed(1)}°F</div>
          </div>
          <div className="space-y-1">
            <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Cool setpoint °F</label>
            <ThrottledSlider
              value={device.coolSetpoint}
              min={45}
              max={95}
              step={0.5}
              throttleMs={400}
              onValueCommit={(v) =>
                send('cool', { type: 'thermostat', action: 'set_cool_setpoint', temperature: v })
              }
            />
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{device.coolSetpoint.toFixed(1)}°F</div>
          </div>
        </div>

        {e && (
          <>
            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Comfort preset</label>
              <Select
                value={e.presetMode ?? PRESET_UNSET}
                disabled={isPending('preset')}
                onValueChange={(v) => {
                  if (v === PRESET_UNSET) return;
                  send('preset', { type: 'thermostat', action: 'set_preset_mode', presetMode: v });
                }}
                options={[{ value: PRESET_UNSET, label: 'Apply preset…' }, ...presetOptions]}
                className="w-full"
                size="xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Fan min on time (min/hr)</label>
              <ThrottledSlider
                value={e.fanMinOnTime}
                min={0}
                max={60}
                step={1}
                throttleMs={500}
                onValueCommit={(v) =>
                  send('fanMin', { type: 'thermostat', action: 'set_fan_min_on_time', fanMinOnTime: Math.round(v) })
                }
              />
            </div>

            {e.hasHumidifierControl && (
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Target humidity %</label>
                <ThrottledSlider
                  value={e.targetHumidity ?? 35}
                  min={15}
                  max={50}
                  step={1}
                  throttleMs={500}
                  onValueCommit={(v) =>
                    send('hum', { type: 'thermostat', action: 'set_target_humidity', targetHumidity: Math.round(v) })
                  }
                />
              </div>
            )}

            {e.vacationName && (
              <button
                type="button"
                disabled={isPending('delVac')}
                onClick={() =>
                  send('delVac', {
                    type: 'thermostat',
                    action: 'delete_vacation',
                    vacationName: e.vacationName!,
                  })
                }
                className="rounded-md px-3 py-1.5 text-xs font-medium"
                style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}
              >
                {isPending('delVac') ? <ButtonSpinner /> : `End vacation: ${e.vacationName}`}
              </button>
            )}

            <div className="space-y-2 rounded-lg p-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
              <div className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Create vacation</div>
              <input
                className="w-full rounded border px-2 py-1 text-xs bg-transparent"
                style={{ borderColor: 'var(--color-border)' }}
                placeholder="Name (max 12 chars)"
                value={vacName}
                onChange={(ev) => setVacName(ev.target.value.slice(0, 12))}
              />
              <div className="flex gap-2">
                <label className="text-xs flex flex-col gap-1">
                  Cool °F
                  <input
                    type="number"
                    className="w-20 rounded border px-1 py-0.5 text-xs bg-transparent"
                    style={{ borderColor: 'var(--color-border)' }}
                    value={vacCool}
                    onChange={(ev) => setVacCool(Number(ev.target.value))}
                  />
                </label>
                <label className="text-xs flex flex-col gap-1">
                  Heat °F
                  <input
                    type="number"
                    className="w-20 rounded border px-1 py-0.5 text-xs bg-transparent"
                    style={{ borderColor: 'var(--color-border)' }}
                    value={vacHeat}
                    onChange={(ev) => setVacHeat(Number(ev.target.value))}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={isPending('vac') || !vacName.trim()}
                onClick={() =>
                  send('vac', {
                    type: 'thermostat',
                    action: 'create_vacation',
                    vacation: { name: vacName.trim(), coolTempF: vacCool, heatTempF: vacHeat },
                  })
                }
                className="rounded-md px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: 'var(--color-bg-hover)' }}
              >
                {isPending('vac') ? <ButtonSpinner /> : 'Create vacation'}
              </button>
            </div>

            {e.ventilatorType !== 'none' && (
              <div className="space-y-2">
                <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Ventilator</div>
                <button
                  type="button"
                  disabled={isPending('ventT')}
                  onClick={() =>
                    send('ventT', {
                      type: 'thermostat',
                      action: 'set_ventilator_timer',
                      ventilatorOn: !e.ventilatorTimerOn,
                    })
                  }
                  className="rounded-md px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: 'var(--color-bg-hover)' }}
                >
                  {isPending('ventT') ? <ButtonSpinner /> : e.ventilatorTimerOn ? 'Stop 20m timer' : 'Start 20m timer'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Min home (min/hr)</label>
                    <ThrottledSlider
                      value={e.ventilatorMinOnTimeHome}
                      min={0}
                      max={60}
                      step={5}
                      throttleMs={500}
                      onValueCommit={(v) =>
                        send('ventH', {
                          type: 'thermostat',
                          action: 'set_ventilator_min_home',
                          ventilatorMinHome: Math.round(v),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Min away (min/hr)</label>
                    <ThrottledSlider
                      value={e.ventilatorMinOnTimeAway}
                      min={0}
                      max={60}
                      step={5}
                      throttleMs={500}
                      onValueCommit={(v) =>
                        send('ventA', {
                          type: 'thermostat',
                          action: 'set_ventilator_min_away',
                          ventilatorMinAway: Math.round(v),
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {e.hasHeatPump && (
              <div className="space-y-2">
                <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Heat pump</div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={device.hvacMode === 'auxHeatOnly'}
                    disabled={isPending('aux')}
                    onChange={(ev) =>
                      send('aux', {
                        type: 'thermostat',
                        action: 'set_aux_heat_only',
                        auxHeatOnly: ev.target.checked,
                      })
                    }
                  />
                  Auxiliary heat only
                </label>
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Compressor min outdoor °F
                  </label>
                  <ThrottledSlider
                    value={e.compressorProtectionMinTempF ?? 35}
                    min={-25}
                    max={66}
                    step={5}
                    throttleMs={500}
                    onValueCommit={(v) =>
                      send('comp', {
                        type: 'thermostat',
                        action: 'set_compressor_min_temp',
                        compressorMinTempF: Math.round(v),
                      })
                    }
                  />
                </div>
              </div>
            )}

            {e.dstEnabled != null && (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={e.dstEnabled}
                  disabled={isPending('dst')}
                  onChange={(ev) =>
                    send('dst', { type: 'thermostat', action: 'set_dst_mode', dstEnabled: ev.target.checked })
                  }
                />
                Daylight saving on thermostat
              </label>
            )}

            {e.micEnabled != null && (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={e.micEnabled}
                  disabled={isPending('mic')}
                  onChange={(ev) =>
                    send('mic', { type: 'thermostat', action: 'set_mic_mode', micEnabled: ev.target.checked })
                  }
                />
                Alexa microphone
              </label>
            )}

            {(e.autoAwayEnabled != null || e.followMeEnabled != null) && (
              <div className="space-y-1">
                <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Occupancy</div>
                {e.autoAwayEnabled != null && (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={e.autoAwayEnabled}
                      disabled={isPending('occ')}
                      onChange={(ev) =>
                        send('occ', { type: 'thermostat', action: 'set_occupancy_modes', autoAway: ev.target.checked })
                      }
                    />
                    Smart Home/Away
                  </label>
                )}
                {e.followMeEnabled != null && (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={e.followMeEnabled}
                      disabled={isPending('occ')}
                      onChange={(ev) =>
                        send('occ2', { type: 'thermostat', action: 'set_occupancy_modes', followMe: ev.target.checked })
                      }
                    />
                    Follow Me
                  </label>
                )}
              </div>
            )}

            {e.climates.length > 0 && device.sensors.length > 0 && (
              <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Sensors per comfort setting
                </div>
                <Select
                  value={climateForSensors}
                  onValueChange={setClimateForSensors}
                  options={e.climates.map((c) => ({ value: c.name, label: c.name }))}
                  className="w-full"
                />
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {device.sensors.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={!!sensorPick[s.id]}
                        onChange={(ev) => setSensorPick((p) => ({ ...p, [s.id]: ev.target.checked }))}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={isPending('sens')}
                  onClick={() => {
                    const ids = Object.entries(sensorPick).filter(([, on]) => on).map(([id]) => id);
                    send('sens', {
                      type: 'thermostat',
                      action: 'set_sensors_for_climate',
                      climateComfortName: climateForSensors,
                      sensorIds: ids,
                    });
                  }}
                  className="rounded-md px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                >
                  {isPending('sens') ? <ButtonSpinner /> : 'Apply sensors'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
