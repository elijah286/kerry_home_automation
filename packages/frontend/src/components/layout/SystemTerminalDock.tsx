'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { X, AlertTriangle, Info, AlertOctagon, ListTree, Braces, Maximize2, Minimize2 } from 'lucide-react';
import { useTheme } from '@/providers/ThemeProvider';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  SYSTEM_LOG_SOURCE_ID,
  TERMINAL_PANEL_HEIGHT,
  useSystemTerminal,
  type TerminalLogFilter,
} from '@/providers/SystemTerminalProvider';
import { LogIntegrationFilterPanel, logIntegrationFilterPanelWidthPx } from '@/components/layout/LogIntegrationFilterPanel';
import {
  formatLogPrimaryLine,
  formatTerminalLogLines,
  formatTerminalTimestamp,
} from '@/lib/logDisplay';
import { getLogInvestigationLinks } from '@/lib/logInvestigation';
import { getApiBase } from '@/lib/api-base';

const API_BASE = getApiBase();

type LogLevelLabel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  ts: number;
  level: LogLevelLabel;
  msg: string;
  context?: Record<string, unknown>;
  pid?: number;
}

function matchesFilter(level: LogLevelLabel, filter: TerminalLogFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'info') return level === 'trace' || level === 'debug' || level === 'info';
  if (filter === 'warn') return level === 'warn';
  if (filter === 'error') return level === 'error' || level === 'fatal';
  return true;
}

function logSourceTag(e: LogEntry): string {
  const v = e.context?.integration;
  return typeof v === 'string' ? v : SYSTEM_LOG_SOURCE_ID;
}

