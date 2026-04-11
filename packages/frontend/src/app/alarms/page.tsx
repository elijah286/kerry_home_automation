'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { SlidePanel } from '@/components/ui/SlidePanel';
import {
  AlarmClock,
  Plus,
  Trash2,
  Copy,
  Pencil,
  Loader2,
  Lightbulb,
  BlindsIcon,
  Fan,
  ToggleLeft,
  Speaker,
  X,
} from 'lucide-react';
import {
  getAlarms,
  createAlarm,
  updateAlarm,
  deleteAlarm,
  duplicateAlarm,
  disableAllAlarms,
  enableAllAlarms,
} from '@/lib/api';
import type { Alarm, AlarmCreate, AlarmDeviceAction, DeviceState } from '@ha/shared';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const DEVICE_ACTIONS: Record<string, { label: string; actions: { value: string; label: string }[] }> = {
  light: { label: 'Light', actions: [{ value: 'turn_on', label: 'Turn On' }, { value: 'turn_off', label: 'Turn Off' }] },
  cover: { label: 'Blind/Shade', actions: [{ value: 'open', label: 'Open' }, { value: 'close', label: 'Close' }] },
  fan: { label: 'Fan', actions: [{ value: 'turn_on', label: 'Turn On' }, { value: 'turn_off', label: 'Turn Off' }] },
  switch: { label: 'Switch', actions: [{ value: 'turn_on', label: 'Turn On' }, { value: 'turn_off', label: 'Turn Off' }] },
  media_player: { label: 'Media Player', actions: [{ value: 'power_on', label: 'Power On' }, { value: 'power_off', label: 'Power Off' }] },
};

