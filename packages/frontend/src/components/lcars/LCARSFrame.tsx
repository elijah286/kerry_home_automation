'use client';

import { useTheme } from '@/providers/ThemeProvider';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { LCARSSidebar } from './LCARSSidebar';
import { LCARSStartup } from './LCARSStartup';
import { LCARSElbow } from './LCARSElbow';
import { useConnected, useWebSocket } from '@/hooks/useWebSocket';
import { useLCARSVariant, type ResolvedColors } from './LCARSVariantProvider';
import { DenseReadout } from './LCARSStatusStrip';
import { useAlert } from './LCARSAlertOverlay';
import { TERMINAL_PANEL_HEIGHT } from '@/lib/terminal-constants';
import {
  useSystemTerminal,
  useSystemTerminalBottomInset,
  type TerminalLogFilter,
} from '@/providers/SystemTerminalProvider';
import { SystemTerminalDock } from '@/components/layout/SystemTerminalDock';
import { SYSTEM_STATS_RANGE_PRESETS } from '@/components/viz/SystemStatsGraph';
import { lcarsVerticalRailGradient } from './lcarsRailGradient';
import { LCARSBreadcrumbBlocks } from './LCARSBreadcrumbBlocks';
import { getBreadcrumbItems } from '@/lib/appBreadcrumbs';
import { AppVersionLabel } from '../layout/AppVersionLabel';
import { PinElevationControls } from '../layout/PinElevationControls';
import { AssistantHeaderButton, MapLayersHeaderButton, LCARSAssistantInsetSync } from '../ChatBot';
import { LCARSFrameProvider } from './LCARSFrameContext';
import { FooterSlotProvider, useFooterSlot } from './LCARSFooterSlotContext';
import { useLCARSSounds, type SoundType } from './LCARSSounds';
import { useLcarsLogAutoScrollNudge } from './useLcarsLogAutoScrollNudge';
import { LCARSPanelCorner } from './LCARSPanelFrame';

export const BAR_W = 150;
export const BAR_W_COLLAPSED = 56;
export const HEADER_H = 28;
export const FOOTER_H = 28;
export const OUTER_R = 50;
/** Horizontal extension east of sidebar (svg width, content `left` margin) */
export const INNER_R = 28;
const FRAME_STRIPE_W = 4;
export const CONTENT_EDGE = 10;
/** Mobile LCARS: fixed tap strip + inset for main content (avoids crowding the header). */
const MOBILE_LCARS_RAIL_TOUCH = 44;
const MOBILE_LCARS_RAIL_VISUAL = 12;
/** Right sidebar width for LCARS top status band — log panel is inset so lines do not run under filter pills. */
const LCARS_STATUS_FILTER_RAIL_W = 200;
/** Pull rail under elbows by 1px and paint elbows above — removes anti-alias gaps at seams */
const RAIL_SEAM_OVERLAP = 2;
/** Black band between upper (log) footer strip and main header when status viewer is stacked */
const MAIN_HEADER_JOIN_GAP = 2;
const FOOTER_BAR_GAP_PX = 3;

/** Same flex columns / gaps as the page footer so stacked chrome lines up across the join gap. */
function LcarsFooterStyleBarRow({
  colors,
  height,
  firstExtra,
  rightLabel,
  showScan = true,
}: {
  colors: ResolvedColors;
  height: number;
  firstExtra?: ReactNode;
  rightLabel: ReactNode;
  showScan?: boolean;
}) {
  const segs = colors.footerSegments;
  const first = segs[0] || colors.footerBar;
  const last = segs[segs.length - 1] || colors.accent;
  const mid = segs.slice(1, -1);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: FOOTER_BAR_GAP_PX,
        height,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="lcars-footer-segment lcars-chrome-item lcars-scan-container"
        style={{
          flex: 2,
          minWidth: 0,
          background: first,
          position: 'relative',
          overflow: 'hidden',
          transition: 'background 0.3s ease',
        }}
      >
        {showScan ? <div className="lcars-scan-bar" /> : null}
        {firstExtra}
      </div>
      {mid.map((c, i) => (
        <div
          key={i}
          className="lcars-footer-segment lcars-chrome-item"
          style={{ flex: 1, background: c, transition: 'background 0.3s ease' }}
        />
      ))}
      <div
        className="lcars-footer-segment lcars-chrome-item"
        style={{
          flex: 2,
          minWidth: 0,
          background: last,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 14,
          transition: 'background 0.3s ease',
        }}
      >
        {rightLabel}
      </div>
      <div
        className="lcars-footer-segment lcars-chrome-item"
        style={{
          width: 20,
          flexShrink: 0,
          background: last,
          borderRadius: '0 999px 999px 0',
          transition: 'background 0.3s ease',
        }}
      />
    </div>
  );
}

interface LCARSFrameProps {
  children: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

export function LCARSFrame({ children, collapsed, onToggle, mobileNavOpen, setMobileNavOpen }: LCARSFrameProps) {
  const { activeTheme } = useTheme();
  const connected = useConnected();
  const pathname = usePathname();
  const { colors } = useLCARSVariant();
  const { alertLevel } = useAlert();
  const terminalInset = useSystemTerminalBottomInset();
  const {
    open: terminalOpen,
    setOpen: setTerminalOpen,
    canUse: canUseTerminal,
    hasRecentLogError,
    logFilter,
    setLogFilter,
    logDetailStyle,
    setLogDetailStyle,
    statusLcarsFullscreen,
    setStatusLcarsFullscreen,
    initLogIntegrationWhitelistIfNeeded,
    setLogIntegrationFilterPanelOpen,
    logIntegrationFilterPanelOpen,
    logIntegrationWhitelist,
    dockView,
    setDockView,
    perfRangeMs,
    setPerfRangeMs,
  } = useSystemTerminal();

  const showTopTerminal = canUseTerminal && terminalOpen;
  const { bumpStatusInteraction, flashPeriodMs, onAutoButtonClick, logAutoScroll } =
    useLcarsLogAutoScrollNudge(showTopTerminal);

  const toggleLogDetailStyle = useCallback(() => {
    setLogDetailStyle(logDetailStyle === 'terminal' ? 'digest' : 'terminal');
  }, [logDetailStyle, setLogDetailStyle]);
  const { devices, integrations } = useWebSocket();
  const { play: playSound } = useLCARSSounds();
  const [showStartup, setShowStartup] = useState(true);
  /** Status viewer band when terminal open: ~20% viewport, clamped for usability */
  const [statusViewerBandH, setStatusViewerBandH] = useState(TERMINAL_PANEL_HEIGHT);
  const [viewportH, setViewportH] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );

