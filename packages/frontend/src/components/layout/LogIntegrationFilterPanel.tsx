'use client';

import type { CSSProperties } from 'react';
import { KNOWN_INTEGRATIONS } from '@ha/shared';
import { SYSTEM_LOG_SOURCE_ID } from '@/lib/terminal-constants';

/** Non-integration log sources that appear in the filter panel. */
const EXTRA_SOURCES = [
  { id: 'software-update', name: 'Software Update' },
  { id: 'cameras',         name: 'Cameras' },
] as const;

const ALL_SOURCE_IDS = [
  SYSTEM_LOG_SOURCE_ID,
  ...EXTRA_SOURCES.map((s) => s.id),
  ...KNOWN_INTEGRATIONS.map((i) => i.id),
];

const PANEL_W = 220;

export function logIntegrationFilterPanelWidthPx(): number {
  return PANEL_W;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** `null` = show all sources (no filter) */
  whitelist: string[] | null;
  setWhitelist: (v: string[] | null) => void;
  fixedStyle: CSSProperties;
  isLcars: boolean;
}

export function LogIntegrationFilterPanel({
  open,
  onClose,
  whitelist,
  setWhitelist,
  fixedStyle,
  isLcars,
}: Props) {
  if (!open) return null;

  const selected = whitelist ?? [];
  const filterActive = whitelist !== null;

  const toggle = (id: string) => {
    if (whitelist === null) {
      setWhitelist(ALL_SOURCE_IDS.filter((x) => x !== id));
      return;
    }
    if (whitelist.includes(id)) {
      setWhitelist(whitelist.filter((x) => x !== id));
    } else {
      setWhitelist([...whitelist, id]);
    }
  };

  const selectAll = () => {
    setWhitelist([...ALL_SOURCE_IDS]);
  };

  const clearFilter = () => {
    setWhitelist(null);
    onClose();
  };

  return (
    <div
      className="flex flex-col border-r overflow-hidden z-[48]"
      style={{
        ...fixedStyle,
        width: PANEL_W,
        backgroundColor: 'var(--color-bg)',
        borderColor: 'var(--color-border)',
      }}
      role="dialog"
      aria-label="Filter log by integration"
    >
      <div
        className="flex items-center justify-between shrink-0 border-b px-2 py-2"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span
          className={isLcars ? 'font-mono text-[9px] font-bold uppercase tracking-wide' : 'text-xs font-semibold'}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Log sources
        </span>
        <button
          type="button"
          onClick={onClose}
          className={isLcars ? 'font-mono text-[10px] uppercase' : 'text-xs'}
          style={{ color: 'var(--color-text-muted)' }}
        >
          Close
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 shrink-0 px-2 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <button
          type="button"
          onClick={selectAll}
          className={isLcars ? 'font-mono text-[8px] px-2 py-1' : 'text-[11px] px-2 py-1 rounded-md'}
          style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
        >
          Select all
        </button>
        <button
          type="button"
          onClick={clearFilter}
          className={isLcars ? 'font-mono text-[8px] px-2 py-1' : 'text-[11px] px-2 py-1 rounded-md'}
          style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-accent)' }}
        >
          All sources
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        <label
          className={`flex items-center gap-2 cursor-pointer ${isLcars ? 'text-[9px] font-mono' : 'text-xs'}`}
          style={{ color: 'var(--color-text)' }}
        >
          <input
            type="checkbox"
            checked={filterActive ? selected.includes(SYSTEM_LOG_SOURCE_ID) : true}
            onChange={() => toggle(SYSTEM_LOG_SOURCE_ID)}
            className="rounded shrink-0 accent-[var(--color-accent)]"
          />
          <span>System (no integration tag)</span>
        </label>
        {EXTRA_SOURCES.map((src) => (
          <label
            key={src.id}
            className={`flex items-center gap-2 cursor-pointer ${isLcars ? 'text-[9px] font-mono' : 'text-xs'}`}
            style={{ color: 'var(--color-text)' }}
          >
            <input
              type="checkbox"
              checked={filterActive ? selected.includes(src.id) : true}
              onChange={() => toggle(src.id)}
              className="rounded shrink-0 accent-[var(--color-accent)]"
            />
            <span className="truncate">{src.name}</span>
          </label>
        ))}
        {KNOWN_INTEGRATIONS.map((info) => (
          <label
            key={info.id}
            className={`flex items-center gap-2 cursor-pointer ${isLcars ? 'text-[9px] font-mono' : 'text-xs'}`}
            style={{ color: 'var(--color-text)' }}
          >
            <input
              type="checkbox"
              checked={filterActive ? selected.includes(info.id) : true}
              onChange={() => toggle(info.id)}
              className="rounded shrink-0 accent-[var(--color-accent)]"
            />
            <span className="truncate">{info.name}</span>
          </label>
        ))}
      </div>
      {filterActive && selected.length === 0 ? (
        <p className="shrink-0 px-2 pb-2 text-[10px]" style={{ color: 'var(--color-danger)' }}>
          No sources selected — log will be empty.
        </p>
      ) : null}
    </div>
  );
}
