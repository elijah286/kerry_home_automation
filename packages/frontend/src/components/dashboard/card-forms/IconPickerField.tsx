'use client';

// ---------------------------------------------------------------------------
// IconPickerField — the dashboard editor's icon chooser.
//
// Replaces the old free-text "mdi:* or emoji" input. Why it exists:
//
//   - The old field produced broken glyphs for anything the renderer couldn't
//     resolve (and full-colour bitmaps when it could). Users had no way to
//     discover what names worked.
//   - We now standardise on lucide's ~1300 outline icons (see lib/icons).
//     Giving users a searchable, categorised grid keeps dashboards visually
//     consistent without constraining them to a hand-picked shortlist.
//
// The picker is a popover, not an inline grid: card forms are dense and the
// full set would overwhelm them. Inside the popover:
//
//   - a search box that matches icon name substrings (case-insensitive)
//   - category filters driven by ICON_GROUPS (the same regexes the weather
//     mapping uses, so "home" shows Home, HomeAssistant, etc.)
//   - a virtualised-feeling grid: we cap at 600 results to keep scrolling
//     snappy without shipping react-window. Users narrow with search.
//   - a "None" option so card.icon can be cleared
//
// The surfaced value is always a canonical lucide PascalCase name. HA/MDI
// aliases keep resolving at render time via resolveIcon(), so existing
// dashboards don't need rewriting.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { IconGlyph } from '@/lib/icons/IconGlyph';
import { ICON_NAMES, ICON_GROUPS, resolveIcon } from '@/lib/icons/registry';
import { token } from '@/lib/tokens';
import { FieldShell } from './fields';

// Cap on rendered icons per query. 600 keeps the grid responsive; users
// typically type a few characters to narrow further.
const MAX_RENDER = 600;

export function IconPickerField({
  label = 'Icon',
  hint,
  value,
  onChange,
}: {
  label?: string;
  hint?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState<string>('all');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const group = ICON_GROUPS.find((g) => g.id === groupId);
    const out: string[] = [];
    for (const name of ICON_NAMES) {
      if (group && !group.match.test(name)) continue;
      if (q && !name.toLowerCase().includes(q)) continue;
      out.push(name);
      if (out.length >= MAX_RENDER) break;
    }
    return out;
  }, [query, groupId]);

  // Resolve the currently-chosen value so we can show it in the trigger.
  // The value may be an alias like "mdi:home"; resolveIcon handles that.
  const hasValue = Boolean(value && resolveIcon(value));

  return (
    <FieldShell label={label} hint={hint}>
      <div className="relative" ref={popoverRef}>
        {/* Trigger — reads like an input field so it fits alongside TextField */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm"
          style={{
            background: token('--color-bg-secondary'),
            color: token('--color-text'),
            border: `1px solid ${token('--color-border')}`,
          }}
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{
              background: token('--color-bg'),
              color: hasValue ? token('--color-text') : token('--color-text-muted'),
            }}
          >
            <IconGlyph name={value} size={16} />
          </span>
          <span className="flex-1 truncate" style={{ color: hasValue ? token('--color-text') : token('--color-text-muted') }}>
            {value || 'Choose an icon…'}
          </span>
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(undefined);
                }
              }}
              className="rounded p-0.5"
              style={{ color: token('--color-text-muted') }}
              aria-label="Clear icon"
            >
              <X size={14} />
            </span>
          )}
        </button>

        {open && (
          <div
            className="absolute z-20 mt-1 w-[360px] max-w-[90vw] rounded-md shadow-lg"
            style={{
              background: token('--color-bg-card'),
              color: token('--color-text'),
              border: `1px solid ${token('--color-border')}`,
            }}
          >
            {/* Search */}
            <div className="p-2" style={{ borderBottom: `1px solid ${token('--color-border')}` }}>
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search icons…"
                className="w-full rounded px-2 py-1.5 text-sm outline-none"
                style={{
                  background: token('--color-bg-secondary'),
                  color: token('--color-text'),
                  border: `1px solid ${token('--color-border')}`,
                }}
              />
            </div>

            {/* Category chips */}
            <div
              className="flex flex-wrap gap-1 p-2"
              style={{ borderBottom: `1px solid ${token('--color-border')}` }}
            >
              <CategoryChip
                active={groupId === 'all'}
                onClick={() => setGroupId('all')}
                label="All"
              />
              {ICON_GROUPS.map((g) => (
                <CategoryChip
                  key={g.id}
                  active={groupId === g.id}
                  onClick={() => setGroupId(g.id)}
                  label={g.label}
                />
              ))}
            </div>

            {/* Grid — fixed height, scrolls. Grid of 8 columns @ 360px trigger width. */}
            <div className="max-h-[280px] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div
                  className="py-8 text-center text-xs"
                  style={{ color: token('--color-text-muted') }}
                >
                  No icons match.
                </div>
              ) : (
                <div className="grid grid-cols-8 gap-1">
                  {filtered.map((name) => {
                    const selected = name === value;
                    return (
                      <button
                        key={name}
                        type="button"
                        title={name}
                        onClick={() => {
                          onChange(name);
                          setOpen(false);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded"
                        style={{
                          background: selected ? token('--color-accent') : 'transparent',
                          color: selected ? '#fff' : token('--color-text'),
                          border: selected ? 'none' : `1px solid transparent`,
                        }}
                      >
                        <IconGlyph name={name} size={18} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between px-2 py-1.5 text-[11px]"
              style={{
                borderTop: `1px solid ${token('--color-border')}`,
                color: token('--color-text-muted'),
              }}
            >
              <span>
                {filtered.length >= MAX_RENDER
                  ? `Showing first ${MAX_RENDER} — refine search`
                  : `${filtered.length} icon${filtered.length === 1 ? '' : 's'}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
                className="rounded px-1.5 py-0.5"
                style={{ color: token('--color-text-muted') }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </FieldShell>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: active ? token('--color-accent') : token('--color-bg-secondary'),
        color: active ? '#fff' : token('--color-text-secondary'),
        border: `1px solid ${active ? 'transparent' : token('--color-border')}`,
      }}
    >
      {label}
    </button>
  );
}