function matchesIntegrationWhitelist(e: LogEntry, whitelist: string[] | null): boolean {
  if (whitelist === null) return true;
  return whitelist.includes(logSourceTag(e));
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
  lcarsTopStackedChrome = false,
  lcarsFrameHandlesControls = false,
  topOffsetPx = 0,
  onStatusInteraction,
  lcarsStatusAuto,
  rightInsetPx = 0,
}: {
  sidebarOffsetPx: number;
  onClose: () => void;
  /** `top` = LCARS: fixed under top edge, above breadcrumb belt (left offset = elbow width) */
  placement?: 'bottom' | 'top';
  /** LCARS top dock: match frame status band (e.g. ~20vh) */
  panelHeightPx?: number;
  /** LCARS: frame draws black gap + footer strip below log band — omit dock bottom border */
  lcarsTopStackedChrome?: boolean;
  /** LCARS: frame bar has filter / close controls — hide dock header entirely */
  lcarsFrameHandlesControls?: boolean;
  /** Additional top offset when placement='top' (e.g. below a LCARS top bar) */
  topOffsetPx?: number;
  /** LCARS status band: any scroll/tap — resets idle timer for auto-scroll nudge */
  onStatusInteraction?: () => void;
  /** LCARS: Auto tail-follow control when the frame does not render it (compact status band) */
  lcarsStatusAuto?: { flashPeriodMs: number | null; onAutoClick: () => void };
  /** LCARS: leave room on the right for frame-drawn filter sidebar (px from viewport right) */
  rightInsetPx?: number;
}) {
  const { activeTheme } = useTheme();
  const isMdUp = useMediaQuery('(min-width: 768px)');
  const {
    logFilter: filter,
    setLogFilter: setFilter,
    logDetailStyle,
    setLogDetailStyle,
    logAutoScroll,
    setLogAutoScroll,
    statusLcarsFullscreen,
    setStatusLcarsFullscreen,
    logIntegrationWhitelist,
    setLogIntegrationWhitelist,
    logIntegrationFilterPanelOpen,
    setLogIntegrationFilterPanelOpen,
    initLogIntegrationWhitelistIfNeeded,
  } = useSystemTerminal();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  /** Row expanded by click — full JSON + deep links */
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

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
    () =>
      entries
        .filter((e) => matchesFilter(e.level, filter))
        .filter((e) => matchesIntegrationWhitelist(e, logIntegrationWhitelist)),
    [entries, filter, logIntegrationWhitelist],
  );

  useEffect(() => {
    setExpandedRowKey(null);
  }, [filter]);

  useEffect(() => {
    if (!logAutoScroll || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [filtered, logAutoScroll]);

  const onScroll = useCallback(() => {
    onStatusInteraction?.();
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (!nearBottom) setLogAutoScroll(false);
  }, [onStatusInteraction, setLogAutoScroll]);

  const bottomPx =
    placement === 'bottom' && activeTheme === 'lcars'
      ? LCARS_BOTTOM_CHROME
      : placement === 'bottom'
        ? isMdUp
          ? 0
          : 64
        : undefined;

  const isLCARS = activeTheme === 'lcars';

  const lcarsTop = isLCARS && placement === 'top';

  const filterPanelW = logIntegrationFilterPanelWidthPx();
  const showIntegrationFilterPanel = statusLcarsFullscreen && logIntegrationFilterPanelOpen;
  const dockLeftShift = showIntegrationFilterPanel ? filterPanelW : 0;

  const panelFixedStyle: CSSProperties =
    placement === 'top'
      ? {
          position: 'fixed',
          left: sidebarOffsetPx,
          top: topOffsetPx,
          height: panelHeightPx,
          zIndex: 48,
        }
      : {
          position: 'fixed',
          left: sidebarOffsetPx,
          bottom: bottomPx ?? 0,
          height: panelHeightPx,
          zIndex: 48,
        };

  const lcars = isLCARS;

  return (
    <>
    {showIntegrationFilterPanel && (
      <LogIntegrationFilterPanel
        open
        onClose={() => setLogIntegrationFilterPanelOpen(false)}
        whitelist={logIntegrationWhitelist}
        setWhitelist={setLogIntegrationWhitelist}
        fixedStyle={panelFixedStyle}
        isLcars={lcars}
      />
    )}
    <div
      className={clsx(
        'fixed z-[45] flex flex-col',
        /* Avoid visible seam next to LCARS filter rail — shadow reads as a gray frame on black */
        isLCARS && placement === 'top' && rightInsetPx > 0 ? 'shadow-none' : 'shadow-2xl',
        placement === 'top'
          ? lcarsTopStackedChrome
            ? ''
            : 'border-b'
          : 'right-0 border-t',
      )}
      style={{
        left: sidebarOffsetPx + dockLeftShift,
        right: rightInsetPx,
        height: panelHeightPx,
        ...(placement === 'top'
          ? { top: topOffsetPx, bottom: 'auto' }
          : { bottom: bottomPx ?? 0, top: 'auto' }),
        backgroundColor: isLCARS ? '#000' : 'var(--color-bg-card)',
        borderColor: 'var(--color-border)',
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-lcars-auto-scroll-btn]')) return;
        onStatusInteraction?.();
      }}
    >
      {/* Header — filters (hidden when LCARS frame handles controls) */}
      {!lcarsFrameHandlesControls && (
      <div
        className={clsx(
          'flex shrink-0 border-b',
          lcarsTop ? 'flex-col gap-1.5 px-2 py-2' : 'items-center gap-2 px-3 py-2',
          isLCARS && !lcarsTop ? 'gap-1 px-2 py-1' : '',
        )}
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div
          className={clsx(
            'flex min-w-0 items-center',
            lcarsTop ? 'w-full justify-between gap-2' : 'contents',
          )}
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
          {!lcarsTop && (
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
          )}
          <span
            className={clsx(
              'shrink-0 uppercase',
              lcarsTop ? 'inline font-mono text-[8px]' : 'hidden sm:inline',
              !lcarsTop && isLCARS ? 'font-mono text-[7px]' : !lcarsTop ? 'text-[10px]' : '',
            )}
            style={{ color: connected ? 'var(--color-success)' : 'var(--color-text-muted)' }}
          >
            {connected ? 'Live' : '…'}
          </span>
          <button
            type="button"
            onClick={() => setLogDetailStyle(logDetailStyle === 'terminal' ? 'digest' : 'terminal')}
            aria-pressed={logDetailStyle === 'terminal'}
            aria-label={
              logDetailStyle === 'terminal'
                ? 'Switch to one-line log summaries'
                : 'Show full terminal-style log lines'
            }
            className={clsx(
              'shrink-0 transition-colors',
              isLCARS
                ? lcarsTop
                  ? 'rounded-none px-2.5 py-1 font-mono text-[8px] font-bold uppercase'
                  : 'rounded-none px-2 py-0.5 font-mono text-[7px] font-bold uppercase'
                : 'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
            )}
            style={{
              backgroundColor:
                logDetailStyle === 'terminal' ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
              color: logDetailStyle === 'terminal' ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {!isLCARS && <Braces className="h-3.5 w-3.5 opacity-90" />}
            <span className={clsx(!isLCARS && 'hidden sm:inline')}>
              {logDetailStyle === 'terminal' ? 'Digest' : 'Lines'}
            </span>
          </button>
          {placement === 'bottom' && statusLcarsFullscreen && (
            <button
              type="button"
              onClick={() => {
                initLogIntegrationWhitelistIfNeeded();
                setLogIntegrationFilterPanelOpen(true);
              }}
              aria-pressed={logIntegrationFilterPanelOpen}
              aria-label="Filter log by integration"
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor:
                  logIntegrationFilterPanelOpen || logIntegrationWhitelist !== null
                    ? 'var(--color-accent)'
                    : 'var(--color-bg-secondary)',
                color:
                  logIntegrationFilterPanelOpen || logIntegrationWhitelist !== null
                    ? '#fff'
                    : 'var(--color-text-secondary)',
              }}
            >
              <span className="hidden sm:inline">Sources</span>
            </button>
          )}
          {placement === 'bottom' && (
            <button
              type="button"
              onClick={() => setStatusLcarsFullscreen(!statusLcarsFullscreen)}
              aria-pressed={statusLcarsFullscreen}
              aria-label={
                statusLcarsFullscreen
                  ? 'Restore default terminal height'
                  : 'Expand system terminal toward full screen'
              }
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: statusLcarsFullscreen ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: statusLcarsFullscreen ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {statusLcarsFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5 opacity-90" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5 opacity-90" />
              )}
              <span className="hidden sm:inline">
                {statusLcarsFullscreen ? 'Dock' : 'Full screen'}
              </span>
            </button>
          )}
          {lcarsStatusAuto && isLCARS && lcarsTop && !lcarsFrameHandlesControls ? (
            <button
              type="button"
              data-lcars-auto-scroll-btn
              onClick={lcarsStatusAuto.onAutoClick}
              aria-pressed={logAutoScroll}
              aria-label={
                logAutoScroll
                  ? 'Auto-scroll log tail: on. Click to pause following new lines.'
                  : 'Auto-scroll log tail: off. Click to follow new lines.'
              }
              className={clsx(
                'shrink-0 transition-colors',
                lcarsTop ? 'rounded-none px-2.5 py-1 font-mono text-[8px] font-bold uppercase' : '',
                lcarsStatusAuto.flashPeriodMs != null ? 'lcars-auto-scroll-nudge' : '',
              )}
              style={{
                backgroundColor: logAutoScroll ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: logAutoScroll ? '#fff' : 'var(--color-text-secondary)',
                ...(lcarsStatusAuto.flashPeriodMs != null
                  ? { animationDuration: `${lcarsStatusAuto.flashPeriodMs}ms` }
                  : {}),
              }}
            >
              Auto
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className={clsx(
              'shrink-0 transition-colors hover:bg-white/10',
              isLCARS
                ? lcarsTop
                  ? 'px-2 py-1 font-mono text-[9px] font-bold uppercase'
                  : 'px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase'
                : 'rounded-md p-1.5',
            )}
            style={{ color: 'var(--color-text-secondary)' }}
            aria-label="Close system terminal"
          >
            {isLCARS ? '×' : <X className="h-4 w-4" />}
          </button>
        </div>
        {lcarsTop && (
          <div
            className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:justify-end"
            role="group"
            aria-label="Log level filter"
          >
            {FILTER_OPTIONS.map((opt) => {
              const active = filter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFilter(opt.id)}
                  className="rounded-none px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wide transition-colors sm:min-w-[5.5rem]"
                  style={{
                    backgroundColor: active ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                    color: active ? '#fff' : 'var(--color-text-secondary)',
                    border: '2px solid #000',
                  }}
                >
                  {opt.id === 'error' ? 'Errors' : opt.id === 'warn' ? 'Warnings' : opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Log body */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className={clsx(
          'min-h-0 flex-1 overflow-auto font-mono leading-relaxed',
          isLCARS ? 'px-2 py-0.5 text-[8px] leading-tight' : 'px-3 py-2 text-[11px]',
        )}
        style={{ color: 'var(--color-text)' }}
      >
        {filtered.length === 0 ? (
          <span style={{ color: 'var(--color-text-muted)' }}>No log lines for this filter.</span>
        ) : (
          filtered.map((e, i) => {
            const rowKey = `${e.ts}:${i}:${e.level}:${e.msg.slice(0, 64)}`;
            const expanded = expandedRowKey === rowKey;
            const investigationLinks = getLogInvestigationLinks(e);
            const contextKeys = e.context ? Object.keys(e.context).length : 0;
            const contextJson =
              e.context && contextKeys > 0 ? JSON.stringify(e.context, null, 2) : null;
            const terminalLines =
              logDetailStyle === 'terminal'
                ? formatTerminalLogLines({
                    ts: e.ts,
                    level: e.level,
                    msg: e.msg,
                    context: e.context,
                    pid: e.pid,
                  })
                : null;

            const activateLine = () => {
              setLogAutoScroll(false);
              setExpandedRowKey((k) => (k === rowKey ? null : rowKey));
            };

            return (
              <div
                key={rowKey}
                className={clsx(
                  'whitespace-pre-wrap break-all py-0.5',
                  expanded && (isLCARS ? 'rounded-sm bg-white/[0.06]' : 'rounded-md bg-[var(--color-bg-secondary)]/80'),
                )}
              >
                <button
                  type="button"
                  onClick={activateLine}
                  aria-expanded={expanded}
                  aria-label={expanded ? 'Collapse log line details' : 'Expand log line details'}
                  className={clsx(
                    'min-w-0 w-full rounded-sm text-left transition-colors',
                    isLCARS ? 'hover:bg-white/10' : 'hover:bg-[var(--color-bg-hover)]/50',
                  )}
                >
                  {logDetailStyle === 'terminal' && terminalLines ? (
                    terminalLines.map((line, li) => (
                      <div
                        key={li}
                        className={clsx(li > 0 && 'opacity-[0.9]')}
                        style={li > 0 ? { color: 'var(--color-text-muted)' } : undefined}
                      >
                        <span className={li === 0 ? clsx(levelStyle(e.level)) : undefined}>{line}</span>
                      </div>
                    ))
                  ) : (
                    <>
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        [{formatTerminalTimestamp(e.ts)}]
                      </span>{' '}
                      <span
                        className={clsx('inline-block w-4 shrink-0 text-center font-bold', levelStyle(e.level))}
                        aria-hidden
                      >
                        {LEVEL_BADGE[e.level]}
                      </span>{' '}
                      <span className={clsx('text-[var(--color-text)]', levelStyle(e.level))}>
                        {formatLogPrimaryLine(e)}
                      </span>
                    </>
                  )}
                </button>
                {expanded && (
                  <div
                    className={clsx(
                      'mt-1 border-l-2 pl-2 font-mono',
                      isLCARS ? 'text-[7px] leading-snug' : 'text-[10px] leading-relaxed',
                    )}
                    style={{
                      borderColor: 'var(--color-accent)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    <div style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(e.ts).toLocaleString()} ·{' '}
                      <span className={clsx('font-bold', levelStyle(e.level))}>{e.level}</span>
                    </div>
                    {e.msg ? (
                      <div className="mt-0.5 break-all">
                        <span style={{ color: 'var(--color-text-muted)' }}>Message: </span>
                        <span style={{ color: 'var(--color-text)' }}>{e.msg}</span>
                      </div>
                    ) : null}
                    {contextJson ? (
                      <pre
                        className={clsx(
                          'mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all',
                          isLCARS ? 'text-[6px]' : 'text-[10px]',
                        )}
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {contextJson}
                      </pre>
                    ) : (
                      <div className="mt-0.5 italic" style={{ color: 'var(--color-text-muted)' }}>
                        No structured context on this line.
                      </div>
                    )}
                    {investigationLinks.length > 0 && (
                      <div className={clsx('mt-1 flex flex-wrap gap-x-2 gap-y-0.5', isLCARS ? 'text-[7px]' : 'text-[10px]')}>
                        {investigationLinks.map((link) => (
                          <Link
                            key={`${link.href}-inline`}
                            href={link.href}
                            className="font-semibold underline underline-offset-2"
                            style={{ color: 'var(--color-accent)' }}
                            onClick={() => {
                              setLogAutoScroll(false);
                            }}
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
    </>
  );
}
