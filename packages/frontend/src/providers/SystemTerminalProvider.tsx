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
import { Permission } from '@ha/shared';
import { useAuth } from '@/providers/AuthProvider';
import { SystemTerminalDock } from '@/components/layout/SystemTerminalDock';
import { useSystemLogErrorAlert } from '@/hooks/useSystemLogErrorAlert';

const STORAGE_SHOW_NAV = 'ha-ui-show-terminal-nav';
const STORAGE_LOG_DETAIL = 'ha-ui-terminal-log-detail';
/** Terminal log expanded into main column (LCARS top dock or standard bottom dock). */
const STORAGE_TERMINAL_MAIN_COLUMN = 'ha-ui-lcars-status-fullscreen';

export const TERMINAL_PANEL_HEIGHT = 200;

export type TerminalLogFilter = 'all' | 'info' | 'warn' | 'error';

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
  return ctx.statusLcarsFullscreen ? ctx.bottomDockHeightPx : TERMINAL_PANEL_HEIGHT;
}