  useEffect(() => {
    const syncBand = () => {
      if (typeof window === 'undefined') return;
      const h = window.innerHeight;
      setStatusViewerBandH(Math.max(200, Math.min(360, Math.round(h * 0.22))));
    };
    syncBand();
    window.addEventListener('resize', syncBand);
    return () => window.removeEventListener('resize', syncBand);
  }, []);

  useEffect(() => {
    const sync = () => setViewportH(window.innerHeight);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowStartup(false), 3800);
    return () => clearTimeout(timer);
  }, []);

  const isMobile = !useMediaQuery('(min-width: 768px)');

  if (activeTheme !== 'lcars') return <>{children}</>;

  const breadcrumbItems = getBreadcrumbItems(pathname ?? '/');
  const barW = collapsed ? BAR_W_COLLAPSED : BAR_W;
  const or = Math.min(OUTER_R, barW);
  const elbowW = barW + INNER_R;
  /** Mobile-aware layout offsets — sidebar hidden on mobile; thin tap rail + main inset */
  const mElbowW = isMobile ? 0 : elbowW;
  const mContentLeft = isMobile ? MOBILE_LCARS_RAIL_TOUCH : elbowW;
  const topElbowH = HEADER_H + or;
  const bottomElbowH = FOOTER_H + or;

  /** Top band only when status viewer (system terminal) is open; default = header + elbow flush to viewport top. */
  const topChromeH = showTopTerminal ? statusViewerBandH : 0;
  /** When terminal open: optional strip above main header (footer geometry + gap) so logs sit in upper band only. */
  const STATUS_STACK_GAP = 2;
  /** Skinny separator bar height — ~20% of the normal header bar. */
  const STATUS_SEPARATOR_H = 6;
  /** Separator elbow outer radius — mirrors the main header elbow exactly. */
  const STATUS_SEP_OR = or;
  /** Chrome taken by the separator (skinny elbow + gap) at the bottom of the status section. */
  const statusSepElbowH = STATUS_SEPARATOR_H + STATUS_SEP_OR;
  const upperStatusChromeH = statusSepElbowH + STATUS_STACK_GAP;
  /** Stacked chrome needs room for log scroller. */
  const MIN_LOG_BAND_PX = 80;
  const useStackedStatusChrome =
    showTopTerminal && topChromeH >= upperStatusChromeH + MIN_LOG_BAND_PX;
  /** Height of the log/status body area (from top of viewport to above separator). */
  const logBandH = useStackedStatusChrome ? topChromeH - upperStatusChromeH : topChromeH;
  const stackedStatusTop = useStackedStatusChrome ? topChromeH - statusSepElbowH : 0;
  /** Status body: content area from viewport top to just above the skinny separator bar. */
  const statusBodyTop = 0;
  const statusBodyH = useStackedStatusChrome ? topChromeH - STATUS_SEPARATOR_H - STATUS_STACK_GAP : logBandH;
  /** Main header + elbow + rail: flush under log dock, or one gap below upper footer when stacked */
  const mainChromeTop =
    !showTopTerminal ? 0 : useStackedStatusChrome ? topChromeH + MAIN_HEADER_JOIN_GAP : topChromeH;
  /** Rail starts below main top elbow when terminal open */
  const navStackOffsetPx = topElbowH - RAIL_SEAM_OVERLAP;
  const contentTop = mainChromeTop + HEADER_H + 2;
  const contentLeft = elbowW;
  const contentBottom = FOOTER_H + 2 + terminalInset;
  const statusFullscreen = statusLcarsFullscreen && showTopTerminal;
  /** Stacked header row (footer bar in header) only when the top status band is visible — not in main-column fullscreen. */
  /** Stacked "footer in header" row is too dense on phones — use the standard mobile header there too */
  const useSplitStyleHeaderRow = useStackedStatusChrome && !statusFullscreen && !isMobile;
  /** Main column top offset (below header bar) — matches `<main>` when the header strip is visible. */
  const MAIN_TOP = HEADER_H + 2;
  /** Fullscreen log uses main column below the normal header strip (breadcrumb bar stays visible). */
  const layoutMainChromeTop = statusFullscreen ? 0 : mainChromeTop;
  const layoutContentTop = layoutMainChromeTop + HEADER_H + 2;
  const fullscreenPanelH = Math.max(120, viewportH - layoutContentTop - contentBottom);
  const framePin = colors.verticalSegments[1] ?? colors.navColors[1] ?? '#cc99cc';

  const integList = Object.values(integrations);
  const connectedCount = integList.filter((h) => h.state === 'connected').length;

  const STATUS_FILTERS: { id: TerminalLogFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'info', label: 'Info' },
    { id: 'warn', label: 'Warn' },
    { id: 'error', label: 'Err' },
  ];

  const filterPanelTop = statusFullscreen ? MAIN_TOP : 0;
  const filterPanelHeight = statusFullscreen ? fullscreenPanelH : logBandH;
  const logControlsPanelAccent = colors.accent;
  const logControlsPanelEndCap = colors.verticalSegments[1] ?? colors.navColors[1] ?? '#cc99cc';

  /** Right sidebar of the top status band: filter + Lines/Auto (log body uses matching right inset). */
  const statusFilterButtons = showTopTerminal ? (
    <div
      className="lcars-status-filter-rail"
      onPointerDownCapture={(e) => {
        if ((e.target as HTMLElement).closest('[data-lcars-auto-scroll-btn]')) return;
        bumpStatusInteraction();
      }}
      style={{
        position: 'fixed',
        top: filterPanelTop,
        right: CONTENT_EDGE,
        width: LCARS_STATUS_FILTER_RAIL_W,
        height: filterPanelHeight,
        zIndex: 46,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        gap: statusFullscreen ? 6 : 4,
        padding: statusFullscreen ? '10px 8px 12px' : '8px 8px 8px',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        background: '#000',
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
        overflowY: 'auto',
      }}
    >
      {statusFullscreen && (
        <div
          className="lcars-chrome-row flex w-full min-w-0 shrink-0 items-stretch"
          style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}
        >
          <LCARSPanelCorner fill={logControlsPanelAccent} variant="top" compact />
          <div
            className="lcars-panel-title lcars-chrome-item flex min-h-[26px] min-w-0 flex-1 items-center px-2 text-[9px] font-bold uppercase tracking-[0.16em]"
            style={{
              background: logControlsPanelAccent,
              color: '#000',
              fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            <span className="truncate">{dockView === 'performance' ? 'Performance' : 'Log Controls'}</span>
          </div>
          <div
            className="lcars-chrome-item min-h-[26px] w-11 shrink-0 rounded-tr-[14px]"
            style={{
              background: logControlsPanelEndCap,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
            aria-hidden
          />
        </div>
      )}

      {/* View switcher — Logs / Performance — always at top of rail */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 4,
          justifyContent: 'center',
          background: '#000',
        }}
        role="group"
        aria-label="Status view"
      >
        {([
          { id: 'logs' as const, label: 'Logs' },
          { id: 'performance' as const, label: 'Perf' },
        ]).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`lcars-btn lcars-btn--pill${dockView === id ? ' lcars-btn--active' : ''}`}
            style={{
              background: dockView === id ? colors.navActive : colors.muted,
              minWidth: 88,
              minHeight: 36,
              fontSize: 12,
            }}
            aria-pressed={dockView === id}
            onClick={() => setDockView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          alignItems: 'center',
          justifyContent: statusFullscreen ? 'flex-end' : 'center',
          flex: 1,
          minHeight: 0,
          background: '#000',
        }}
      >
        {dockView === 'logs' ? (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 4,
                justifyContent: 'center',
                background: '#000',
              }}
            >
              {[STATUS_FILTERS[0], STATUS_FILTERS[2]].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`lcars-btn lcars-btn--pill${logFilter === id ? ' lcars-btn--active' : ''}`}
                  style={{
                    background: logFilter === id ? colors.navActive : colors.muted,
                    minWidth: 88,
                    minHeight: 36,
                    fontSize: 12,
                  }}
                  onClick={() => setLogFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 4,
                justifyContent: 'center',
                background: '#000',
              }}
            >
              {[STATUS_FILTERS[1], STATUS_FILTERS[3]].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`lcars-btn lcars-btn--pill${logFilter === id ? ' lcars-btn--active' : ''}`}
                  style={{
                    background: logFilter === id ? colors.navActive : colors.muted,
                    minWidth: 88,
                    minHeight: 36,
                    fontSize: 12,
                  }}
                  onClick={() => setLogFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', background: '#000' }}>
              <button
                type="button"
                onClick={() => {
                  initLogIntegrationWhitelistIfNeeded();
                  setLogIntegrationFilterPanelOpen(!logIntegrationFilterPanelOpen);
                }}
                aria-pressed={logIntegrationFilterPanelOpen}
                className={`lcars-btn lcars-btn--pill${
                  logIntegrationFilterPanelOpen || logIntegrationWhitelist !== null ? ' lcars-btn--active' : ''
                }`}
                style={{
                  background:
                    logIntegrationFilterPanelOpen || logIntegrationWhitelist !== null
                      ? colors.navActive
                      : colors.muted,
                  minWidth: '100%',
                  minHeight: 36,
                  fontSize: 11,
                }}
              >
                Sources
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 4,
                justifyContent: 'center',
                background: '#000',
              }}
            >
              <button
                type="button"
                className={`lcars-btn lcars-btn--pill${logDetailStyle === 'terminal' ? ' lcars-btn--active' : ''}`}
                style={{
                  background: logDetailStyle === 'terminal' ? colors.navActive : colors.muted,
                  minWidth: 88,
                  minHeight: 36,
                  fontSize: 12,
                }}
                aria-label={
                  logDetailStyle === 'terminal'
                    ? 'Switch to one-line log summaries'
                    : 'Show full terminal-style log lines'
                }
                onClick={toggleLogDetailStyle}
              >
                {logDetailStyle === 'terminal' ? 'Digest' : 'Lines'}
              </button>
              <button
                type="button"
                data-lcars-auto-scroll-btn
                className={clsx(
                  'lcars-btn lcars-btn--pill',
                  logAutoScroll ? ' lcars-btn--active' : '',
                  flashPeriodMs != null ? 'lcars-auto-scroll-nudge' : '',
                )}
                style={{
                  background: logAutoScroll ? colors.navActive : colors.muted,
                  minWidth: 88,
                  minHeight: 36,
                  fontSize: 12,
                  ...(flashPeriodMs != null ? { animationDuration: `${flashPeriodMs}ms` } : {}),
                }}
                aria-pressed={logAutoScroll}
                aria-label={
                  logAutoScroll
                    ? 'Auto-scroll log tail: on. Click to pause following new lines.'
                    : 'Auto-scroll log tail: off. Click to follow new lines.'
                }
                onClick={onAutoButtonClick}
              >
                Auto
              </button>
            </div>
          </>
        ) : (
          /* Performance view — time window buttons, one per row for visual rhythm */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 4,
              width: '100%',
              background: '#000',
            }}
            role="group"
            aria-label="Performance time window"
          >
            {SYSTEM_STATS_RANGE_PRESETS.map((r) => {
              const active = perfRangeMs === r.ms;
              return (
                <button
                  key={r.label}
                  type="button"
                  className={`lcars-btn lcars-btn--pill${active ? ' lcars-btn--active' : ''}`}
                  style={{
                    background: active ? colors.navActive : colors.muted,
                    minHeight: 36,
                    fontSize: 12,
                  }}
                  aria-pressed={active}
                  onClick={() => setPerfRangeMs(r.ms)}
                  title={`Last ${r.label}`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const footerBarCaption = (
    <span
      style={{
        color: colors.text,
        fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}
    >
      USS Kerry NCC-2024
    </span>
  );

  const stackedHeaderFirstExtra = useStackedStatusChrome ? (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        zIndex: 1,
        gap: 6,
        paddingLeft: 8,
        paddingRight: 4,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', pointerEvents: 'auto' }}>
        <span
          className="lcars-blink-1 lcars-chrome-item"
          style={{ width: 4, height: 14, borderRadius: 0, background: colors.navColors[1] || colors.accent }}
        />
        <span
          className="lcars-blink-2 lcars-chrome-item"
          style={{ width: 4, height: 14, borderRadius: 0, background: colors.navColors[3] || colors.accent }}
        />
        <span
          className="lcars-blink-3 lcars-chrome-item"
          style={{ width: 4, height: 14, borderRadius: 0, background: colors.navColors[5] || colors.muted }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          alignItems: 'stretch',
          alignSelf: 'stretch',
          height: '100%',
          background: '#000',
          gap: FOOTER_BAR_GAP_PX,
          pointerEvents: 'auto',
        }}
      >
        <div style={{ width: FOOTER_BAR_GAP_PX, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
        <LCARSBreadcrumbBlocks
          items={breadcrumbItems}
          navColors={colors.navColors.length ? colors.navColors : [colors.accent, colors.muted]}
          textColor={colors.text}
          barHeight={HEADER_H}
        />
        <div
          className="lcars-chrome-item lcars-header-filler"
          style={{
            flex: 1,
            minWidth: 0,
            alignSelf: 'stretch',
            minHeight: HEADER_H,
            background: colors.headerBar,
          }}
          aria-hidden
        />
      </div>
    </div>
  ) : null;

  const stackedHeaderRight = useStackedStatusChrome ? (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        width: '100%',
        height: '100%',
        minWidth: 0,
      }}
    >
      <div style={{ width: FOOTER_BAR_GAP_PX, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'stretch',
          paddingLeft: 8,
          paddingRight: 8,
          flexShrink: 0,
        }}
      >
        <div
          className="lcars-status-led"
          style={{
            width: 7,
            height: 7,
            borderRadius: 0,
            background: connected ? '#99cc66' : '#cc4444',
          }}
          aria-label={connected ? 'Connected' : 'Disconnected'}
          role="img"
        />
      </div>
      <div style={{ width: FOOTER_BAR_GAP_PX, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'stretch',
          paddingLeft: 6,
          paddingRight: 6,
          flexShrink: 0,
          background: colors.headerBar,
        }}
      >
        <PinElevationControls variant="lcars" lcarsTextColor={colors.text} lcarsAccentBg={colors.accent} />
      </div>
      <div style={{ width: FOOTER_BAR_GAP_PX, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
      {canUseTerminal && (
        <button
          type="button"
          onClick={() => setTerminalOpen(!terminalOpen)}
          data-sound={terminalOpen ? 'statusOff' : 'statusOn'}
          className={`lcars-chrome-item${hasRecentLogError ? ' system-status-log-error-alert' : ''}`}
          aria-label={hasRecentLogError ? 'Status — recent error in system log' : 'Status'}
          style={{
            ...(hasRecentLogError
              ? ({
                  '--status-alert-base': terminalOpen ? colors.navActive : colors.headerBar,
                  '--status-alert-fg-base': colors.text,
                  '--status-alert-border-base': 'transparent',
                } as CSSProperties)
              : {}),
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'stretch',
            paddingLeft: 12,
            paddingRight: 12,
            flexShrink: 0,
            background: hasRecentLogError
              ? undefined
              : terminalOpen
                ? colors.navActive
                : colors.headerBar,
            color: hasRecentLogError ? undefined : colors.text,
            fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            transition: 'background 0.3s ease, color 0.3s ease',
          }}
        >
          Status
        </button>
      )}
      <div style={{ width: FOOTER_BAR_GAP_PX, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
      <MapLayersHeaderButton variant="lcars" style={{ backgroundColor: colors.accent, color: colors.text }} />
      <div style={{ width: FOOTER_BAR_GAP_PX, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
      <AssistantHeaderButton variant="lcars" style={{ backgroundColor: colors.accent, color: colors.text }} data-sound="sidebar" />
      <div style={{ width: FOOTER_BAR_GAP_PX, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'stretch',
          paddingLeft: 8,
          paddingRight: 10,
          flexShrink: 0,
        }}
      >
        <AppVersionLabel variant="lcars" lcarsTextColor={colors.text} />
      </div>
    </div>
  ) : null;

  const alertClass = alertLevel === 'red' ? 'lcars-alert-red' : alertLevel === 'yellow' ? 'lcars-alert-yellow' : '';

  const frameGeometry = useMemo(
    () => ({
      contentTop: layoutContentTop,
      contentBottom,
      contentLeft: mContentLeft,
      contentRight: CONTENT_EDGE,
      barW: isMobile ? 0 : barW,
      elbowW: mElbowW,
      headerH: HEADER_H,
      footerH: FOOTER_H,
      showTopTerminal: !!showTopTerminal,
      topChromeH,
      mainChromeTop: layoutMainChromeTop,
    }),
    [
      layoutContentTop,
      contentBottom,
      mContentLeft,
      isMobile,
      barW,
      mElbowW,
      showTopTerminal,
      topChromeH,
      layoutMainChromeTop,
    ],
  );

  /* Play console warning sound when a new error appears in the status log */
  const prevHasError = useRef(false);
  useEffect(() => {
    if (hasRecentLogError && !prevHasError.current) playSound('error');
    prevHasError.current = hasRecentLogError;
  }, [hasRecentLogError, playSound]);

  const handleFrameClick = useCallback((e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    const btn = el.closest('button, a, .lcars-nav-block, .lcars-btn') as HTMLElement | null;
    if (!btn) return;
    /* Buttons can declare their own sound via data-sound; default is 'beep'. */
    const custom = btn.dataset.sound as SoundType | undefined;
    playSound(custom || 'beep');
  }, [playSound]);

  if (showStartup) return <LCARSStartup onDismiss={() => setShowStartup(false)} />;

  return (
    <FooterSlotProvider>
    <LCARSFrameProvider value={frameGeometry}>
    <div
      className={`lcars-frame ${alertClass}`}
      style={{
        minHeight: '100vh',
        background: '#000',
      }}
      onClick={handleFrameClick}
    >
      <LCARSAssistantInsetSync geometry={frameGeometry} framePin={framePin} />

      {showTopTerminal && !statusFullscreen && (
        <>
          {/* ===== SIDEBAR — yellow Status cap (entire block is the control; opens full-screen log) ===== */}
          {!isMobile && (
          <button
            type="button"
            className="lcars-status-sidebar-cap lcars-sidebar-cap lcars-chrome-item"
            aria-label="View status log full screen"
            onClick={() => setStatusLcarsFullscreen(true)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: barW,
              height: useStackedStatusChrome ? Math.max(0, stackedStatusTop - 2) : logBandH,
              zIndex: 43,
              background: colors.verticalSegments[0] ?? colors.elbowTop,
              boxShadow: 'inset -2px 0 8px rgba(0,0,0,0.28)',
              overflow: 'hidden',
              transition: 'height 0.2s ease-out, width 0.2s ease-in-out, background 0.3s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: 'stretch',
              padding: '7px 6px 6px',
              boxSizing: 'border-box',
              border: 'none',
              cursor: 'pointer',
              color: colors.text,
              fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
              fontWeight: 700,
              fontSize: collapsed ? 10 : 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              textAlign: 'right',
            }}
          >
            {collapsed ? 'STA' : 'Status'}
          </button>
          )}

          {/* ===== STATUS BODY — log scroller + right filter sidebar ===== */}
          <SystemTerminalDock
            sidebarOffsetPx={mElbowW}
            onClose={() => setTerminalOpen(false)}
            placement="top"
            panelHeightPx={statusBodyH}
            topOffsetPx={statusBodyTop}
            lcarsTopStackedChrome={useStackedStatusChrome}
            lcarsFrameHandlesControls
            onStatusInteraction={bumpStatusInteraction}
            rightInsetPx={LCARS_STATUS_FILTER_RAIL_W}
            onHeightChange={(h) =>
              setStatusViewerBandH(useStackedStatusChrome ? h + STATUS_SEPARATOR_H + STATUS_STACK_GAP : h)
            }
          />
          {/* Filter buttons — right-aligned in the status body area */}
          {statusFilterButtons}

          {/* ===== SEPARATOR CHROME — skinny bar + elbow between status and main ===== */}
          {useStackedStatusChrome && (
            <>
              {/* Black gap between sidebar and separator */}
              <div
                aria-hidden
                style={{
                  position: 'fixed',
                  top: logBandH,
                  left: 0,
                  right: 0,
                  height: STATUS_STACK_GAP,
                  zIndex: 42,
                  background: '#000',
                  pointerEvents: 'none',
                  transition: 'top 0.2s ease-out',
                }}
              />
              {/* Separator bottom-left elbow (skinny) — color matches sidebar cap for visual continuity */}
              {!isMobile && (
              <div
                className="lcars-elbow-status-separator"
                style={{
                  position: 'fixed',
                  top: stackedStatusTop,
                  left: 0,
                  zIndex: 44,
                  lineHeight: 0,
                  transition: 'top 0.2s ease-out, left 0.2s ease-in-out',
                }}
              >
                <LCARSElbow
                  position="bottom-left"
                  barWidth={barW}
                  barHeight={STATUS_SEPARATOR_H}
                  outerRadius={STATUS_SEP_OR}
                  innerRadius={INNER_R}
                  color={colors.verticalSegments[0] ?? colors.elbowTop}
                  className="lcars-cascade-0"
                  alertOutline={alertLevel === 'red'}
                />
              </div>
              )}
              {/* Skinny separator bar */}
              <div
                className="lcars-status-footer-bar lcars-cascade-1"
                style={{
                  position: 'fixed',
                  top: topChromeH - STATUS_SEPARATOR_H,
                  right: 0,
                  left: mElbowW,
                  height: STATUS_SEPARATOR_H,
                  zIndex: 41,
                  display: 'flex',
                  transition: 'top 0.2s ease-out, left 0.2s ease-in-out',
                }}
              >
                <div className="lcars-chrome-item" style={{ flex: 1, background: colors.footerSegments[0] || colors.footerBar, transition: 'background 0.3s ease' }} />
                <div style={{ width: 3, background: '#000', flexShrink: 0 }} />
                <div className="lcars-chrome-item" style={{ flex: 0.6, background: colors.footerSegments[1] || colors.muted, transition: 'background 0.3s ease' }} />
                <div style={{ width: 3, background: '#000', flexShrink: 0 }} />
                <div className="lcars-chrome-item" style={{ flex: 0.4, background: colors.footerSegments[2] || colors.accent, transition: 'background 0.3s ease' }} />
                <div style={{ width: 3, background: '#000', flexShrink: 0 }} />
                <div className="lcars-chrome-item" style={{ width: 14, flexShrink: 0, background: colors.accent, borderRadius: '0 999px 999px 0', transition: 'background 0.3s ease' }} />
              </div>
            </>
          )}

          {/* ===== JOIN GAP — black strip between status section and main header ===== */}
          {useStackedStatusChrome && (
            <div
              aria-hidden
              style={{
                position: 'fixed',
                top: topChromeH,
                left: 0,
                right: 0,
                height: MAIN_HEADER_JOIN_GAP,
                zIndex: 45,
                background: '#000',
                pointerEvents: 'none',
                transition: 'top 0.2s ease-out',
              }}
            />
          )}
        </>
      )}

      {showTopTerminal && statusFullscreen && (
        <>
          {!isMobile && (
          <button
            type="button"
            className="lcars-status-sidebar-cap lcars-sidebar-cap lcars-chrome-item"
            aria-label="Exit full screen status"
            aria-pressed={statusFullscreen}
            onClick={() => setStatusLcarsFullscreen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: barW,
              height: Math.min(120, Math.max(88, fullscreenPanelH * 0.14)),
              zIndex: 43,
              background: colors.verticalSegments[0] ?? colors.elbowTop,
              boxShadow: 'inset -2px 0 8px rgba(0,0,0,0.28)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: 'stretch',
              padding: '7px 6px 6px',
              boxSizing: 'border-box',
              border: 'none',
              cursor: 'pointer',
              color: colors.text,
              fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
              fontWeight: 700,
              fontSize: collapsed ? 10 : 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              textAlign: 'right',
            }}
          >
            {collapsed ? 'STA' : 'Status'}
          </button>
          )}
          <SystemTerminalDock
            sidebarOffsetPx={mElbowW}
            onClose={() => setTerminalOpen(false)}
            placement="top"
            panelHeightPx={fullscreenPanelH}
            topOffsetPx={MAIN_TOP}
            lcarsTopStackedChrome={false}
            lcarsFrameHandlesControls
            onStatusInteraction={bumpStatusInteraction}
            rightInsetPx={LCARS_STATUS_FILTER_RAIL_W}
            lcarsStatusAuto={{ flashPeriodMs, onAutoClick: onAutoButtonClick }}
          />
          {statusFilterButtons}
        </>
      )}

      {!isMobile && (
      <div className="lcars-elbow-top" style={{
        position: 'fixed', top: layoutMainChromeTop, left: 0, zIndex: 44, lineHeight: 0,
        transition: 'top 0.2s ease-out, left 0.2s ease-in-out',
      }}>
        <LCARSElbow
          position="top-left"
          barWidth={barW}
          barHeight={HEADER_H}
          outerRadius={or}
          innerRadius={INNER_R}
          color={colors.elbowTop}
          className="lcars-cascade-0"
          alertOutline={alertLevel === 'red'}
        />
      </div>
      )}

      <div
        className="lcars-header-bar lcars-cascade-1"
        style={{
          position: 'fixed', top: layoutMainChromeTop, right: 0,
          left: mElbowW,
          height: HEADER_H,
          zIndex: 41,
          display: 'flex',
          alignItems: 'stretch',
          background: '#000',
          transition: 'top 0.2s ease-out, left 0.2s ease-in-out',
        }}
      >
        {useSplitStyleHeaderRow ? (
          <LcarsFooterStyleBarRow
            colors={colors}
            height={HEADER_H}
            firstExtra={stackedHeaderFirstExtra!}
            rightLabel={stackedHeaderRight!}
          />
        ) : (
          <>
            <div
              className="lcars-chrome-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                alignSelf: 'stretch',
                gap: 8,
                paddingLeft: 10,
                paddingRight: 6,
                flexShrink: 0,
                minHeight: HEADER_H,
                background: colors.headerBar,
                transition: 'background 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                <span className="lcars-blink-1 lcars-chrome-item" style={{ width: 4, height: 14, borderRadius: 0, background: colors.navColors[1] || colors.accent }} />
                <span className="lcars-blink-2 lcars-chrome-item" style={{ width: 4, height: 14, borderRadius: 0, background: colors.navColors[3] || colors.accent }} />
                <span className="lcars-blink-3 lcars-chrome-item" style={{ width: 4, height: 14, borderRadius: 0, background: colors.navColors[5] || colors.muted }} />
              </div>
            </div>
            {/* Black only between crumb segments; filler keeps headerBar continuous to the right */}
            <div
              className="lcars-chrome-item"
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: HEADER_H,
                display: 'flex',
                alignItems: 'stretch',
                alignSelf: 'stretch',
                background: colors.headerBar,
                transition: 'background 0.3s ease',
              }}
            >
              <div style={{ width: 3, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  alignSelf: 'stretch',
                  gap: 3,
                  flexShrink: 0,
                  minHeight: HEADER_H,
                  height: '100%',
                  background: '#000',
                  boxSizing: 'border-box',
                }}
              >
                <LCARSBreadcrumbBlocks
                  items={breadcrumbItems}
                  navColors={colors.navColors.length ? colors.navColors : [colors.accent, colors.muted]}
                  textColor={colors.text}
                  barHeight={HEADER_H}
                />
              </div>
              <div
                className="lcars-chrome-item lcars-header-filler"
                style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', minHeight: HEADER_H, background: colors.headerBar }}
                aria-hidden
              />
            </div>
            {!isMobile && (
              <>
                <div
                  className="lcars-chrome-item"
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    alignSelf: 'stretch',
                    flexShrink: 0,
                    minHeight: HEADER_H,
                    background: colors.headerBar,
                    transition: 'background 0.3s ease',
                  }}
                >
                  <div style={{ width: 3, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      alignSelf: 'stretch',
                      paddingLeft: 8,
                      paddingRight: 8,
                      flexShrink: 0,
                    }}
                  >
                    <div
                      className="lcars-status-led"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 0,
                        background: connected ? '#99cc66' : '#cc4444',
                      }}
                      aria-label={connected ? 'Connected' : 'Disconnected'}
                      role="img"
                    />
                  </div>
                  <div style={{ width: 3, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      alignSelf: 'stretch',
                      paddingLeft: 4,
                      paddingRight: 4,
                      flexShrink: 0,
                      background: colors.headerBar,
                    }}
                  >
                    <PinElevationControls variant="lcars" lcarsTextColor={colors.text} lcarsAccentBg={colors.accent} />
                  </div>
                  <div style={{ width: 3, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
                  {canUseTerminal && (
                    <button
                      type="button"
                      onClick={() => setTerminalOpen(!terminalOpen)}
                      data-sound={terminalOpen ? 'statusOff' : 'statusOn'}
                      className={`lcars-chrome-item${hasRecentLogError ? ' system-status-log-error-alert' : ''}`}
                      aria-label={hasRecentLogError ? 'Status — recent error in system log' : 'Status'}
                      style={{
                        ...(hasRecentLogError
                          ? ({
                              '--status-alert-base': terminalOpen ? colors.navActive : colors.headerBar,
                              '--status-alert-fg-base': colors.text,
                              '--status-alert-border-base': 'transparent',
                            } as CSSProperties)
                          : {}),
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        alignSelf: 'stretch',
                        paddingLeft: 12,
                        paddingRight: 12,
                        flexShrink: 0,
                        background: hasRecentLogError
                          ? undefined
                          : terminalOpen
                            ? colors.navActive
                            : colors.headerBar,
                        color: hasRecentLogError ? undefined : colors.text,
                        fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
                        fontWeight: 700,
                        fontSize: 10,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        transition: 'background 0.3s ease, color 0.3s ease',
                      }}
                    >
                      Status
                    </button>
                  )}
                  <div style={{ width: 3, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
                  <MapLayersHeaderButton variant="lcars" style={{ backgroundColor: colors.accent, color: colors.text }} />
                  <div style={{ width: 3, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
                  <AssistantHeaderButton variant="lcars" style={{ backgroundColor: colors.accent, color: colors.text }} data-sound="sidebar" />
                  <div style={{ width: 3, flexShrink: 0, background: '#000', alignSelf: 'stretch' }} aria-hidden />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      alignSelf: 'stretch',
                      paddingLeft: 8,
                      paddingRight: 10,
                      flexShrink: 0,
                    }}
                  >
                    <AppVersionLabel variant="lcars" lcarsTextColor={colors.text} />
                  </div>
                </div>
                <div
                  className="lcars-chrome-item"
                  style={{
                    width: 12,
                    alignSelf: 'stretch',
                    minHeight: HEADER_H,
                    background: colors.headerBar,
                    borderRadius: 0,
                    flexShrink: 0,
                    transition: 'background 0.3s ease',
                  }}
                />
              </>
            )}
            {isMobile && (
              <div
                className="lcars-chrome-item"
                style={{
                  width: 12,
                  alignSelf: 'stretch',
                  minHeight: HEADER_H,
                  background: colors.headerBar,
                  borderRadius: 0,
                  flexShrink: 0,
                  transition: 'background 0.3s ease',
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Vertical sidebar rail — hidden on mobile */}
      {!isMobile && (
      <div
        className="lcars-vertical-rail lcars-chrome-item lcars-cascade-4"
        style={{
          position: 'fixed',
          top: showTopTerminal && !statusFullscreen ? layoutMainChromeTop : 0,
          bottom: bottomElbowH - RAIL_SEAM_OVERLAP,
          left: 0,
          width: barW,
          zIndex: 42,
          paddingLeft: 0,
          paddingRight: 0,
          background: lcarsVerticalRailGradient(colors),
          borderTopLeftRadius: or,
          boxShadow: 'inset -2px 0 8px rgba(0,0,0,0.28)',
          transition: 'top 0.2s ease-out, width 0.2s ease-in-out, background 0.3s ease, box-shadow 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
          boxSizing: 'border-box',
          ['--lcars-rail-w' as string]: `${barW}px`,
        }}
      >
        <LCARSSidebar
          railWidthPx={barW}
          navStackOffsetPx={navStackOffsetPx}
          onToggle={onToggle}
          collapsed={collapsed}
        />
      </div>
      )}

      {/* Bottom-left elbow — hidden on mobile */}
      {!isMobile && (
      <div className="lcars-elbow-bottom" style={{
        position: 'fixed', bottom: 0, left: 0, zIndex: 44, lineHeight: 0,
        transition: 'all 0.2s ease-in-out',
      }}>
        <LCARSElbow
          position="bottom-left"
          barWidth={barW}
          barHeight={FOOTER_H}
          outerRadius={or}
          innerRadius={INNER_R}
          color={colors.elbowBottom}
          className="lcars-cascade-7"
          alertOutline={alertLevel === 'red'}
        />
      </div>
      )}

      <div className="lcars-footer-bar lcars-cascade-6" style={{
        position: 'fixed', bottom: 0, right: 0,
        left: mElbowW,
        height: FOOTER_H, zIndex: 41,
        transition: 'left 0.2s ease-in-out',
      }}>
        <LcarsFooterStyleBarRow colors={colors} height={FOOTER_H} rightLabel={footerBarCaption} firstExtra={<FooterFirstExtraSlot />} />
      </div>

      <main className="lcars-content" style={{
        position: 'fixed',
        top: layoutContentTop,
        left: mContentLeft,
        right: CONTENT_EDGE,
        bottom: contentBottom,
        padding: isMobile ? '12px 12px 16px 12px' : `12px ${CONTENT_EDGE + 6}px 16px ${FRAME_STRIPE_W + 14}px`,
        background: '#000',
        overflowX: 'hidden',
        overflowY: 'auto',
        zIndex: 1,
        opacity: statusFullscreen ? 0 : 1,
        pointerEvents: statusFullscreen ? 'none' : 'auto',
        /* `absolute inset-0` recipe detail fills this box; min-height 0 helps nested flex scroll regions */
        minHeight: 0,
        transition: 'top 0.2s ease-out, left 0.2s ease-in-out, bottom 0.2s ease-out, border-color 0.3s ease, background 0.3s ease',
      }}>
        {children}
      </main>

      {/* Mobile: thin LCARS tap strip — toggles slide-out (nav + toolbar); keeps header uncluttered */}
      {isMobile && !statusFullscreen && (
        <button
          type="button"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          aria-expanded={mobileNavOpen}
          aria-label={mobileNavOpen ? 'Close main menu' : 'Open main menu'}
          className="lcars-chrome-item touch-manipulation"
          data-sound="beep"
          style={{
            position: 'fixed',
            left: 0,
            top: layoutContentTop,
            bottom: contentBottom,
            width: MOBILE_LCARS_RAIL_TOUCH,
            zIndex: 25,
            border: 'none',
            padding: 0,
            margin: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'center',
            background: 'transparent',
            boxSizing: 'border-box',
          }}
        >
          <div
            aria-hidden
            style={{
              marginTop: 4,
              marginBottom: 4,
              width: MOBILE_LCARS_RAIL_VISUAL,
              flexShrink: 0,
              borderRadius: 2,
              alignSelf: 'stretch',
              background: lcarsVerticalRailGradient(colors),
              boxShadow: 'inset -1px 0 6px rgba(0,0,0,0.35)',
            }}
          />
        </button>
      )}

      {alertLevel === 'yellow' && (
        <div
          className="lcars-alert-vignette"
          style={{
            position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9998,
            boxShadow: 'inset 0 0 100px 24px #ffcc0022',
            animation: 'lcars-alert-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* ── Mobile LCARS sidebar drawer ── */}
      {isMobile && (
        <div
          className={clsx('fixed inset-0', mobileNavOpen ? '' : 'pointer-events-none')}
          style={{ zIndex: 200 }}
        >
          {/* Backdrop */}
          <div
            className={clsx(
              'absolute inset-0 bg-black/70 transition-opacity duration-300',
              mobileNavOpen ? 'opacity-100' : 'opacity-0',
            )}
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          {/* Drawer */}
          <div
            className={clsx(
              'absolute inset-y-0 left-0 flex max-h-full flex-col overflow-hidden transition-transform duration-300 ease-in-out',
              mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
            )}
            style={{
              width: 'min(320px, 92vw)',
              background: '#000',
              boxShadow: '4px 0 24px rgba(0,0,0,0.45)',
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto">
              <LCARSSidebar
                railWidthPx={BAR_W}
                navStackOffsetPx={0}
                onToggle={() => setMobileNavOpen(false)}
                collapsed={false}
              />
            </div>
            <div className="shrink-0 border-t px-2 py-3" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
              <div className="flex flex-col gap-2">
                <PinElevationControls variant="lcars" lcarsTextColor={colors.text} lcarsAccentBg={colors.accent} />
                {canUseTerminal && (
                  <button
                    type="button"
                    onClick={() => setTerminalOpen(!terminalOpen)}
                    data-sound={terminalOpen ? 'statusOff' : 'statusOn'}
                    className={`lcars-chrome-item touch-manipulation${hasRecentLogError ? ' system-status-log-error-alert' : ''}`}
                    aria-label={hasRecentLogError ? 'Status — recent error in system log' : 'Status'}
                    style={{
                      ...(hasRecentLogError
                        ? ({
                            '--status-alert-base': terminalOpen ? colors.navActive : colors.headerBar,
                            '--status-alert-fg-base': colors.text,
                            '--status-alert-border-base': 'transparent',
                          } as CSSProperties)
                        : {}),
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      minHeight: 40,
                      padding: '10px 12px',
                      flexShrink: 0,
                      background: hasRecentLogError
                        ? undefined
                        : terminalOpen
                          ? colors.navActive
                          : colors.headerBar,
                      color: hasRecentLogError ? undefined : colors.text,
                      fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      transition: 'background 0.3s ease, color 0.3s ease',
                    }}
                  >
                    Status
                  </button>
                )}
                <MapLayersHeaderButton
                  variant="lcars"
                  style={{ backgroundColor: colors.accent, color: colors.text }}
                  className="!min-w-0 !h-auto w-full min-h-[44px] shrink-0 justify-start"
                />
                <AssistantHeaderButton
                  variant="lcars"
                  style={{ backgroundColor: colors.accent, color: colors.text }}
                  className="!min-w-0 !h-auto w-full min-h-[44px] shrink-0 justify-start"
                  data-sound="sidebar"
                />
                <div className="flex justify-center pt-1">
                  <AppVersionLabel variant="lcars" lcarsTextColor={colors.text} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </LCARSFrameProvider>
    </FooterSlotProvider>
  );
}

/** Reads footer slot content from context — rendered inside FooterSlotProvider subtree. */
function FooterFirstExtraSlot() {
  const { footerFirstExtra } = useFooterSlot();
  return <>{footerFirstExtra}</>;
}
