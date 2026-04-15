'use client';

import { useState, useEffect } from 'react';
import type { HelperDefinition, HelperType, DeviceState } from '@ha/shared';
import { getApiBase, apiFetch } from '@/lib/api-base';

interface Props {
  type: HelperType;
  initial?: HelperDefinition;
  onSave: (def: HelperDefinition) => void;
  onCancel: () => void;
}

// Fetch devices for entity pickers
function useDeviceList() {
  const [devices, setDevices] = useState<DeviceState[]>([]);
  useEffect(() => {
    const base = getApiBase();
    apiFetch(`${base}/api/devices`)
      .then((r) => r.json())
      .then((d) => setDevices(d))
      .catch(() => {});
  }, []);
  return devices;
}

export default function HelperConfigForm({ type, initial, onSave, onCancel }: Props) {
  const devices = useDeviceList();
  const isEdit = !!initial;

  // Common fields
  const [id, setId] = useState(initial?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled !== false);

  // Type-specific fields (stored as generic record)
  const [fields, setFields] = useState<Record<string, any>>(() => {
    if (!initial) return {};
    const { id: _i, name: _n, icon: _ic, enabled: _e, type: _t, ...rest } = initial as any;
    return rest;
  });

  const setField = (key: string, value: any) => setFields((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const def = { id, name, icon: icon || undefined, enabled, type, ...fields } as HelperDefinition;
    onSave(def);
  };

  // Styling helpers
  const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-md border';
  const inputStyle = { backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' };
  const labelCls = 'block text-xs font-medium mb-1';

  const renderEntityPicker = (key: string, label: string, filter?: (d: DeviceState) => boolean) => {
    const filtered = filter ? devices.filter(filter) : devices;
    return (
      <div>
        <label className={labelCls}>{label}</label>
        <select
          value={fields[key] ?? ''}
          onChange={(e) => setField(key, e.target.value)}
          className={inputCls}
          style={inputStyle}
        >
          <option value="">Select a device...</option>
          {filtered.map((d) => (
            <option key={d.id} value={d.id}>{d.displayName || d.name} ({d.id})</option>
          ))}
        </select>
      </div>
    );
  };

  const renderMultiEntityPicker = (key: string, label: string) => {
    const selected: string[] = fields[key] ?? [];
    return (
      <div>
        <label className={labelCls}>{label}</label>
        <select
          multiple
          value={selected}
          onChange={(e) => {
            const vals = Array.from(e.target.selectedOptions, (o) => o.value);
            setField(key, vals);
          }}
          className={inputCls + ' h-32'}
          style={inputStyle}
        >
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.displayName || d.name} ({d.id})</option>
          ))}
        </select>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Hold Ctrl/Cmd to select multiple</p>
      </div>
    );
  };

  const renderNumber = (key: string, label: string, opts?: { placeholder?: string; step?: number }) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        value={fields[key] ?? ''}
        onChange={(e) => setField(key, e.target.value === '' ? undefined : Number(e.target.value))}
        placeholder={opts?.placeholder}
        step={opts?.step}
        className={inputCls}
        style={inputStyle}
      />
    </div>
  );

  const renderText = (key: string, label: string, opts?: { placeholder?: string }) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="text"
        value={fields[key] ?? ''}
        onChange={(e) => setField(key, e.target.value || undefined)}
        placeholder={opts?.placeholder}
        className={inputCls}
        style={inputStyle}
      />
    </div>
  );

  const renderSelect = (key: string, label: string, options: { value: string; label: string }[]) => (
    <div>
      <label className={labelCls}>{label}</label>
      <select
        value={fields[key] ?? options[0]?.value ?? ''}
        onChange={(e) => setField(key, e.target.value)}
        className={inputCls}
        style={inputStyle}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const renderCheckbox = (key: string, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={fields[key] ?? false}
        onChange={(e) => setField(key, e.target.checked)}
      />
      {label}
    </label>
  );

  // Type-specific form fields
  const renderTypeFields = () => {
    switch (type) {
      case 'toggle':
        return renderCheckbox('initial', 'Initially on');

      case 'counter':
        return (
          <>
            {renderNumber('initial', 'Initial Value', { placeholder: '0' })}
            {renderNumber('step', 'Step', { placeholder: '1' })}
            {renderNumber('min', 'Minimum')}
            {renderNumber('max', 'Maximum')}
          </>
        );

      case 'timer':
        return (
          <>
            {renderText('duration', 'Duration (HH:MM:SS)', { placeholder: '00:05:00' })}
            {renderCheckbox('restore', 'Restore state on restart')}
          </>
        );

      case 'button':
        return null; // No extra fields

      case 'number':
        return (
          <>
            {renderNumber('initial', 'Initial Value', { placeholder: '0' })}
            {renderNumber('min', 'Minimum', { placeholder: '0' })}
            {renderNumber('max', 'Maximum', { placeholder: '100' })}
            {renderNumber('step', 'Step', { placeholder: '1', step: 0.001 })}
            {renderText('unit', 'Unit of Measurement', { placeholder: 'e.g. °F, %, W' })}
            {renderSelect('mode', 'Display Mode', [{ value: 'slider', label: 'Slider' }, { value: 'box', label: 'Input Box' }])}
          </>
        );

      case 'text':
        return (
          <>
            {renderText('initial', 'Initial Value')}
            {renderNumber('minLength', 'Min Length', { placeholder: '0' })}
            {renderNumber('maxLength', 'Max Length', { placeholder: '100' })}
            {renderText('pattern', 'Regex Pattern', { placeholder: 'Optional validation pattern' })}
            {renderSelect('mode', 'Input Mode', [{ value: 'text', label: 'Text' }, { value: 'password', label: 'Password' }])}
          </>
        );

      case 'date_time':
        return (
          <>
            {renderSelect('mode', 'Mode', [
              { value: 'datetime', label: 'Date & Time' },
              { value: 'date', label: 'Date only' },
              { value: 'time', label: 'Time only' },
            ])}
            {renderText('initial', 'Initial Value', { placeholder: 'ISO date/time string' })}
          </>
        );

      case 'random':
        return (
          <>
            {renderSelect('mode', 'Mode', [{ value: 'number', label: 'Random Number' }, { value: 'boolean', label: 'Random Boolean' }])}
            {fields.mode !== 'boolean' && (
              <>
                {renderNumber('min', 'Minimum', { placeholder: '0' })}
                {renderNumber('max', 'Maximum', { placeholder: '20' })}
              </>
            )}
            {renderText('unit', 'Unit', { placeholder: 'Optional' })}
          </>
        );

      case 'group':
        return (
          <>
            {renderSelect('entityType', 'Entity Type', [
              { value: 'sensor', label: 'Sensor (numeric aggregation)' },
              { value: 'binary', label: 'Binary (on/off)' },
            ])}
            {renderMultiEntityPicker('entityIds', 'Member Entities')}
            {fields.entityType !== 'binary' && renderSelect('aggregation', 'Aggregation', [
              { value: 'mean', label: 'Mean' }, { value: 'sum', label: 'Sum' },
              { value: 'min', label: 'Minimum' }, { value: 'max', label: 'Maximum' },
              { value: 'median', label: 'Median' }, { value: 'range', label: 'Range' },
              { value: 'product', label: 'Product' }, { value: 'stdev', label: 'Std Deviation' },
              { value: 'first', label: 'First' }, { value: 'last', label: 'Last' },
            ])}
            {renderText('unit', 'Unit', { placeholder: 'Optional' })}
          </>
        );

      case 'derivative_sensor':
        return (
          <>
            {renderEntityPicker('sourceEntityId', 'Source Entity')}
            {renderNumber('timeWindow', 'Smoothing Window (seconds)')}
            {renderNumber('precision', 'Decimal Precision', { placeholder: '3' })}
            {renderText('unit', 'Unit', { placeholder: 'e.g. W/s, °F/h' })}
            {renderSelect('timeUnit', 'Time Unit', [
              { value: 's', label: 'Seconds' }, { value: 'min', label: 'Minutes' },
              { value: 'h', label: 'Hours' }, { value: 'd', label: 'Days' },
            ])}
          </>
        );

      case 'integral_sensor':
        return (
          <>
            {renderEntityPicker('sourceEntityId', 'Source Entity')}
            {renderSelect('method', 'Integration Method', [
              { value: 'trapezoidal', label: 'Trapezoidal (most accurate)' },
              { value: 'left', label: 'Left Riemann' },
              { value: 'right', label: 'Right Riemann' },
            ])}
            {renderNumber('precision', 'Decimal Precision', { placeholder: '3' })}
            {renderText('unit', 'Unit', { placeholder: 'e.g. kWh' })}
            {renderSelect('timeUnit', 'Time Unit', [
              { value: 'h', label: 'Hours' }, { value: 's', label: 'Seconds' },
              { value: 'min', label: 'Minutes' }, { value: 'd', label: 'Days' },
            ])}
          </>
        );

      case 'history_stats':
        return (
          <>
            {renderEntityPicker('sourceEntityId', 'Source Entity')}
            {renderText('targetState', 'Target State(s)', { placeholder: 'e.g. on, active (comma-separated)' })}
            {renderSelect('mode', 'Measurement Mode', [
              { value: 'time', label: 'Time (hours in state)' },
              { value: 'ratio', label: 'Ratio (% of period)' },
              { value: 'count', label: 'Count (number of times)' },
            ])}
            {renderNumber('period', 'Period (seconds)', { placeholder: '86400' })}
          </>
        );

      case 'threshold_sensor':
        return (
          <>
            {renderEntityPicker('sourceEntityId', 'Source Entity')}
            {renderNumber('upper', 'Upper Limit')}
            {renderNumber('lower', 'Lower Limit')}
            {renderNumber('hysteresis', 'Hysteresis', { placeholder: '0', step: 0.1 })}
          </>
        );

      case 'switch_as_x':
        return (
          <>
            {renderEntityPicker('sourceEntityId', 'Source Switch', (d) => d.type === 'switch')}
            {renderSelect('targetType', 'Present As', [
              { value: 'light', label: 'Light' },
              { value: 'cover', label: 'Cover' },
              { value: 'fan', label: 'Fan' },
              { value: 'lock', label: 'Lock' },
            ])}
          </>
        );

      case 'combine_sensors':
        return (
          <>
            {renderMultiEntityPicker('entityIds', 'Source Entities')}
            {renderSelect('aggregation', 'Aggregation', [
              { value: 'mean', label: 'Mean' }, { value: 'sum', label: 'Sum' },
              { value: 'min', label: 'Minimum' }, { value: 'max', label: 'Maximum' },
              { value: 'median', label: 'Median' }, { value: 'range', label: 'Range' },
              { value: 'product', label: 'Product' }, { value: 'stdev', label: 'Std Deviation' },
            ])}
            {renderText('unit', 'Unit', { placeholder: 'Optional' })}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Common fields */}
      <div>
        <label className={labelCls}>ID</label>
        <input
          type="text"
          value={id}
          onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
          placeholder="e.g. guest_mode"
          required
          disabled={isEdit}
          className={inputCls}
          style={{ ...inputStyle, opacity: isEdit ? 0.6 : 1 }}
        />
      </div>

      <div>
        <label className={labelCls}>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Guest Mode"
          required
          className={inputCls}
          style={inputStyle}
        />
      </div>

      <div>
        <label className={labelCls}>Icon (optional)</label>
        <input
          type="text"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="e.g. mdi:account-group"
          className={inputCls}
          style={inputStyle}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enabled
      </label>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      {/* Type-specific fields */}
      {renderTypeFields()}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 px-3 py-2 text-sm rounded-md text-white font-medium"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          {isEdit ? 'Update' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-sm rounded-md border"
          style={{ borderColor: 'var(--color-border)' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
