'use client';

import { ChevronRight } from 'lucide-react';
import { formatFieldPath } from '@/lib/object-path';

function humanizeKey(key: string): string {
  if (/^\d+$/.test(key)) return `#${key}`;
  const spaced = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function PrimitiveDisplay({ value }: { value: string | number | boolean | null }) {
  if (value === null) {
    return <span className="italic text-xs" style={{ color: 'var(--color-text-muted)' }}>null</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <span
        className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
        style={{
          backgroundColor: value ? 'color-mix(in srgb, var(--color-success) 22%, transparent)' : 'var(--color-bg-hover)',
          color: value ? 'var(--color-success)' : 'var(--color-text-muted)',
        }}
      >
        {value ? 'True' : 'False'}
      </span>
    );
  }
  if (typeof value === 'number') {
    return (
      <span className="tabular-nums text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        {Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </span>
    );
  }
  const s = value;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = Date.parse(s);
    if (!Number.isNaN(d)) {
      return (
        <span className="text-sm" title={s}>
          {new Date(d).toLocaleString()}
        </span>
      );
    }
  }
  const show = s.length > 120 ? `${s.slice(0, 120)}…` : s;
  return (
    <span className="text-sm break-all" style={{ color: 'var(--color-text-secondary)' }} title={s}>
      {show}
    </span>
  );
}

function LeafRow({
  path,
  value,
  onFieldSelect,
}: {
  path: string[];
  value: string | number | boolean | null;
  onFieldSelect: (path: string[], v: unknown) => void;
}) {
  const label = humanizeKey(path[path.length - 1]!);
  return (
    <button
      type="button"
      onClick={() => onFieldSelect(path, value)}
      className="flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </div>
        <div className="mt-0.5 font-mono text-[10px] opacity-60 truncate" title={formatFieldPath(path)}>
          {formatFieldPath(path)}
        </div>
      </div>
      <div className="shrink-0 max-w-[55%] text-right">
        <PrimitiveDisplay value={value} />
      </div>
    </button>
  );
}

function ObjectBlock({
  title,
  path,
  value,
  depth,
  onFieldSelect,
}: {
  title: string;
  path: string[];
  value: Record<string, unknown>;
  depth: number;
  onFieldSelect: (path: string[], v: unknown) => void;
}) {
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  return (
    <div
      className="rounded-lg border"
      style={{
        borderColor: 'var(--color-border)',
        marginLeft: depth > 0 ? '0.5rem' : 0,
        backgroundColor: depth % 2 === 0 ? 'var(--color-bg-card)' : 'var(--color-bg-secondary)',
      }}
    >
      <div
        className="flex items-center gap-1 border-b px-3 py-2 text-xs font-semibold"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
      >
        {depth > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
        {humanizeKey(title)}
        <span className="ml-auto font-normal opacity-50">{keys.length} keys</span>
      </div>
      <div className="space-y-1.5 p-2">
        {keys.map((k) => (
          <ValueNode key={path.concat(k).join('/')} propKey={k} path={path.concat(k)} value={value[k]} depth={depth + 1} onFieldSelect={onFieldSelect} />
        ))}
      </div>
    </div>
  );
}

function ArrayBlock({
  title,
  path,
  value,
  depth,
  onFieldSelect,
}: {
  title: string;
  path: string[];
  value: unknown[];
  depth: number;
  onFieldSelect: (path: string[], v: unknown) => void;
}) {
  return (
    <div
      className="rounded-lg border"
      style={{
        borderColor: 'var(--color-border)',
        marginLeft: depth > 0 ? '0.5rem' : 0,
        backgroundColor: depth % 2 === 0 ? 'var(--color-bg-card)' : 'var(--color-bg-secondary)',
      }}
    >
      <div
        className="flex items-center gap-1 border-b px-3 py-2 text-xs font-semibold"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
      >
        <ChevronRight className="h-3 w-3 opacity-50" />
        {humanizeKey(title)}
        <span className="ml-auto font-normal opacity-50">{value.length} items</span>
      </div>
      <div className="space-y-1.5 p-2">
        {value.map((item, i) => (
          <ValueNode
            key={path.concat(String(i)).join('/')}
            propKey={String(i)}
            path={path.concat(String(i))}
            value={item}
            depth={depth + 1}
            onFieldSelect={onFieldSelect}
          />
        ))}
      </div>
    </div>
  );
}

function ValueNode({
  propKey,
  path,
  value,
  depth,
  onFieldSelect,
}: {
  propKey: string;
  path: string[];
  value: unknown;
  depth: number;
  onFieldSelect: (path: string[], v: unknown) => void;
}) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return (
      <LeafRow
        path={path}
        value={value as string | number | boolean | null}
        onFieldSelect={onFieldSelect}
      />
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div
          className="rounded-md border px-3 py-2 text-xs italic"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          {humanizeKey(propKey)} — empty list
        </div>
      );
    }
    return (
      <ArrayBlock title={propKey} path={path} value={value} depth={depth} onFieldSelect={onFieldSelect} />
    );
  }

  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (Object.keys(o).length === 0) {
      return (
        <div
          className="rounded-md border px-3 py-2 text-xs italic"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          {humanizeKey(propKey)} — empty object
        </div>
      );
    }
    return <ObjectBlock title={propKey} path={path} value={o} depth={depth} onFieldSelect={onFieldSelect} />;
  }

  return (
    <div className="text-xs font-mono text-[var(--color-text-muted)]">
      {humanizeKey(propKey)}: unsupported type
    </div>
  );
}

/**
 * Renders every key in the device snapshot with a distinct control-style row or nested block.
 * Primitive leaves are clickable to open history in a sidebar.
 */
export function DeviceLiveStateTree({
  data,
  onFieldSelect,
}: {
  data: unknown;
  onFieldSelect: (path: string[], value: unknown) => void;
}) {
  if (data === null || typeof data !== 'object') {
    return (
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        No structured state
      </p>
    );
  }

  if (Array.isArray(data)) {
    return (
      <ArrayBlock title="Items" path={[]} value={data} depth={0} onFieldSelect={onFieldSelect} />
    );
  }

  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  return (
    <div className="space-y-2">
      {keys.map((k) => (
        <ValueNode key={k} propKey={k} path={[k]} value={obj[k]} depth={0} onFieldSelect={onFieldSelect} />
      ))}
    </div>
  );
}
