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

const STORAGE_SHOW_NAV = 'ha-ui-show-terminal-nav';
const STORAGE_LOG_DETAIL = 'ha-ui-terminal-log-detail';

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
  const [logFilter, setLogFilter] = useState<TerminalLogFilter>('all');
  const [logDetailStyle, setLogDetailStyleState] = useState<TerminalLogDetailStyle>('terminal');
  const [logAutoScroll, setLogAutoScroll] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_SHOW_NAV);
    if (raw === 'false') setShowNavButtonState(false);
    if (raw === 'true') setShowNavButtonState(true);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_LOG_DETAIL);
    if (raw === 'digest' || raw === 'terminal') setLogDetailStyleState(raw);
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
