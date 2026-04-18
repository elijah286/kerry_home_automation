'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { KNOWN_INTEGRATIONS, Permission } from '@ha/shared';
import { useAuth } from '@/providers/AuthProvider';
import { SystemTerminalDock } from '@/components/layout/SystemTerminalDock';
import { useSystemLogErrorAlert } from '@/hooks/useSystemLogErrorAlert';
import { SYSTEM_LOG_SOURCE_ID, TERMINAL_PANEL_HEIGHT } from '@/lib/terminal-constants';

const STORAGE_SHOW_NAV = 'ha-ui-show-terminal-nav';
const STORAGE_LOG_DETAIL = 'ha-ui-terminal-log-detail';
/** Terminal log expanded into main column (LCARS top dock or standard bottom dock). */
const STORAGE_TERMINAL_MAIN_COLUMN = 'ha-ui-lcars-status-fullscreen';
const STORAGE_LOG_INTEGRATION_WHITELIST = 'ha-ui-log-integration-whitelist';

// Re-export for backward compatibility — other files import these from here
export { SYSTEM_LOG_SOURCE_ID, TERMINAL_PANEL_HEIGHT } from '@/lib/terminal-constants';

export type TerminalLogFilter = 'all' | 'info' | 'warn' | 'error';

/** Which panel the Status window is currently showing. */
export type StatusDockView = 'logs' | 'performance';

/** `terminal` = multiline pino-style (timestamps + context); `digest` = one short line per entry. */
export type TerminalLogDetailStyle = 'terminal' | 'digest';

export type SystemTerminalDockPlacement = 'bottom' | 'top';

interface SystemTerminalContextValue {
  canUse: boolean;
  showNavButton: boolean;
  setShowNavButton: (v: boolean) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Shared with LCARS status strip filter buttons */
  logFilter: TerminalLogFilter;
  setLogFilter: (f: TerminalLogFilter) => void;
  /** Multiline backend-style logs vs condensed digest lines */
  logDetailStyle: TerminalLogDetailStyle;
  setLogDetailStyle: (s: TerminalLogDetailStyle) => void;
  /** LCARS: terminal is anchored in `LCARSFrame` at the top; provider skips its own dock. */
  terminalDockPlacement: SystemTerminalDockPlacement;
  /** When true, new log lines scroll the view to the tail. */
  logAutoScroll: boolean;
  setLogAutoScroll: (v: boolean) => void;
  /** Error/fatal in system log within the last 5 minutes — highlight Status control. */
  hasRecentLogError: boolean;
  /** LCARS: status terminal fills the main content column (hides top chrome). */
  statusLcarsFullscreen: boolean;
  setStatusLcarsFullscreen: (v: boolean) => void;
  /** Bottom-dock terminal height when expanded (standard theme). */
  bottomDockHeightPx: number;
  /**
   * When non-null, only log lines whose `context.integration` is in this list are shown
   * (plus `SYSTEM_LOG_SOURCE_ID` for untagged lines when that id is included).
   * `null` = show all sources.
   */
  logIntegrationWhitelist: string[] | null;
  setLogIntegrationWhitelist: (v: string[] | null) => void;
  logIntegrationFilterPanelOpen: boolean;
  setLogIntegrationFilterPanelOpen: (v: boolean) => void;
  /** First open of the filter panel: seed checklist with all integrations + system. */
  initLogIntegrationWhitelistIfNeeded: () => void;
  /** Open the terminal pre-filtered to a specific source (e.g. 'software-update'). */
  openWithSourceFilter: (source: string) => void;
  /** Which view the dock is currently showing (logs vs performance graphs). */
  dockView: StatusDockView;
  setDockView: (v: StatusDockView) => void;
  /** Time window (ms) for the performance view graphs. */
  perfRangeMs: number;
  setPerfRangeMs: (v: number) => void;
  /** Current on-screen source ID (e.g. camera entity) for the "Current" filter. */
  currentSourceId: string | null;
  setCurrentSourceId: (v: string | null) => void;
}

const SystemTerminalContext = createContext<SystemTerminalContextValue | null>(null);

