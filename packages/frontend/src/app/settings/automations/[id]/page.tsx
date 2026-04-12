'use client';

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import {
  Zap, Save, Play, ArrowLeft, Plus, Trash2, Clock, Cpu, Sun, Hand,
  ChevronDown, ChevronUp, Loader2, History, AlertCircle, Check, X,
  Code2, LayoutList,
} from 'lucide-react';
import {
  getAutomation, createAutomation, updateAutomation, triggerAutomation,
  getAutomationHistory, getAutomationGroups, getDevices,
} from '@/lib/api';
import type {
  Automation, AutomationTrigger, AutomationCondition, AutomationAction,
  AutomationMode, AutomationExecutionLog, DeviceState,
} from '@ha/shared';
import { Select } from '@/components/ui/Select';
import { DeviceAutocomplete } from '@/components/DeviceAutocomplete';
import * as yamlLib from 'js-yaml';

const AutomationYamlEditor = lazy(() =>
  import('@/components/AutomationYamlEditor').then(m => ({ default: m.AutomationYamlEditor }))
);

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

// ---------------------------------------------------------------------------
// YAML conversion helpers
// ---------------------------------------------------------------------------

interface AutomationYamlShape {
  id?: string;
  name?: string;
  group?: string;
  description?: string;
  enabled?: boolean;
  mode?: string;
  triggers?: AutomationTrigger[];
  conditions?: AutomationCondition[];
  actions?: AutomationAction[];
}

function automationToYaml(data: {
  id?: string;
  name: string;
  group?: string;
  description?: string;
  enabled: boolean;
  mode: AutomationMode;
  triggers: AutomationTrigger[];
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}): string {
  const obj: AutomationYamlShape = {};
  if (data.id) obj.id = data.id;
  obj.name = data.name;
  if (data.group) obj.group = data.group;
  if (data.description) obj.description = data.description;
  obj.enabled = data.enabled;
  obj.mode = data.mode;
  obj.triggers = data.triggers;
  obj.conditions = data.conditions.length > 0 ? data.conditions : undefined;
  obj.actions = data.actions;
  return yamlLib.dump(obj, { indent: 2, lineWidth: 120, noRefs: true });
}

