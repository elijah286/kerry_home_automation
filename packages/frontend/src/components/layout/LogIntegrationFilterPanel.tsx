'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { Search, X } from 'lucide-react';
import { KNOWN_INTEGRATIONS } from '@ha/shared';
import { SYSTEM_LOG_SOURCE_ID } from '@/lib/terminal-constants';

/** Non-integration log sources that appear in the filter panel. */
const EXTRA_SOURCES = [
  { id: 'software-update', name: 'Software Update' },
  { id: 'cameras',         name: 'Cameras' },
] as const;

interface SourceItem { id: string; name: string }

const ALL_SOURCES: SourceItem[] = [
  { id: SYSTEM_LOG_SOURCE_ID, name: 'System (no integration tag)' },
  ...EXTRA_SOURCES.map((s) => ({ id: s.id, name: s.name })),
  ...KNOWN_INTEGRATIONS.map((i) => ({ id: i.id, name: i.name })),
];

const ALL_SOURCE_IDS = ALL_SOURCES.map((s) => s.id);

const PANEL_W = 240;

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
  const [query, setQuery] = useState('');

  const selected = whitelist ?? [];
  const filterActive = whitelist !== null;

  const visibleSources = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_SOURCES;
    return ALL_SOURCES.filter(
      (s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    );
  }, [query]);

  if (!open) return null;

  const isChecked = (id: string) => (filterActive ? selected.includes(id) : true);

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

  const selectAll = () => setWhitelist([...ALL_SOURCE_IDS]);
  const clearFilter = () => {
    setWhitelist(null);
    onClose();
  };

  /** Select only the sources currently matching the search query (replaces the whitelist). */
  const onlyVisible = () => {
    if (visibleSources.length === 0) return;
    setWhitelist(visibleSources.map((s) => s.id));
  };
  /** Add all currently-visible sources to the existing selection. */
  const addVisible = () => {
    const ids = visibleSources.map((s) => s.id);
    if (whitelist === null) {
      setWhitelist(ids);
      return;
    }
    const set = new Set(whitelist);
    for (const id of ids) set.add(id);
    setWhitelist([...set]);
  };

  const selectedCount = filterActive ? selected.length : ALL_SOURCE_IDS.length;

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
      aria-label="Filter log by source"
    >
      <div
        className="flex items-center justify-between shrink-0 border-b px-2 py-2"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span
          className={isLcars ? 'font-mono text-[9px] font-bold uppercase tracking-wide' : 'text-xs font-semibold uppercase tracking-wide'}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Log sources
        </span>
        <span
          className={isLcars ? 'font-mono text-[9px]' : 'text-[10px]'}
          style={{ color: 'var(--color-text-muted)' }}
          aria-live="polite"
        >
          {selectedCount}/{ALL_SOURCE_IDS.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className={isLcars ? 'font-mono text-[10px] uppercase' : 'text-xs'}
          style={{ color: 'var(--color-text-muted)' }}
          aria-label="Close source filter"
        >
          Close
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 px-2 pt-2 pb-1">
        <div
          className="flex items-center gap-1.5 rounded-md border px-2"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
          }}
        >
          <Search className="h-3 w-3 shrink-0" style={{ color: 'var(--color-text-muted)' }} aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sources…"
            className="min-w-0 flex-1 bg-transparent py-1 text-[11px] outline-none placeholder:opacity-60"
            style={{ color: 'var(--color-text)' }}
            aria-label="Search sources"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="shrink-0 rounded p-0.5 hover:bg-white/10"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" style={{ color: 'var(--color-text-muted)' }} />
            </button>
          )}
        </div>
      </div>

      <div
        className="flex flex-wrap gap-1 shrink-0 px-2 pb-2 pt-1 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <button
          type="button"
          onClick={selectAll}
          className={isLcars ? 'font-mono text-[8px] px-2 py-1' : 'text-[10px] px-2 py-1 rounded-md'}
          style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
        >
          Select all
        </button>
        <button
          type="button"
          onClick={clearFilter}
          className={isLcars ? 'font-mono text-[8px] px-2 py-1' : 'text-[10px] px-2 py-1 rounded-md'}
          style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-accent)' }}
        >
          All sources
        </button>
        {query && visibleSources.length > 0 && (
          <>
            <button
              type="button"
              onClick={onlyVisible}
              className={isLcars ? 'font-mono text-[8px] px-2 py-1' : 'text-[10px] px-2 py-1 rounded-md'}
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
              title={`Show only the ${visibleSources.length} matching source${visibleSources.length === 1 ? '' : 's'}`}
            >
              Only ({visibleSources.length})
            </button>
            <button
              type="button"
              onClick={addVisible}
              className={isLcars ? 'font-mono text-[8px] px-2 py-1' : 'text-[10px] px-2 py-1 rounded-md'}
              style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
              title="Add all matching to selection"
            >
              + Add
            </button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {visibleSources.length === 0 ? (
          <div
            className={isLcars ? 'font-mono text-[9px] text-center py-4' : 'text-[11px] text-center py-4'}
            style={{ color: 'var(--color-text-muted)' }}
          >
            No sources match “{query}”.
          </div>
        ) : (
          visibleSources.map((src) => (
            <label
              key={src.id}
              className={`flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-white/[0.04] ${isLcars ? 'text-[10px] font-mono' : 'text-xs'}`}
              style={{ color: 'var(--color-text)' }}
            >
              <input
                type="checkbox"
                checked={isChecked(src.id)}
                onChange={() => toggle(src.id)}
                className="rounded shrink-0 accent-[var(--color-accent)]"
              />
              <span className="truncate">{src.name}</span>
            </label>
          ))
        )}
      </div>
      {filterActive && selected.length === 0 ? (
        <p className="shrink-0 px-2 pb-2 text-[10px]" style={{ color: 'var(--color-danger)' }}>
          No sources selected — log will be empty.
        </p>
      ) : null}
    </div>
  );
}
