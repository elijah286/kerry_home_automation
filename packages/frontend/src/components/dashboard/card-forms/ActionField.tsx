'use client';

// ---------------------------------------------------------------------------
// Subform for an `Action` descriptor — used by any card with tapAction/
// holdAction/doubleTapAction. Matches the Zod `actionSchema` discriminated
// union in @ha/shared: none | toggle | more-info | navigate | command |
// fire-helper.
// ---------------------------------------------------------------------------

import type { Action } from '@ha/shared';
import { EntityField, SegmentedField, TextField, FieldShell } from './fields';
import { token } from '@/lib/tokens';

const ACTION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'toggle', label: 'Toggle' },
  { value: 'more-info', label: 'More info' },
  { value: 'navigate', label: 'Navigate' },
  { value: 'command', label: 'Command' },
  { value: 'fire-helper', label: 'Fire helper' },
] as const;

const HELPER_OP_OPTIONS = [
  { value: 'press', label: 'press' },
  { value: 'toggle', label: 'toggle' },
  { value: 'increment', label: 'increment' },
  { value: 'decrement', label: 'decrement' },
  { value: 'reset', label: 'reset' },
  { value: 'start', label: 'start' },
  { value: 'pause', label: 'pause' },
  { value: 'cancel', label: 'cancel' },
] as const;

type ActionType = Action['type'];

function defaultForType(type: ActionType): Action {
  switch (type) {
    case 'none': return { type: 'none' };
    case 'toggle': return { type: 'toggle' };
    case 'more-info': return { type: 'more-info' };
    case 'navigate': return { type: 'navigate', path: '/' };
    case 'command': return { type: 'command', deviceId: '', command: '' };
    case 'fire-helper': return { type: 'fire-helper', helperId: '' };
  }
}

export function ActionField({
  label,
  value,
  onChange,
  clearable = false,
}: {
  label: string;
  value: Action | undefined;
  onChange: (next: Action | undefined) => void;
  /** Show a "none" / unset affordance for optional hold/double-tap actions. */
  clearable?: boolean;
}) {
  const current = value ?? { type: 'none' };

  return (
    <FieldShell label={label}>
      <div
        className="flex flex-col gap-2 rounded p-2"
        style={{
          background: token('--color-bg-secondary'),
          border: `1px solid ${token('--color-border')}`,
        }}
      >
        <SegmentedField<ActionType>
          value={current.type}
          onChange={(t) => onChange(defaultForType(t))}
          options={ACTION_OPTIONS}
        />

        {current.type === 'toggle' && (
          <EntityField
            label="Target entity (optional)"
            hint="Defaults to the card's primary entity."
            value={current.entity}
            onChange={(entity) =>
              onChange({ type: 'toggle', entity: entity || undefined })
            }
          />
        )}

        {current.type === 'more-info' && (
          <EntityField
            label="Target entity (optional)"
            value={current.entity}
            onChange={(entity) =>
              onChange({ type: 'more-info', entity: entity || undefined })
            }
          />
        )}

        {current.type === 'navigate' && (
          <TextField
            label="Path"
            placeholder="/dashboards/garage"
            value={current.path}
            onChange={(path) => onChange({ type: 'navigate', path: path ?? '' })}
          />
        )}

        {current.type === 'command' && (
          <>
            <EntityField
              label="Device id"
              value={current.deviceId}
              onChange={(deviceId) =>
                onChange({
                  type: 'command',
                  deviceId,
                  command: current.command,
                  params: current.params,
                })
              }
            />
            <TextField
              label="Command"
              placeholder="set_brightness"
              value={current.command}
              onChange={(command) =>
                onChange({
                  type: 'command',
                  deviceId: current.deviceId,
                  command: command ?? '',
                  params: current.params,
                })
              }
            />
          </>
        )}

        {current.type === 'fire-helper' && (
          <>
            <TextField
              label="Helper id"
              placeholder="helpers.guest_mode"
              value={current.helperId}
              onChange={(helperId) =>
                onChange({
                  type: 'fire-helper',
                  helperId: helperId ?? '',
                  op: current.op,
                })
              }
            />
            <SegmentedField
              label="Op (optional)"
              value={current.op}
              onChange={(op) =>
                onChange({ type: 'fire-helper', helperId: current.helperId, op })
              }
              options={HELPER_OP_OPTIONS}
            />
          </>
        )}

        {clearable && value !== undefined && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="self-start text-[11px] underline"
            style={{ color: token('--color-text-muted') }}
          >
            Clear action
          </button>
        )}
      </div>
    </FieldShell>
  );
}