function yamlToAutomation(text: string): AutomationYamlShape | null {
  try {
    const obj = yamlLib.load(text) as AutomationYamlShape;
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Trigger Editor
// ---------------------------------------------------------------------------

function TriggerEditor({ trigger, onChange, onRemove, devices }: {
  trigger: AutomationTrigger;
  onChange: (t: AutomationTrigger) => void;
  onRemove: () => void;
  devices: DeviceState[];
}) {
  return (
    <Card className="!p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {trigger.type === 'time' && <Clock className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />}
          {trigger.type === 'device_state' && <Cpu className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />}
          {trigger.type === 'sun' && <Sun className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />}
          {trigger.type === 'manual' && <Hand className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />}
          <Select
            value={trigger.type}
            onValueChange={(type) => {
              if (type === 'time') onChange({ type: 'time', cron: '0 8 * * *' });
              else if (type === 'device_state') onChange({ type: 'device_state', deviceId: '', attribute: 'on' });
              else if (type === 'sun') onChange({ type: 'sun', event: 'sunset' });
              else onChange({ type: 'manual' });
            }}
            options={[
              { value: 'time', label: 'Time (Cron)' },
              { value: 'device_state', label: 'Device State' },
              { value: 'sun', label: 'Sun Event' },
              { value: 'manual', label: 'Manual' },
            ]}
            size="xs"
          />
        </div>
        <button onClick={onRemove} className="p-1 rounded hover:bg-[var(--color-bg-hover)]">
          <Trash2 className="h-3 w-3" style={{ color: 'var(--color-danger)' }} />
        </button>
      </div>

      {trigger.type === 'time' && (
        <div>
          <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Cron Expression</label>
          <input
            type="text"
            value={trigger.cron}
            onChange={(e) => onChange({ ...trigger, cron: e.target.value })}
            placeholder="0 8 * * * (every day at 8am)"
            className="w-full rounded border px-2 py-1 text-xs mt-0.5"
            style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            min hour day month weekday
          </p>
        </div>
      )}

      {trigger.type === 'device_state' && (
        <div className="grid grid-cols-2 gap-2">
          <DeviceAutocomplete
            value={trigger.deviceId}
            onChange={(id) => onChange({ ...trigger, deviceId: id })}
            devices={devices}
            label="Device"
            placeholder="Start typing device..."
          />
          <div>
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Attribute</label>
            <input
              type="text"
              value={trigger.attribute}
              onChange={(e) => onChange({ ...trigger, attribute: e.target.value })}
              placeholder="on"
              className="w-full rounded border px-2 py-1 text-xs mt-0.5"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>From (optional)</label>
            <input
              type="text"
              value={trigger.from !== undefined ? String(trigger.from) : ''}
              onChange={(e) => onChange({ ...trigger, from: e.target.value || undefined })}
              className="w-full rounded border px-2 py-1 text-xs mt-0.5"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>To (optional)</label>
            <input
              type="text"
              value={trigger.to !== undefined ? String(trigger.to) : ''}
              onChange={(e) => onChange({ ...trigger, to: e.target.value || undefined })}
              className="w-full rounded border px-2 py-1 text-xs mt-0.5"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Hold For (optional, HH:MM:SS)</label>
            <input
              type="text"
              value={trigger.for ?? ''}
              onChange={(e) => onChange({ ...trigger, for: e.target.value || undefined })}
              placeholder="00:05:00"
              className="w-full rounded border px-2 py-1 text-xs mt-0.5"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
        </div>
      )}

      {trigger.type === 'sun' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Event</label>
            <Select
              value={trigger.event}
              onValueChange={(v) => onChange({ ...trigger, event: v as 'sunrise' | 'sunset' })}
              options={[
                { value: 'sunrise', label: 'Sunrise' },
                { value: 'sunset', label: 'Sunset' },
              ]}
              size="xs"
              className="w-full mt-0.5"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Offset (optional)</label>
            <input
              type="text"
              value={trigger.offset ?? ''}
              onChange={(e) => onChange({ ...trigger, offset: e.target.value || undefined })}
              placeholder="-00:15:00"
              className="w-full rounded border px-2 py-1 text-xs mt-0.5"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
        </div>
      )}

      {trigger.type === 'manual' && (
        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          This automation can only be triggered manually or by another automation.
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Condition Editor
// ---------------------------------------------------------------------------

function ConditionEditor({ condition, onChange, onRemove, devices }: {
  condition: AutomationCondition;
  onChange: (c: AutomationCondition) => void;
  onRemove: () => void;
  devices: DeviceState[];
}) {
  return (
    <Card className="!p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Select
          value={condition.type}
          onValueChange={(type) => {
            if (type === 'device_state') onChange({ type: 'device_state', deviceId: '', attribute: '', op: 'eq', value: '' });
            else if (type === 'time_window') onChange({ type: 'time_window', after: '08:00', before: '22:00' });
            else onChange(condition);
          }}
          options={[
            { value: 'device_state', label: 'Device State' },
            { value: 'time_window', label: 'Time Window' },
          ]}
          size="xs"
        />
        <button onClick={onRemove} className="p-1 rounded hover:bg-[var(--color-bg-hover)]">
          <Trash2 className="h-3 w-3" style={{ color: 'var(--color-danger)' }} />
        </button>
      </div>

      {condition.type === 'device_state' && (
        <div className="grid grid-cols-2 gap-2">
          <DeviceAutocomplete
            value={condition.deviceId}
            onChange={(id) => onChange({ ...condition, deviceId: id })}
            devices={devices}
            label="Device"
            placeholder="Start typing device..."
          />
          <div>
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Attribute</label>
            <input
              type="text"
              value={condition.attribute}
              onChange={(e) => onChange({ ...condition, attribute: e.target.value })}
              className="w-full rounded border px-2 py-1 text-xs mt-0.5"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Operator</label>
            <Select
              value={condition.op}
              onValueChange={(v) => onChange({ ...condition, op: v as 'eq' | 'gt' | 'lt' | 'gte' | 'lte' })}
              options={[
                { value: 'eq', label: 'Equals' },
                { value: 'gt', label: 'Greater than' },
                { value: 'lt', label: 'Less than' },
                { value: 'gte', label: 'Greater or equal' },
                { value: 'lte', label: 'Less or equal' },
              ]}
              size="xs"
              className="w-full mt-0.5"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Value</label>
            <input
              type="text"
              value={String(condition.value)}
              onChange={(e) => {
                let v: unknown = e.target.value;
                if (v === 'true') v = true;
                else if (v === 'false') v = false;
                else if (!isNaN(Number(v)) && v !== '') v = Number(v);
                onChange({ ...condition, value: v });
              }}
              className="w-full rounded border px-2 py-1 text-xs mt-0.5"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
        </div>
      )}

      {condition.type === 'time_window' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>After</label>
            <input
              type="time"
              value={condition.after}
              onChange={(e) => onChange({ ...condition, after: e.target.value })}
              className="w-full rounded border px-2 py-1 text-xs mt-0.5"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Before</label>
            <input
              type="time"
              value={condition.before}
              onChange={(e) => onChange({ ...condition, before: e.target.value })}
              className="w-full rounded border px-2 py-1 text-xs mt-0.5"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Action Editor
// ---------------------------------------------------------------------------

function ActionEditor({ action, index, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast, devices }: {
  action: AutomationAction;
  index: number;
  onChange: (a: AutomationAction) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  devices: DeviceState[];
}) {
  return (
    <Card className="!p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
            {index + 1}
          </span>
          <Select
            value={action.type}
            onValueChange={(type) => {
              if (type === 'device_command') onChange({ type: 'device_command', deviceId: '', command: { type: 'light', deviceId: '', action: 'turn_on' } });
              else if (type === 'delay') onChange({ type: 'delay', duration: '00:00:05' });
              else if (type === 'call_automation') onChange({ type: 'call_automation', automationId: '' });
              else if (type === 'log') onChange({ type: 'log', message: '' });
              else onChange(action);
            }}
            options={[
              { value: 'device_command', label: 'Device Command' },
              { value: 'delay', label: 'Delay' },
              { value: 'call_automation', label: 'Call Automation' },
              { value: 'log', label: 'Log Message' },
            ]}
            size="xs"
          />
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={onMoveUp} disabled={isFirst} className="p-1 rounded hover:bg-[var(--color-bg-hover)] disabled:opacity-30">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="p-1 rounded hover:bg-[var(--color-bg-hover)] disabled:opacity-30">
            <ChevronDown className="h-3 w-3" />
          </button>
          <button onClick={onRemove} className="p-1 rounded hover:bg-[var(--color-bg-hover)]">
            <Trash2 className="h-3 w-3" style={{ color: 'var(--color-danger)' }} />
          </button>
        </div>
      </div>

      {action.type === 'device_command' && (
        <div className="space-y-2">
          <DeviceAutocomplete
            value={action.deviceId}
            onChange={(id) => onChange({ ...action, deviceId: id, command: { ...action.command, deviceId: id } })}
            devices={devices}
            label="Device"
            placeholder="Start typing device..."
          />
          <div>
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Command (JSON)</label>
            <textarea
              value={JSON.stringify(action.command, null, 2)}
              onChange={(e) => {
                try {
                  const cmd = JSON.parse(e.target.value);
                  onChange({ ...action, command: cmd });
                } catch { /* invalid JSON, ignore */ }
              }}
              rows={3}
              className="w-full rounded border px-2 py-1 text-xs mt-0.5 font-mono"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
        </div>
      )}

      {action.type === 'delay' && (
        <div>
          <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Duration (HH:MM:SS)</label>
          <input
            type="text"
            value={action.duration}
            onChange={(e) => onChange({ ...action, duration: e.target.value })}
            placeholder="00:05:00"
            className="w-full rounded border px-2 py-1 text-xs mt-0.5"
            style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
        </div>
      )}

      {action.type === 'call_automation' && (
        <div>
          <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Automation ID</label>
          <input
            type="text"
            value={action.automationId}
            onChange={(e) => onChange({ ...action, automationId: e.target.value })}
            className="w-full rounded border px-2 py-1 text-xs mt-0.5"
            style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
        </div>
      )}

      {action.type === 'log' && (
        <div>
          <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Message</label>
          <input
            type="text"
            value={action.message}
            onChange={(e) => onChange({ ...action, message: e.target.value })}
            className="w-full rounded border px-2 py-1 text-xs mt-0.5"
            style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Execution History
// ---------------------------------------------------------------------------

function ExecutionHistorySection({ automationId }: { automationId: string }) {
  const [executions, setExecutions] = useState<AutomationExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    getAutomationHistory(automationId, 20).then(({ executions }) => {
      setExecutions(executions);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [automationId, expanded]);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <History className="h-3.5 w-3.5" />
        Execution History
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {loading && <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />}
          {!loading && executions.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No executions yet</p>
          )}
          {!loading && executions.map(ex => (
            <Card key={ex.id} className="!p-2">
              <div className="flex items-center gap-2 text-xs">
                {ex.status === 'completed' && <Check className="h-3 w-3 shrink-0" style={{ color: 'var(--color-success)' }} />}
                {ex.status === 'failed' && <AlertCircle className="h-3 w-3 shrink-0" style={{ color: 'var(--color-danger)' }} />}
                {ex.status === 'running' && <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: 'var(--color-accent)' }} />}
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {new Date(ex.triggeredAt).toLocaleString()}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{
                  backgroundColor: ex.status === 'completed' ? 'var(--color-success)' : ex.status === 'failed' ? 'var(--color-danger)' : 'var(--color-accent)',
                  color: '#fff',
                }}>
                  {ex.status}
                </span>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  via {ex.triggerType}
                </span>
                {!ex.conditionsPassed && (
                  <span className="text-[10px]" style={{ color: 'var(--color-warning)' }}>
                    (conditions not met)
                  </span>
                )}
              </div>
              {ex.error && (
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-danger)' }}>{ex.error}</p>
              )}
              {ex.actionsExecuted.length > 0 && (
                <div className="mt-1 text-[10px] space-y-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {ex.actionsExecuted.map((al, i) => (
                    <div key={i}>
                      #{al.index + 1} {al.actionType}
                      {al.deviceId ? ` → ${al.deviceId}` : ''}
                      {' '}{al.result === 'success' ? '✓' : al.result === 'failed' ? '✗' : '—'}
                      {' '}{al.durationMs}ms
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Editor Page
// ---------------------------------------------------------------------------

type EditorMode = 'visual' | 'yaml';

export default function AutomationEditorPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>('visual');
  const [yamlText, setYamlText] = useState('');
  const [yamlError, setYamlError] = useState<string | null>(null);

  // Form state
  const [automationId, setAutomationId] = useState('');
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<AutomationMode>('single');
  const [triggers, setTriggers] = useState<AutomationTrigger[]>([{ type: 'manual' }]);
  const [conditions, setConditions] = useState<AutomationCondition[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([]);

  // Load existing automation
  useEffect(() => {
    if (isNew) return;
    getAutomation(id).then(({ automation }) => {
      setAutomationId(automation.id);
      setName(automation.name);
      setGroup(automation.group ?? '');
      setDescription(automation.description ?? '');
      setEnabled(automation.enabled);
      setMode(automation.mode);
      setTriggers(automation.triggers);
      setConditions(automation.conditions);
      setActions(automation.actions);
    }).catch(() => setError('Failed to load automation'))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  // Load groups + devices
  useEffect(() => {
    getAutomationGroups().then(({ groups }) => setGroups(groups)).catch(() => {});
    getDevices().then(({ devices }) => setDevices(devices)).catch(() => {});
  }, []);

  // Sync form state -> YAML when switching to YAML mode
  const switchToYaml = () => {
    const yml = automationToYaml({
      id: isNew ? automationId : undefined,
      name,
      group: group || undefined,
      description: description || undefined,
      enabled,
      mode,
      triggers,
      conditions,
      actions,
    });
    setYamlText(yml);
    setYamlError(null);
    setEditorMode('yaml');
  };

  // Sync YAML -> form state when switching to visual mode
  const switchToVisual = () => {
    const parsed = yamlToAutomation(yamlText);
    if (!parsed) {
      setYamlError('Invalid YAML syntax');
      return;
    }
    if (parsed.name !== undefined) setName(parsed.name);
    if (parsed.group !== undefined) setGroup(parsed.group ?? '');
    if (parsed.description !== undefined) setDescription(parsed.description ?? '');
    if (parsed.enabled !== undefined) setEnabled(parsed.enabled);
    if (parsed.mode !== undefined) setMode((parsed.mode as AutomationMode) ?? 'single');
    if (parsed.triggers) setTriggers(parsed.triggers);
    if (parsed.conditions) setConditions(parsed.conditions);
    else setConditions([]);
    if (parsed.actions) setActions(parsed.actions);
    if (isNew && parsed.id) setAutomationId(parsed.id);
    setYamlError(null);
    setEditorMode('visual');
  };

  const handleToggleMode = () => {
    if (editorMode === 'visual') {
      switchToYaml();
    } else {
      switchToVisual();
    }
  };

  const handleSave = async () => {
    setError(null);

    // If in YAML mode, parse YAML first
    if (editorMode === 'yaml') {
      const parsed = yamlToAutomation(yamlText);
      if (!parsed) {
        setError('Invalid YAML — fix syntax errors before saving');
        return;
      }
      if (parsed.name !== undefined) setName(parsed.name);
      if (parsed.group !== undefined) setGroup(parsed.group ?? '');
      if (parsed.description !== undefined) setDescription(parsed.description ?? '');
      if (parsed.enabled !== undefined) setEnabled(parsed.enabled);
      if (parsed.mode !== undefined) setMode((parsed.mode as AutomationMode) ?? 'single');
      if (parsed.triggers) setTriggers(parsed.triggers);
      if (parsed.conditions) setConditions(parsed.conditions);
      if (parsed.actions) setActions(parsed.actions);
      if (isNew && parsed.id) setAutomationId(parsed.id);

      // Use parsed values directly for save
      const saveName = parsed.name ?? name;
      const saveGroup = parsed.group ?? group;
      const saveDescription = parsed.description ?? description;
      const saveEnabled = parsed.enabled ?? enabled;
      const saveMode = (parsed.mode as AutomationMode) ?? mode;
      const saveTriggers = parsed.triggers ?? triggers;
      const saveConditions = parsed.conditions ?? conditions;
      const saveActions = parsed.actions ?? actions;
      const saveId = (isNew && parsed.id) ? parsed.id : automationId;

      setSaving(true);
      try {
        if (isNew) {
          if (!saveId.trim()) { setError('ID is required'); setSaving(false); return; }
          if (!saveName.trim()) { setError('Name is required'); setSaving(false); return; }
          await createAutomation({
            id: saveId.trim(),
            name: saveName.trim(),
            group: saveGroup || undefined,
            description: saveDescription || undefined,
            enabled: saveEnabled,
            mode: saveMode,
            triggers: saveTriggers,
            conditions: saveConditions,
            actions: saveActions,
          });
        } else {
          await updateAutomation(id, {
            name: saveName.trim(),
            group: saveGroup || null,
            description: saveDescription || null,
            enabled: saveEnabled,
            mode: saveMode,
            triggers: saveTriggers,
            conditions: saveConditions,
            actions: saveActions,
          });
        }
        router.push('/settings/automations');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Visual mode save
    setSaving(true);
    try {
      if (isNew) {
        if (!automationId.trim()) { setError('ID is required'); setSaving(false); return; }
        if (!name.trim()) { setError('Name is required'); setSaving(false); return; }
        await createAutomation({
          id: automationId.trim(),
          name: name.trim(),
          group: group || undefined,
          description: description || undefined,
          enabled,
          mode,
          triggers,
          conditions,
          actions,
        });
        router.push('/settings/automations');
      } else {
        await updateAutomation(id, {
          name: name.trim(),
          group: group || null,
          description: description || null,
          enabled,
          mode,
          triggers,
          conditions,
          actions,
        });
        router.push('/settings/automations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addTrigger = () => setTriggers([...triggers, { type: 'manual' }]);
  const addCondition = () => setConditions([...conditions, { type: 'device_state', deviceId: '', attribute: '', op: 'eq', value: '' }]);
  const addAction = () => setActions([...actions, { type: 'device_command', deviceId: '', command: { type: 'light', deviceId: '', action: 'turn_on' } }]);

  const moveAction = (from: number, to: number) => {
    const next = [...actions];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setActions(next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/settings/automations')} className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)]">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">{isNew ? 'New Automation' : 'Edit Automation'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Visual / YAML toggle */}
          <div
            className="flex rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <button
              onClick={() => editorMode === 'yaml' ? switchToVisual() : undefined}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: editorMode === 'visual' ? 'var(--color-accent)' : 'transparent',
                color: editorMode === 'visual' ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              <LayoutList className="h-3 w-3" />
              Visual
            </button>
            <button
              onClick={() => editorMode === 'visual' ? switchToYaml() : undefined}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: editorMode === 'yaml' ? 'var(--color-accent)' : 'transparent',
                color: editorMode === 'yaml' ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              <Code2 className="h-3 w-3" />
              YAML
            </button>
          </div>

          {!isNew && (
            <button
              onClick={() => triggerAutomation(id)}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium border transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              <Play className="h-3 w-3" />
              Test Run
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </button>
        </div>
      </div>

      {error && (
        <Card className="!p-3 border-[var(--color-danger)]">
          <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>
        </Card>
      )}

      {yamlError && (
        <Card className="!p-3 border-[var(--color-danger)]">
          <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{yamlError}</p>
        </Card>
      )}

      {/* YAML Editor Mode */}
      {editorMode === 'yaml' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
          </div>
        }>
          <div className="space-y-2">
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              Edit the automation as YAML. Device IDs will auto-complete after typing <code>deviceId:</code>. Invalid device IDs are underlined in red.
            </p>
            <AutomationYamlEditor
              value={yamlText}
              onChange={setYamlText}
              devices={devices}
            />
          </div>
        </Suspense>
      )}

      {/* Visual Editor Mode */}
      {editorMode === 'visual' && (
        <>
          {/* Metadata */}
          <Card className="space-y-3">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />
              Details
            </h2>
            {isNew && (
              <div>
                <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>ID (unique slug)</label>
                <input
                  type="text"
                  value={automationId}
                  onChange={(e) => setAutomationId(e.target.value.replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="sunset-lights"
                  className="w-full rounded border px-2 py-1.5 text-xs mt-0.5"
                  style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Turn on lights at sunset"
                  className="w-full rounded border px-2 py-1.5 text-xs mt-0.5"
                  style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Group</label>
                <input
                  type="text"
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  placeholder="Lighting"
                  list="group-list"
                  className="w-full rounded border px-2 py-1.5 text-xs mt-0.5"
                  style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
                <datalist id="group-list">
                  {groups.map(g => <option key={g} value={g} />)}
                </datalist>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded border px-2 py-1.5 text-xs mt-0.5"
                style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Enabled</label>
                <button
                  onClick={() => setEnabled(!enabled)}
                  className="relative h-5 w-9 rounded-full transition-colors"
                  style={{ backgroundColor: enabled ? 'var(--color-accent)' : 'var(--color-bg-hover)' }}
                >
                  <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform" style={{ left: enabled ? '18px' : '2px' }} />
                </button>
              </div>
              <div>
                <label className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Mode</label>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as AutomationMode)}
                  options={[
                    { value: 'single', label: 'Single (skip if running)' },
                    { value: 'restart', label: 'Restart (cancel & rerun)' },
                    { value: 'queued', label: 'Queued (max 10)' },
                    { value: 'parallel', label: 'Parallel (max 10)' },
                  ]}
                  size="xs"
                  className="ml-2"
                />
              </div>
            </div>
          </Card>

          {/* Triggers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Triggers</h2>
              <button onClick={addTrigger} className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-accent)' }}>
                <Plus className="h-3 w-3" /> Add Trigger
              </button>
            </div>
            {triggers.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No triggers — add one to make this automation fire automatically.</p>
            )}
            {triggers.map((t, i) => (
              <TriggerEditor
                key={i}
                trigger={t}
                onChange={(updated) => setTriggers(triggers.map((old, j) => j === i ? updated : old))}
                onRemove={() => setTriggers(triggers.filter((_, j) => j !== i))}
                devices={devices}
              />
            ))}
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Conditions <span className="text-[10px] font-normal" style={{ color: 'var(--color-text-muted)' }}>(optional)</span></h2>
              <button onClick={addCondition} className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-accent)' }}>
                <Plus className="h-3 w-3" /> Add Condition
              </button>
            </div>
            {conditions.map((c, i) => (
              <ConditionEditor
                key={i}
                condition={c}
                onChange={(updated) => setConditions(conditions.map((old, j) => j === i ? updated : old))}
                onRemove={() => setConditions(conditions.filter((_, j) => j !== i))}
                devices={devices}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Actions</h2>
              <button onClick={addAction} className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-accent)' }}>
                <Plus className="h-3 w-3" /> Add Action
              </button>
            </div>
            {actions.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No actions — add at least one action.</p>
            )}
            {actions.map((a, i) => (
              <ActionEditor
                key={i}
                action={a}
                index={i}
                onChange={(updated) => setActions(actions.map((old, j) => j === i ? updated : old))}
                onRemove={() => setActions(actions.filter((_, j) => j !== i))}
                onMoveUp={() => moveAction(i, i - 1)}
                onMoveDown={() => moveAction(i, i + 1)}
                isFirst={i === 0}
                isLast={i === actions.length - 1}
                devices={devices}
              />
            ))}
          </div>
        </>
      )}

      {/* Execution History */}
      {!isNew && (
        <ExecutionHistorySection automationId={id} />
      )}
    </div>
  );
}
