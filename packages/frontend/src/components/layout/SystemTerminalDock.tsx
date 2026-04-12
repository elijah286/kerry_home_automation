'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { X, AlertTriangle, Info, AlertOctagon, ListTree, Braces } from 'lucide-react';
import { useTheme } from '@/providers/ThemeProvider';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { TERMINAL_PANEL_HEIGHT, useSystemTerminal, type TerminalLogFilter } from '@/providers/SystemTerminalProvider';
import { formatLogPrimaryLine } from '@/lib/logDisplay';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

type LogLevelLabel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  ts: number;
  level: LogLevelLabel;
  msg: string;
  context?: Record<string, unknown>;
}

function matchesFilter(level: LogLevelLabel, filter: TerminalLogFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'info') return level === 'trace' || level === 'debug' || level === 'info';
  if (filter === 'warn') return level === 'warn';
  if (filter === 'error') return level === 'error' || level === 'fatal';
  return true;
}

function levelStyle(level: LogLevelLabel): string {
  if (level === 'error' || level === 'fatal') return 'text-red-400';
  if (level === 'warn') return 'text-amber-300';
  if (level === 'debug' || level === 'trace') return 'opacity-70';
  return '';
}

const LEVEL_BADGE: Record<LogLevelLabel, string> = {
  trace: 'T',
  debug: 'D',
  info: 'I',
  warn: 'W',
  error: 'E',
  fatal: 'F',
};

const FILTER_OPTIONS: { id: TerminalLogFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warnings' },
  { id: 'error', label: 'Errors' },
];

/** LCARS bottom chrome (~footer bar + gap); keeps terminal above the frame footer */
const LCARS_BOTTOM_CHROME = 32;