function deviceIcon(type: string) {
  switch (type) {
    case 'light': return Lightbulb;
    case 'cover': return BlindsIcon;
    case 'fan': return Fan;
    case 'switch': return ToggleLeft;
    case 'media_player': return Speaker;
    default: return ToggleLeft;
  }
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function daysLabel(days: number[]): string {
  if (days.length === 0) return 'Once';
  if (days.length === 7) return 'Every day';
  const weekdays = [1, 2, 3, 4, 5];
  const weekend = [0, 6];
  if (weekdays.every((d) => days.includes(d)) && days.length === 5) return 'Weekdays';
  if (weekend.every((d) => days.includes(d)) && days.length === 2) return 'Weekends';
  return days.sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(', ');
}

// ---------------------------------------------------------------------------
// Alarm Form (used in SlidePanel for add/edit)
// ---------------------------------------------------------------------------

interface AlarmFormData {
  name: string;
  time: string;
  daysOfWeek: number[];
  devices: AlarmDeviceAction[];
}

function AlarmForm({
  initial,
  allDevices,
  onSave,
  onCancel,
  saving,
}: {
  initial: AlarmFormData;
  allDevices: DeviceState[];
  onSave: (data: AlarmFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<AlarmFormData>(initial);

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day)
        ? f.daysOfWeek.filter((d) => d !== day)
        : [...f.daysOfWeek, day],
    }));
  };

  const addDevice = () => {
    setForm((f) => ({
      ...f,
      devices: [...f.devices, { deviceId: '', action: '' }],
    }));
  };

  const updateDevice = (idx: number, field: keyof AlarmDeviceAction, value: string) => {
    setForm((f) => {
      const devices = [...f.devices];
      devices[idx] = { ...devices[idx], [field]: value };
      // Reset action when device changes
      if (field === 'deviceId') {
        const dev = allDevices.find((d) => d.id === value);
        const actions = dev ? DEVICE_ACTIONS[dev.type]?.actions : [];
        devices[idx].action = actions?.[0]?.value ?? '';
      }
      return { ...f, devices };
    });
  };

  const removeDevice = (idx: number) => {
    setForm((f) => ({ ...f, devices: f.devices.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-5">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          Alarm Name
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Morning Alarm"
          className="w-full rounded-md border px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        />
      </div>

      {/* Time */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          Time
        </label>
        <input
          type="time"
          value={form.time}
          onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
          className="w-full rounded-md border px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        />
      </div>

      {/* Days of week */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          Repeat
        </label>
        <div className="flex gap-1.5">
          {DAY_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => toggleDay(i)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium transition-colors"
              style={{
                backgroundColor: form.daysOfWeek.includes(i) ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: form.daysOfWeek.includes(i) ? '#fff' : 'var(--color-text-secondary)',
                border: `1px solid ${form.daysOfWeek.includes(i) ? 'var(--color-accent)' : 'var(--color-border)'}`,
              }}
            >
              {DAY_SHORT[i]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {daysLabel(form.daysOfWeek)}
        </p>
      </div>

      {/* Device actions */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Device Actions
          </label>
          <button
            onClick={addDevice}
            className="flex items-center gap-1 text-xs font-medium transition-colors"
            style={{ color: 'var(--color-accent)' }}
          >
            <Plus className="h-3 w-3" /> Add Device
          </button>
        </div>
        {form.devices.length === 0 && (
          <p className="text-xs py-3 text-center rounded-md border border-dashed"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>
            No devices — alarm will fire without controlling any devices
          </p>
        )}
        <div className="space-y-2">
          {form.devices.map((da, idx) => {
            const selectedDevice = allDevices.find((d) => d.id === da.deviceId);
            const availableActions = selectedDevice ? DEVICE_ACTIONS[selectedDevice.type]?.actions ?? [] : [];
            return (
              <div key={idx} className="flex items-center gap-2 rounded-md border p-2"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                <select
                  value={da.deviceId}
                  onChange={(e) => updateDevice(idx, 'deviceId', e.target.value)}
                  className="flex-1 rounded border px-2 py-1.5 text-xs"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  <option value="">Select device...</option>
                  {allDevices.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <select
                  value={da.action}
                  onChange={(e) => updateDevice(idx, 'action', e.target.value)}
                  className="w-28 rounded border px-2 py-1.5 text-xs"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  disabled={!da.deviceId}
                >
                  <option value="">Action...</option>
                  {availableActions.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
                <button onClick={() => removeDevice(idx)} className="p-1 rounded hover:bg-[var(--color-bg-hover)]">
                  <X className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name || !form.time}
          className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [alarmRes, devRes] = await Promise.all([
        getAlarms(),
        fetch(`${API_BASE}/api/devices`).then((r) => r.json()) as Promise<{ devices: DeviceState[] }>,
      ]);
      setAlarms(alarmRes.alarms);
      setDevices(devRes.devices);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const allEnabled = alarms.length > 0 && alarms.every((a) => a.enabled);
  const anyEnabled = alarms.some((a) => a.enabled);

  const handleToggleAll = async () => {
    try {
      if (anyEnabled) {
        await disableAllAlarms();
      } else {
        await enableAllAlarms();
      }
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggle = async (alarm: Alarm) => {
    try {
      await updateAlarm(alarm.id, { enabled: !alarm.enabled });
      setAlarms((prev) => prev.map((a) => a.id === alarm.id ? { ...a, enabled: !a.enabled } : a));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSave = async (data: AlarmFormData) => {
    setSaving(true);
    try {
      if (editingAlarm) {
        const res = await updateAlarm(editingAlarm.id, data);
        setAlarms((prev) => prev.map((a) => a.id === editingAlarm.id ? res.alarm : a));
      } else {
        const res = await createAlarm(data as AlarmCreate);
        setAlarms((prev) => [...prev, res.alarm]);
      }
      setPanelOpen(false);
      setEditingAlarm(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (alarm: Alarm) => {
    try {
      const res = await duplicateAlarm(alarm.id);
      setAlarms((prev) => [...prev, res.alarm]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAlarm(id);
      setAlarms((prev) => prev.filter((a) => a.id !== id));
      setDeleteId(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openAdd = () => {
    setEditingAlarm(null);
    setPanelOpen(true);
  };

  const openEdit = (alarm: Alarm) => {
    setEditingAlarm(alarm);
    setPanelOpen(true);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-4 lg:p-6 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-accent)' }} />
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading alarms...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
            <AlarmClock className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Alarms</h1>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {alarms.length} alarm{alarms.length !== 1 ? 's' : ''} &middot; {alarms.filter((a) => a.enabled).length} active
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {alarms.length > 0 && (
            <button
              onClick={handleToggleAll}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: anyEnabled ? 'var(--color-danger)' : 'var(--color-success)',
                color: '#fff',
                opacity: 0.9,
              }}
            >
              {anyEnabled ? 'Disable All' : 'Enable All'}
            </button>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            <Plus className="h-3.5 w-3.5" /> New Alarm
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-danger)', color: '#fff', opacity: 0.9 }}>
          {error}
        </div>
      )}

      {/* Alarm list */}
      {alarms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <AlarmClock className="h-10 w-10" style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No alarms yet</p>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            <Plus className="h-4 w-4" /> Create Your First Alarm
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {alarms.map((alarm) => (
            <Card key={alarm.id} className={`!p-0 transition-opacity ${!alarm.enabled ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-4 px-4 py-3">
                {/* Time */}
                <div className="min-w-0">
                  <p className="text-2xl font-light tabular-nums" style={{ color: alarm.enabled ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                    {formatTime12(alarm.time)}
                  </p>
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {alarm.name}
                  </p>
                </div>

                {/* Day pills */}
                <div className="hidden sm:flex items-center gap-1 ml-auto mr-4">
                  {DAY_LABELS.map((_, i) => (
                    <span
                      key={i}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium"
                      style={{
                        backgroundColor: alarm.daysOfWeek.includes(i)
                          ? 'var(--color-accent)'
                          : 'var(--color-bg-secondary)',
                        color: alarm.daysOfWeek.includes(i) ? '#fff' : 'var(--color-text-muted)',
                      }}
                    >
                      {DAY_SHORT[i]}
                    </span>
                  ))}
                </div>

                {/* Day summary on mobile */}
                <span className="sm:hidden text-xs ml-auto mr-2" style={{ color: 'var(--color-text-muted)' }}>
                  {daysLabel(alarm.daysOfWeek)}
                </span>

                {/* Device count */}
                {alarm.devices.length > 0 && (
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}>
                    {alarm.devices.length} device{alarm.devices.length !== 1 ? 's' : ''}
                  </span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(alarm)} className="p-1.5 rounded-md hover:bg-[var(--color-bg-hover)] transition-colors"
                    title="Edit">
                    <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                  </button>
                  <button onClick={() => handleDuplicate(alarm)} className="p-1.5 rounded-md hover:bg-[var(--color-bg-hover)] transition-colors"
                    title="Duplicate">
                    <Copy className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                  </button>
                  <button onClick={() => setDeleteId(alarm.id)} className="p-1.5 rounded-md hover:bg-[var(--color-bg-hover)] transition-colors"
                    title="Delete">
                    <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--color-danger)' }} />
                  </button>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => handleToggle(alarm)}
                  className="relative shrink-0 h-6 w-11 rounded-full transition-colors"
                  style={{ backgroundColor: alarm.enabled ? 'var(--color-accent)' : 'var(--color-bg-hover)' }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                    style={{ left: alarm.enabled ? '22px' : '2px' }}
                  />
                </button>
              </div>

              {/* Delete confirmation */}
              {deleteId === alarm.id && (
                <div className="flex items-center gap-2 px-4 py-2 border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Delete this alarm?</span>
                  <button
                    onClick={() => handleDelete(alarm.id)}
                    className="rounded px-2 py-1 text-xs font-medium"
                    style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setDeleteId(null)}
                    className="rounded px-2 py-1 text-xs"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Panel */}
      <SlidePanel
        open={panelOpen}
        onClose={() => { setPanelOpen(false); setEditingAlarm(null); }}
        title={editingAlarm ? 'Edit Alarm' : 'New Alarm'}
      >
        <AlarmForm
          initial={editingAlarm ? {
            name: editingAlarm.name,
            time: editingAlarm.time,
            daysOfWeek: editingAlarm.daysOfWeek,
            devices: editingAlarm.devices,
          } : {
            name: '',
            time: '07:00',
            daysOfWeek: [1, 2, 3, 4, 5],
            devices: [],
          }}
          allDevices={devices}
          onSave={handleSave}
          onCancel={() => { setPanelOpen(false); setEditingAlarm(null); }}
          saving={saving}
        />
      </SlidePanel>
    </div>
  );
}
