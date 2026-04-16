'use client';

// ---------------------------------------------------------------------------
// Small, uncontrolled-style field primitives for card-type form editors.
//
// Every input is uniform in appearance: same padding, same tokenized border,
// same label treatment. A per-card form composes these — it does not roll its
// own inputs so that a spacing or theme tweak here flows everywhere.
// ---------------------------------------------------------------------------

import { type ReactNode } from 'react';
import { token } from '@/lib/tokens';

const inputStyle = {
  background: 'var(--color-bg-secondary)',
  color: 'var(--color-text)',
  border: `1px solid ${token('--color-border')}`,
} as const;

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
    <label className="flex flex-col gap-0.5 text-xs" style={{ color: token('--color-text-muted') }}>
      {label && <span>{label}</span>}
      {children}
      {hint && (
        <span className="text-[10px]" style={{ color: token('--color-text-muted') }}>
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
      <input
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        className="rounded px-2 py-1 text-sm"
        style={inputStyle}
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
      <textarea
        value={value ?? ''}
        rows={rows}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="rounded px-2 py-1 font-mono text-xs"
        style={inputStyle}
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
      <input
        type="number"
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
        className="rounded px-2 py-1 text-sm"
        style={inputStyle}
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
    <label className="flex items-center gap-2 text-xs" style={{ color: token('--color-text-muted') }}>
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
      {hint && <span style={{ opacity: 0.7 }}>— {hint}</span>}
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
      <div
        className="flex flex-wrap gap-1 rounded p-0.5"
        style={{ background: token('--color-bg-secondary') }}
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="rounded px-2 py-0.5 text-xs"
              style={{
                background: selected ? token('--color-accent') : 'transparent',
                color: selected ? token('--color-bg') : token('--color-text-muted'),
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

/** Entity-id input with a light "looks like an id" hint. Datalist-free
 *  because the DeviceStore is too large to enumerate inline. */
export function EntityField({
  label,
  hint,
  value,
  onChange,
  placeholder = 'integration.entry1.device.id',
}: {
  label?: string;
  hint?: string;
  value: string | undefined;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <FieldShell label={label ?? 'Entity'} hint={hint}>
      <input
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded px-2 py-1 font-mono text-xs"
        style={inputStyle}
      />
    </FieldShell>
  );
}

/** Comma-separated string list <-> string[]. */
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
  return (
    <FieldShell label={label ?? 'Entities'} hint={minItems > 0 ? `At least ${minItems}.` : undefined}>
      <div className="flex flex-col gap-1">
        {items.map((it, i) => (
          <div key={i} className="flex gap-1">
            <input
              type="text"
              value={it}
              onChange={(e) => {
                const next = items.slice();
                next[i] = e.target.value;
                onChange(next);
              }}
              className="flex-1 rounded px-2 py-1 font-mono text-xs"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              disabled={items.length <= minItems}
              className="rounded px-2 text-xs"
              style={{
                color: token('--color-danger'),
                opacity: items.length <= minItems ? 0.4 : 1,
              }}
              aria-label="Remove entity"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          className="self-start rounded px-2 py-0.5 text-[11px]"
          style={{
            background: token('--color-bg-secondary'),
            color: token('--color-text-muted'),
            border: `1px dashed ${token('--color-border')}`,
          }}
        >
          + Add entity
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
          className="text-[11px] uppercase tracking-wide"
          style={{ color: token('--color-text-muted') }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