export function SystemTerminalDock({
  sidebarOffsetPx,
  onClose,
  placement = 'bottom',
  panelHeightPx = TERMINAL_PANEL_HEIGHT,
}: {
  sidebarOffsetPx: number;
  onClose: () => void;
  /** `top` = LCARS: fixed under top edge, above breadcrumb belt (left offset = elbow width) */
  placement?: 'bottom' | 'top';
  /** LCARS top dock: match frame status band (e.g. ~20vh) */
  panelHeightPx?: number;
}) {
  const { activeTheme } = useTheme();
  const isMdUp = useMediaQuery('(min-width: 768px)');
  const { logFilter: filter, setLogFilter: setFilter } = useSystemTerminal();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  /** When false (default), hide structured context JSON — only level + message stay prominent. */
  const [showDetails, setShowDetails] = useState(false);
  const [connected, setConnected] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickBottomRef = useRef(true);

  // Initial snapshot
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/system/logs`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { entries: LogEntry[] }) => {
        if (!cancelled) setEntries(data.entries ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // SSE for live lines
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/system/logs/stream`, { withCredentials: true });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener('message', (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as { type?: string; entry?: LogEntry };
        if (parsed.type === 'entry' && parsed.entry) {
          setEntries((prev) => {
            const next = [...prev, parsed.entry!];
            if (next.length > 1200) next.splice(0, next.length - 1200);
            return next;
          });
        }
      } catch { /* ignore */ }
    });
    return () => {
      es.close();
    };
  }, []);

  const filtered = useMemo(
    () => entries.filter((e) => matchesFilter(e.level, filter)),
    [entries, filter],
  );

  useEffect(() => {
    if (!stickBottomRef.current || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [filtered]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stickBottomRef.current = nearBottom;
  }, []);

  const bottomPx =
    placement === 'bottom' && activeTheme === 'lcars'
      ? LCARS_BOTTOM_CHROME
      : placement === 'bottom'
        ? isMdUp
          ? 0
          : 64
        : undefined;

  const isLCARS = activeTheme === 'lcars';

  return (
    <div
      className={clsx(
        'fixed z-[45] flex flex-col shadow-2xl',
        placement === 'top' ? 'border-b' : 'right-0 border-t',
      )}
      style={{
        left: sidebarOffsetPx,
        right: 0,
        height: panelHeightPx,
        ...(placement === 'top'
          ? { top: 0, bottom: 'auto' }
          : { bottom: bottomPx ?? 0, top: 'auto' }),
        backgroundColor: 'var(--color-bg-card)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Header — filters */}
      <div
        className={clsx(
          'flex shrink-0 items-center border-b',
          isLCARS ? 'gap-1 px-2 py-1' : 'gap-2 px-3 py-2',
        )}
        style={{ borderColor: 'var(--color-border)' }}
      >
        {!isLCARS && <ListTree className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />}
        <span
          className={clsx(
            'shrink-0 font-semibold uppercase tracking-wide',
            isLCARS ? 'font-mono text-[8px] leading-none' : 'text-xs',
          )}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          System terminal
        </span>
        <div
          className={clsx(
            'flex flex-1 flex-wrap items-center justify-center sm:justify-start',
            isLCARS ? 'gap-1' : 'gap-1.5',
          )}
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={clsx(
                  'font-medium transition-colors',
                  isLCARS
                    ? 'rounded-none px-2 py-0.5 font-mono text-[7px] font-bold uppercase tracking-tight'
                    : 'rounded-md px-2.5 py-1 text-xs',
                )}
                style={{
                  backgroundColor: active ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                  color: active ? '#fff' : 'var(--color-text-secondary)',
                }}
              >
                {!isLCARS && opt.id === 'info' && (
                  <Info className="mr-1 inline h-3 w-3 align-text-bottom opacity-80" />
                )}
                {!isLCARS && opt.id === 'warn' && (
                  <AlertTriangle className="mr-1 inline h-3 w-3 align-text-bottom opacity-80" />
                )}
                {!isLCARS && opt.id === 'error' && (
                  <AlertOctagon className="mr-1 inline h-3 w-3 align-text-bottom opacity-80" />
                )}
                {isLCARS
                  ? opt.id === 'error'
                    ? 'Err'
                    : opt.id === 'warn'
                      ? 'Warn'
                      : opt.label
                  : opt.label}
              </button>
            );
          })}
        </div>
        <span
          className={clsx(
            'hidden uppercase sm:inline',
            isLCARS ? 'font-mono text-[7px]' : 'text-[10px]',
          )}
          style={{ color: connected ? 'var(--color-success)' : 'var(--color-text-muted)' }}
        >
          {connected ? 'Live' : '…'}
        </span>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-pressed={showDetails}
          title={
            showDetails
              ? 'Hide extra fields (stack traces, raw context)'
              : 'Show full log context (JSON, errors, stacks)'
          }
          className={clsx(
            'shrink-0 transition-colors',
            isLCARS
              ? 'rounded-none px-2 py-0.5 font-mono text-[7px] font-bold uppercase'
              : 'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
          )}
          style={{
            backgroundColor: showDetails ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
            color: showDetails ? '#fff' : 'var(--color-text-secondary)',
          }}
        >
          {!isLCARS && <Braces className="h-3.5 w-3.5 opacity-90" />}
          <span className={clsx(!isLCARS && 'hidden sm:inline')}>
            {showDetails ? 'Hide details' : 'Details'}
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className={clsx(
            'shrink-0 transition-colors hover:bg-white/10',
            isLCARS ? 'px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase' : 'rounded-md p-1.5',
          )}
          style={{ color: 'var(--color-text-secondary)' }}
          title="Close"
        >
          {isLCARS ? '×' : <X className="h-4 w-4" />}
        </button>
      </div>

      {/* Log body */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className={clsx(
          'min-h-0 flex-1 overflow-auto font-mono leading-relaxed',
          isLCARS ? 'px-2 py-1.5 text-[8px] leading-tight' : 'px-3 py-2 text-[11px]',
        )}
        style={{ color: 'var(--color-text)' }}
      >
        {filtered.length === 0 ? (
          <span style={{ color: 'var(--color-text-muted)' }}>No log lines for this filter.</span>
        ) : (
          filtered.map((e, i) => (
            <div key={`${e.ts}-${i}-${e.msg.slice(0, 24)}`} className="whitespace-pre-wrap break-all py-0.5">
              {showDetails && (
                <>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>{' '}
                  <span
                    className={clsx('inline-block w-4 shrink-0 text-center font-bold', levelStyle(e.level))}
                    title={e.level}
                  >
                    {LEVEL_BADGE[e.level]}
                  </span>{' '}
                </>
              )}
              <span className={clsx('text-[var(--color-text)]', levelStyle(e.level))}>
                {formatLogPrimaryLine(e)}
              </span>
              {showDetails && e.context && Object.keys(e.context).length > 0 && (
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {' '}
                  {JSON.stringify(e.context)}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
