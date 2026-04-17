'use client';

// ---------------------------------------------------------------------------
// Small, uncontrolled-style field primitives for card-type form editors.
//
// Chrome-consistent: inputs use the shared <Input>/<Textarea> recipe from
// components/ui so a theme/spacing tweak there flows through every card form.
// ---------------------------------------------------------------------------

import { type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { Input, Textarea } from '@/components/ui/Input';
import { GhostIconButton } from '@/components/ui/Button';
import { DeviceAutocomplete } from '@/components/DeviceAutocomplete';
import { useDevices } from '@/hooks/useDevices';
import type { DeviceState } from '@ha/shared';

// Stable identity selector so useDevices can memoize correctly.
const ALL_DEVICES = (all: DeviceState[]) => all;

/** Label + helper wrapper used by every field primitive. */
export function FieldShell({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      {label && (
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--color-text-secondary, var(--color-text-muted))' }}
        >
          {label}
        </span>
      )}
      {children}
      {hint && (
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  hint?: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  placeholder?: string;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <Input
        type="text"
        size="sm"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  hint,
  value,
  onChange,
  rows = 4,
}: {
  label?: string;
  hint?: string;
  value: string | undefined;
  onChange: (next: string) => void;
  rows?: number;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <Textarea
        size="sm"
        mono
        value={value ?? ''}
        rows={rows}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}

export function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label?: string;
  hint?: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <Input
        type="number"
        size="sm"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') onChange(undefined);
          else {
            const n = Number(raw);
            if (Number.isFinite(n)) onChange(n);
          }
        }}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean | undefined;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text)' }}>
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span>{label}</span>
      {hint && (
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          — {hint}
        </span>
      )}
    </label>
  );
}

/**
 * Non-native select built from styled buttons (the codebase forbids native
 * <select> dropdowns). Collapses into a horizontal pill group so every option
 * is visible; callers pass at most ~6 options.
 */
export function SegmentedField<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label?: string;
  hint?: string;
  value: T | undefined;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: selected ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: selected ? '#fff' : 'var(--color-text)',
                border: '1px solid',
                borderColor: selected ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </FieldShell>
  );
}

/** Device picker with search-as-you-type. Backed by the live DeviceStore so
 *  users can find entities by friendly name OR id, without memorizing the
 *  `integration.entry.device.id` shape. */
export function EntityField({
  label,
  hint,
  value,
  onChange,
  placeholder = 'Search devices…',
  deviceTypes,
}: {
  label?: string;
  hint?: string;
  value: string | undefined;
  onChange: (next: string) => void;
  placeholder?: string;
  /** When provided, only devices whose `type` is in this list are shown.
   *  This keeps the picker contextual — e.g. a thermostat card should only
   *  offer climate devices, not light switches. */
  deviceTypes?: string[];
}) {
  const allDevices = useDevices(ALL_DEVICES);
  const devices = deviceTypes
    ? allDevices.filter((d) => deviceTypes.includes(d.type))
    : allDevices;
  return (
    <FieldShell label={label ?? 'Entity'} hint={hint}>
      <DeviceAutocomplete
        value={value ?? ''}
        onChange={onChange}
        devices={devices}
        placeholder={placeholder}
      />
    </FieldShell>
  );
}

/** Repeating list of entity-id strings — each row is a search-as-you-type
 *  device picker. */
export function EntityListField({
  label,
  value,
  onChange,
  minItems = 0,
}: {
  label?: string;
  value: string[] | undefined;
  onChange: (next: string[]) => void;
  minItems?: number;
}) {
  const items = value ?? [];
  const devices = useDevices(ALL_DEVICES);
  return (
    <FieldShell label={label ?? 'Entities'} hint={minItems > 0 ? `At least ${minItems}.` : undefined}>
      <div className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="flex-1">
              <DeviceAutocomplete
                value={it}
                onChange={(v) => {
                  const next = items.slice();
                  next[i] = v;
                  onChange(next);
                }}
                devices={devices}
              />
            </div>
            <GhostIconButton
              icon={X}
              tone="danger"
              aria-label="Remove entity"
              disabled={items.length <= minItems}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
          style={{
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text)',
            border: '1px dashed var(--color-border)',
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add entity
        </button>
      </div>
    </FieldShell>
  );
}

// -- Section wrapper -------------------------------------------------------

export function FieldGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {title && (
        <div
          className="text-[11px] font-medium uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