export function SystemTerminalProvider({
  children,
  sidebarOffsetPx,
  terminalDockPlacement = 'bottom',
}: {
  children: ReactNode;
  sidebarOffsetPx: number;
  /** `top` = LCARS frame renders the dock above the breadcrumb belt */
  terminalDockPlacement?: SystemTerminalDockPlacement;
}) {
  const { hasPermission } = useAuth();
  const canUse = hasPermission(Permission.ViewSystemTerminal);

  const [showNavButton, setShowNavButtonState] = useState(true);
  const [open, setOpen] = useState(false);
  const hasRecentLogError = useSystemLogErrorAlert(canUse, open);
  const [logFilter, setLogFilter] = useState<TerminalLogFilter>('all');
  const [logDetailStyle, setLogDetailStyleState] = useState<TerminalLogDetailStyle>('terminal');
  const [logAutoScroll, setLogAutoScroll] = useState(true);
  const [statusLcarsFullscreen, setStatusLcarsFullscreenState] = useState(false);
  const [bottomDockHeightPx, setBottomDockHeightPx] = useState(TERMINAL_PANEL_HEIGHT);
  const [logIntegrationWhitelist, setLogIntegrationWhitelistState] = useState<string[] | null>(null);
  const [logIntegrationFilterPanelOpen, setLogIntegrationFilterPanelOpen] = useState(false);
  const [dockView, setDockView] = useState<StatusDockView>('logs');
  const [perfRangeMs, setPerfRangeMs] = useState<number>(86_400_000);
  const [currentSourceId, setCurrentSourceId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_LOG_INTEGRATION_WHITELIST);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === null) setLogIntegrationWhitelistState(null);
      else if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        setLogIntegrationWhitelistState(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setLogIntegrationWhitelist = useCallback((v: string[] | null) => {
    setLogIntegrationWhitelistState(v);
    try {
      localStorage.setItem(STORAGE_LOG_INTEGRATION_WHITELIST, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }, []);

  const initLogIntegrationWhitelistIfNeeded = useCallback(() => {
    setLogIntegrationWhitelistState((prev) => {
      if (prev !== null) return prev;
      const all = [SYSTEM_LOG_SOURCE_ID, 'software-update', 'cameras', ...KNOWN_INTEGRATIONS.map((i) => i.id)];
      try {
        localStorage.setItem(STORAGE_LOG_INTEGRATION_WHITELIST, JSON.stringify(all));
      } catch {
        /* ignore */
      }
      return all;
    });
  }, []);

  const openWithSourceFilter = useCallback((source: string) => {
    setLogIntegrationWhitelistState([source]);
    try {
      localStorage.setItem(STORAGE_LOG_INTEGRATION_WHITELIST, JSON.stringify([source]));
    } catch { /* ignore */ }
    setLogFilter('all');
    setOpen(true);
    setLogAutoScroll(true);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_SHOW_NAV);
    if (raw === 'false') setShowNavButtonState(false);
    if (raw === 'true') setShowNavButtonState(true);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_LOG_DETAIL);
    if (raw === 'digest' || raw === 'terminal') setLogDetailStyleState(raw);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_TERMINAL_MAIN_COLUMN);
    if (raw === 'true') setStatusLcarsFullscreenState(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setStatusLcarsFullscreenState(false);
      localStorage.setItem(STORAGE_TERMINAL_MAIN_COLUMN, 'false');
    }
  }, [open]);

  useEffect(() => {
    if (!statusLcarsFullscreen) setLogIntegrationFilterPanelOpen(false);
  }, [statusLcarsFullscreen]);

  useEffect(() => {
    if (terminalDockPlacement !== 'bottom' || !open || !statusLcarsFullscreen) {
      setBottomDockHeightPx(TERMINAL_PANEL_HEIGHT);
      return;
    }
    const sync = () => setBottomDockHeightPx(Math.max(260, window.innerHeight - 100));
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [terminalDockPlacement, open, statusLcarsFullscreen]);

  const setStatusLcarsFullscreen = useCallback((v: boolean) => {
    setStatusLcarsFullscreenState(v);
    localStorage.setItem(STORAGE_TERMINAL_MAIN_COLUMN, String(v));
  }, []);

  const setShowNavButton = useCallback((v: boolean) => {
    setShowNavButtonState(v);
    localStorage.setItem(STORAGE_SHOW_NAV, String(v));
  }, []);

  const setLogDetailStyle = useCallback((s: TerminalLogDetailStyle) => {
    setLogDetailStyleState(s);
    localStorage.setItem(STORAGE_LOG_DETAIL, s);
  }, []);

  const value = useMemo(
    () => ({
      canUse,
      showNavButton,
      setShowNavButton,
      open,
      setOpen,
      logFilter,
      setLogFilter,
      logDetailStyle,
      setLogDetailStyle,
      terminalDockPlacement,
      logAutoScroll,
      setLogAutoScroll,
      hasRecentLogError,
      statusLcarsFullscreen,
      setStatusLcarsFullscreen,
      bottomDockHeightPx,
      logIntegrationWhitelist,
      setLogIntegrationWhitelist,
      logIntegrationFilterPanelOpen,
      setLogIntegrationFilterPanelOpen,
      initLogIntegrationWhitelistIfNeeded,
      openWithSourceFilter,
      dockView,
      setDockView,
      perfRangeMs,
      setPerfRangeMs,
      currentSourceId,
      setCurrentSourceId,
    }),
    [
      canUse,
      showNavButton,
      setShowNavButton,
      open,
      logFilter,
      logDetailStyle,
      setLogDetailStyle,
      terminalDockPlacement,
      logAutoScroll,
      hasRecentLogError,
      statusLcarsFullscreen,
      setStatusLcarsFullscreen,
      bottomDockHeightPx,
      logIntegrationWhitelist,
      setLogIntegrationWhitelist,
      logIntegrationFilterPanelOpen,
      initLogIntegrationWhitelistIfNeeded,
      openWithSourceFilter,
      dockView,
      perfRangeMs,
      currentSourceId,
      setCurrentSourceId,
    ],
  );

  return (
    <SystemTerminalContext.Provider value={value}>
      {children}
      {canUse && open && terminalDockPlacement === 'bottom' && (
        <SystemTerminalDock
          sidebarOffsetPx={sidebarOffsetPx}
          onClose={() => setOpen(false)}
          placement="bottom"
          panelHeightPx={statusLcarsFullscreen ? bottomDockHeightPx : TERMINAL_PANEL_HEIGHT}
          onHeightChange={setBottomDockHeightPx}
          currentSourceId={currentSourceId}
        />
      )}
    </SystemTerminalContext.Provider>
  );
}

export function useSystemTerminal(): SystemTerminalContextValue {
  const ctx = useContext(SystemTerminalContext);
  if (!ctx) throw new Error('useSystemTerminal must be used within SystemTerminalProvider');
  return ctx;
}

/** Bottom inset when the terminal docks to the bottom (not used for LCARS top dock). */
export function useSystemTerminalBottomInset(): number {
  const ctx = useContext(SystemTerminalContext);
  if (!ctx?.canUse || !ctx.open) return 0;
  if (ctx.terminalDockPlacement === 'top') return 0;
  return ctx.bottomDockHeightPx;
}
