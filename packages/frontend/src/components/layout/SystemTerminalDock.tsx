'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GripHorizontal, Activity, ScrollText, ChevronDown, ArrowDown } from 'lucide-react';
import { clsx } from 'clsx';
import { X, AlertTriangle, Info, AlertOctagon, Braces, Maximize2, Minimize2, Filter } from 'lucide-react';
import { useTheme } from '@/providers/ThemeProvider';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SYSTEM_LOG_SOURCE_ID, TERMINAL_PANEL_HEIGHT } from '@/lib/terminal-constants';
import {
  useSystemTerminal,
  type TerminalLogFilter,
} from '@/providers/SystemTerminalProvider';
import { LogIntegrationFilterPanel, logIntegrationFilterPanelWidthPx } from '@/components/layout/LogIntegrationFilterPanel';
import { StatusPerformanceView } from '@/components/layout/StatusPerformanceView';
import { SYSTEM_STATS_RANGE_PRESETS } from '@/components/viz/SystemStatsGraph';
import {
  formatLogPrimaryLine,
  formatTerminalLogLines,
  formatTerminalTimestamp,
} from '@/lib/logDisplay';
import { getLogInvestigationLinks } from '@/lib/logInvestigation';
import { getApiBase, apiFetch } from '@/lib/api-base';

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
  onHeightChange,
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
  /** Called when user drags the resize handle to a new height */
  onHeightChange?: (h: number) => void;
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
    dockView,
    setDockView,
    perfRangeMs,
    setPerfRangeMs,
  } = useSystemTerminal();
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuAnchorRef = useRef<HTMLDivElement>(null);
  const viewMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [viewMenuRect, setViewMenuRect] = useState<{ left: number; top: number } | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  /** Row expanded by click — full JSON + deep links */
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** Local height override from drag-resize; syncs from prop when parent changes it */
  const [localHeightPx, setLocalHeightPx] = useState(panelHeightPx);
  useEffect(() => { setLocalHeightPx(panelHeightPx); }, [panelHeightPx]);

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = localHeightPx;
    const onMove = (ev: PointerEvent) => {
      const delta = placement === 'bottom' ? startY - ev.clientY : ev.clientY - startY;
      const newH = Math.max(120, Math.min(window.innerHeight - 60, startH + delta));
      setLocalHeightPx(newH);
      onHeightChange?.(newH);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [localHeightPx, placement, onHeightChange]);

  // Initial snapshot
  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/api/system/logs`)
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

  /** Close the view-switcher dropdown on outside click or Escape. */
  useEffect(() => {
    if (!viewMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!viewMenuAnchorRef.current) return;
      if (!viewMenuAnchorRef.current.contains(e.target as Node)) setViewMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewMenuOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [viewMenuOpen]);

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
  const showIntegrationFilterPanel = logIntegrationFilterPanelOpen;
  const dockLeftShift = showIntegrationFilterPanel ? filterPanelW : 0;

  const panelFixedStyle: CSSProperties =
    placement === 'top'
      ? {
          position: 'fixed',
          left: sidebarOffsetPx,
          top: topOffsetPx,
          height: localHeightPx,
          zIndex: 48,
        }
      : {
          position: 'fixed',
          left: sidebarOffsetPx,
          bottom: bottomPx ?? 0,
          height: localHeightPx,
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
        height: localHeightPx,
        ...(placement === 'top'
          ? { top: topOffsetPx, bottom: 'auto' }
          : { bottom: bottomPx ?? 0, top: 'auto' }),
        backgroundColor: isLCARS ? '#000' : 'var(--color-bg)',
        borderColor: 'var(--color-border)',
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-lcars-auto-scroll-btn]')) return;
        onStatusInteraction?.();
      }}
    >
      {/* Resize handle — top edge for bottom-docked, bottom edge for LCARS top-docked */}
      {placement === 'bottom' && (
        <div
          onPointerDown={onResizePointerDown}
          className="absolute inset-x-0 top-0 z-10 flex h-[6px] cursor-ns-resize items-center justify-center select-none"
          style={{ touchAction: 'none' }}
          title="Drag to resize"
        >
          <GripHorizontal className="h-3 w-3 opacity-30" style={{ color: 'var(--color-text-secondary)' }} />
        </div>
      )}
      {/* Header — filters (hidden when LCARS frame handles controls) */}
      {!lcarsFrameHandlesControls && (
      <div
        className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5 overflow-x-auto"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {/* View switcher — click to swap between Logs and Performance */}
        <div ref={viewMenuAnchorRef} className="relative shrink-0">
          <button
            ref={viewMenuTriggerRef}
            type="button"
            onClick={() => {
              const el = viewMenuTriggerRef.current;
              if (el) {
                const r = el.getBoundingClientRect();
                setViewMenuRect({ left: r.left, top: r.bottom + 4 });
              }
              setViewMenuOpen((v) => !v);
            }}
            aria-haspopup="menu"
            aria-expanded={viewMenuOpen}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-white/5"
            style={{ color: 'var(--color-text)' }}
            title="Switch view"
          >
            {dockView === 'performance' ? (
              <Activity className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden />
            ) : (
              <ScrollText className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden />
            )}
            <span>{dockView === 'performance' ? 'Performance' : 'Logs'}</span>
            <ChevronDown
              className={clsx('h-3 w-3 shrink-0 transition-transform', viewMenuOpen && 'rotate-180')}
              style={{ color: 'var(--color-text-muted)' }}
              aria-hidden
            />
            {/* Connection dot — placed inside trigger to keep Status identity compact */}
            <span
              className={clsx('ml-1 block h-1.5 w-1.5 rounded-full', connected ? 'animate-pulse' : '')}
              style={{ backgroundColor: connected ? 'var(--color-success)' : 'var(--color-text-muted)' }}
              title={connected ? 'Live — streaming updates' : 'Reconnecting…'}
              aria-label={connected ? 'Live' : 'Reconnecting'}
            />
          </button>
          {viewMenuOpen && viewMenuRect && (
            <div
              role="menu"
              className="fixed z-[9999] min-w-[180px] overflow-hidden rounded-md border shadow-xl"
              style={{
                left: viewMenuRect.left,
                top: viewMenuRect.top,
                backgroundColor: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
              }}
            >
              {([
                { id: 'logs' as const, label: 'Logs', desc: 'Live log stream', Icon: ScrollText },
                { id: 'performance' as const, label: 'Performance', desc: 'CPU + memory graphs', Icon: Activity },
              ]).map((item) => {
                const active = dockView === item.id;
                const Icon = item.Icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      setDockView(item.id);
                      setViewMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5"
                    style={{
                      backgroundColor: active ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'transparent',
                      color: 'var(--color-text)',
                    }}
                  >
                    <Icon
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{item.label}</div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {item.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Middle section — depends on view */}
        {dockView === 'logs' ? (
          <div
            className="flex shrink-0 items-center rounded-md p-0.5"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
            role="group"
            aria-label="Log level filter"
          >
            {FILTER_OPTIONS.map((opt) => {
              const active = filter === opt.id;
              const Icon =
                opt.id === 'info' ? Info :
                opt.id === 'warn' ? AlertTriangle :
                opt.id === 'error' ? AlertOctagon : null;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFilter(opt.id)}
                  aria-pressed={active}
                  title={opt.label}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--color-text-secondary)',
                  }}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  <span className={Icon ? 'hidden sm:inline' : ''}>{opt.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Spacer */}
        <div className="flex-1 min-w-[8px]" aria-hidden />

        {/* Right side — switches with view */}
        {dockView === 'logs' ? (
          <>
            <button
              type="button"
              onClick={() => {
                setLogAutoScroll(!logAutoScroll);
                if (!logAutoScroll && scrollerRef.current) {
                  scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
                }
              }}
              aria-pressed={logAutoScroll}
              aria-label={logAutoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
              title={logAutoScroll ? 'Auto-scroll on — click to pause' : 'Auto-scroll off — click to follow tail'}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors"
              style={{
                backgroundColor: logAutoScroll ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: logAutoScroll ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden lg:inline">Auto</span>
            </button>

            {placement === 'bottom' && (
              <button
                type="button"
                onClick={() => {
                  initLogIntegrationWhitelistIfNeeded();
                  setLogIntegrationFilterPanelOpen(!logIntegrationFilterPanelOpen);
                }}
                aria-pressed={logIntegrationFilterPanelOpen}
                aria-label="Filter log by source"
                title="Filter by source"
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors"
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
                <Filter className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden lg:inline">Sources</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setLogDetailStyle(logDetailStyle === 'terminal' ? 'digest' : 'terminal')}
              aria-pressed={logDetailStyle === 'terminal'}
              aria-label={
                logDetailStyle === 'terminal'
                  ? 'Switch to one-line log summaries'
                  : 'Show full terminal-style log lines'
              }
              title={logDetailStyle === 'terminal' ? 'Showing full lines — click for digest' : 'Showing digest — click for full lines'}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors"
              style={{
                backgroundColor:
                  logDetailStyle === 'terminal' ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: logDetailStyle === 'terminal' ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              <Braces className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden lg:inline">{logDetailStyle === 'terminal' ? 'Lines' : 'Digest'}</span>
            </button>
          </>
        ) : (
          <div
            className="flex shrink-0 items-center rounded-md p-0.5"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
            role="group"
            aria-label="Performance time window"
          >
            {SYSTEM_STATS_RANGE_PRESETS.map((r) => {
              const active = perfRangeMs === r.ms;
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setPerfRangeMs(r.ms)}
                  aria-pressed={active}
                  title={`Last ${r.label}`}
                  className="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--color-text-secondary)',
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        )}

        {placement === 'bottom' && (
          <button
            type="button"
            onClick={() => setStatusLcarsFullscreen(!statusLcarsFullscreen)}
            aria-pressed={statusLcarsFullscreen}
            aria-label={
              statusLcarsFullscreen
                ? 'Restore default status window height'
                : 'Expand status window toward full screen'
            }
            title={statusLcarsFullscreen ? 'Restore' : 'Expand'}
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors"
            style={{
              backgroundColor: statusLcarsFullscreen ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
              color: statusLcarsFullscreen ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {statusLcarsFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className="hidden lg:inline">{statusLcarsFullscreen ? 'Dock' : 'Expand'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 transition-colors hover:bg-white/10"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label="Close status window"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      )}

      {placement === 'top' && (
        <div
          onPointerDown={onResizePointerDown}
          className="absolute inset-x-0 bottom-0 z-20 flex h-[8px] cursor-ns-resize items-center justify-center select-none"
          style={{
            touchAction: 'none',
            background: lcarsTopStackedChrome ? 'transparent' : 'rgba(0,0,0,0.4)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
          title="Drag to resize"
          aria-label="Resize status window"
          role="separator"
        >
          <GripHorizontal className="h-3 w-3 opacity-50" style={{ color: 'var(--color-text-secondary)' }} />
        </div>
      )}
      {/* Performance view body */}
      {dockView === 'performance' && (
        <div
          className="min-h-0 flex-1 overflow-auto"
          style={{
            paddingBottom: placement === 'top' ? 12 : undefined,
            paddingTop: placement === 'bottom' ? 10 : undefined,
          }}
        >
          <StatusPerformanceView rangeMs={perfRangeMs} />
        </div>
      )}

      {/* Log body */}
      {dockView === 'logs' && (
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className={clsx(
          'min-h-0 flex-1 overflow-auto font-mono leading-relaxed',
          isLCARS ? 'px-2 py-0.5 text-[8px] leading-tight' : 'px-3 py-2 text-[11px]',
        )}
        style={{
          color: 'var(--color-text)',
          /* Reserve room for splitter bars so log text never collides with the resize handle */
          paddingBottom: placement === 'top' ? 12 : undefined,
          paddingTop: placement === 'bottom' ? 10 : undefined,
        }}
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
      )}
    </div>
    </>
  );
}
