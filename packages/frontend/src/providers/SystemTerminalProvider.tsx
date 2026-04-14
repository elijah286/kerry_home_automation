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
const STORAGE_LCARS_STATUS_FULL = 'ha-ui-lcars-status-fullscreen';

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
    if (terminalDockPlacement !== 'top') return;
    const raw = localStorage.getItem(STORAGE_LCARS_STATUS_FULL);
    if (raw === 'true') setStatusLcarsFullscreenState(true);
  }, [terminalDockPlacement]);

  useEffect(() => {
    if (!open) {
      setStatusLcarsFullscreenState(false);
      localStorage.setItem(STORAGE_LCARS_STATUS_FULL, 'false');
    }
  }, [open]);

  const setStatusLcarsFullscreen = useCallback((v: boolean) => {
    setStatusLcarsFullscreenState(v);
    if (terminalDockPlacement === 'top') {
      localStorage.setItem(STORAGE_LCARS_STATUS_FULL, String(v));
    }
  }, [terminalDockPlacement]);

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
  return TERMINAL_PANEL_HEIGHT;
}
