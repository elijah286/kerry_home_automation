'use client';

// ---------------------------------------------------------------------------
// AlarmPanelCard — alarm control panel with PIN keypad.
//
// No AlarmState device type exists yet in this codebase; this card renders
// the canonical HA alarm panel UI (arm mode buttons + 10-digit keypad) and
// dispatches alarm commands against whatever generic device sits behind the
// `entity` id. When a real AlarmState lands, `extractArmState()` is the only
// hook that needs updating.
//
// The keypad collects digits locally and only sends them with the arm/disarm
// command — never exposed via props, never logged. The backend is expected
// to enforce rate-limits and reject bad PINs.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import type { AlarmPanelCard as AlarmPanelCardDescriptor, DeviceState } from '@ha/shared';
import { Shield, ShieldOff, Delete } from 'lucide-react';
import { useDevice } from '@/hooks/useDevice';
import { useCommand } from '@/hooks/useCommand';
import { token, severityVar } from '@/lib/tokens';
import { withEntityBoundary } from '../EntityBoundary';

type ArmKey = NonNullable<AlarmPanelCardDescriptor['states']>[number];
const ALL_STATES: { key: ArmKey; label: string }[] = [
  { key: 'arm_home',            label: 'Home' },
  { key: 'arm_away',            label: 'Away' },
  { key: 'arm_night',           label: 'Night' },
  { key: 'arm_vacation',        label: 'Vacation' },
  { key: 'arm_custom_bypass',   label: 'Bypass' },
];

export function AlarmPanelCard({ card }: { card: AlarmPanelCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(card.entity, device, (d) => <AlarmPanelBody card={card} device={d} />, {
    title: card.name,
  });
}

function AlarmPanelBody({ card, device }: { card: AlarmPanelCardDescriptor; device: DeviceState }) {
  const { send, isPending } = useCommand(device.id);
  const [code, setCode] = useState('');
  const armed = extractArmState(device);
  const label = card.name ?? device.displayName ?? device.name;

  const enabled = (card.states ?? ALL_STATES.map((s) => s.key));
  const visibleStates = ALL_STATES.filter((s) => enabled.includes(s.key));

  const onArm = (action: ArmKey | 'disarm') => {
    void send(action, { type: 'alarm', action, code: code || undefined })
      .finally(() => setCode(''));
  };

  const onDigit = (d: string) => setCode((c) => (c.length < 8 ? c + d : c));
  const onBack  = () => setCode((c) => c.slice(0, -1));

  const statusColor =
    armed === 'triggered' ? severityVar('critical')
      : armed === 'disarmed' ? token('--color-text-muted')
      : armed ? severityVar('success') : token('--color-text-muted');

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="alarm-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        <span
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
          style={{ color: statusColor, border: `1px solid ${statusColor}` }}
        >
          {armed === 'disarmed' || armed === null
            ? <ShieldOff className="h-3 w-3" />
            : <Shield className="h-3 w-3" />}
          {armed ?? 'unknown'}
        </span>
      </div>

      {/* PIN display */}
      <div
        className="flex h-8 items-center justify-center rounded-md text-sm font-mono tracking-widest"
        style={{
          background: token('--color-bg-hover'),
          color: token('--color-text'),
          border: `1px solid ${token('--color-border')}`,
        }}
        aria-label="PIN entry"
      >
        {code ? '•'.repeat(code.length) : <span style={{ color: token('--color-text-muted') }}>enter PIN</span>}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-1">
        {['1','2','3','4','5','6','7','8','9'].map((d) => (
          <KeypadButton key={d} label={d} onClick={() => onDigit(d)} />
        ))}
        <KeypadButton label={<Delete className="h-4 w-4" />} onClick={onBack} aria="backspace" />
        <KeypadButton label="0" onClick={() => onDigit('0')} />
        <KeypadButton label="C" onClick={() => setCode('')} />
      </div>

      {/* Arm + disarm */}
      <div className="flex flex-wrap gap-1">
        {visibleStates.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onArm(s.key)}
            disabled={isPending(s.key)}
            className="flex-1 rounded-md px-2 py-1 text-xs font-medium"
            style={{
              background: token('--color-bg-hover'),
              color: token('--color-text-secondary'),
              border: `1px solid ${token('--color-border')}`,
              opacity: isPending(s.key) ? 0.6 : 1,
            }}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onArm('disarm')}
          disabled={isPending('disarm')}
          className="flex-1 rounded-md px-2 py-1 text-xs font-medium"
          style={{
            background: severityVar('critical'),
            color: '#fff',
            opacity: isPending('disarm') ? 0.6 : 1,
          }}
        >
          Disarm
        </button>
      </div>
    </div>
  );
}

function KeypadButton({ label, onClick, aria }: {
  label: React.ReactNode;
  onClick: () => void;
  aria?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="flex h-10 items-center justify-center rounded-md text-base font-medium"
      style={{
        background: token('--color-bg-hover'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
    >
      {label}
    </button>
  );
}

function extractArmState(device: DeviceState): string | null {
  const d = device as unknown as Record<string, unknown>;
  if (typeof d.armState === 'string') return d.armState;
  if (typeof d.state === 'string') return d.state;
  return null;
}
