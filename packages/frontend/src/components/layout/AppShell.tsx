'use client';

import type { ReactNode } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { AssistantProvider } from '../ChatBot';
import { CookingTimersProvider } from '@/providers/CookingTimersProvider';
import { useConnected } from '@/hooks/useWebSocket';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useTheme } from '@/providers/ThemeProvider';
import { SystemTerminalProvider, useSystemTerminalBottomInset } from '@/providers/SystemTerminalProvider';
import { LCARSFrame } from '../lcars/LCARSFrame';
import { AppHeaderBar } from './AppHeaderBar';

const STORAGE_KEY = 'sidebar-collapsed';

function AppShellMain({
  children,
  collapsed,
  mounted,
  isMdUp,
}: {
  children: ReactNode;
  collapsed: boolean;
  mounted: boolean;
  isMdUp: boolean;
}) {
  const terminalBottom = useSystemTerminalBottomInset();
  const sidebarWidth = mounted ? (collapsed ? 56 : 224) : 224;

  const paddingBottom = useMemo(() => {
    if (!isMdUp) {
      if (terminalBottom > 0) return 64 + terminalBottom;
      return 64;
    }
    return terminalBottom > 0 ? terminalBottom : 0;
  }, [isMdUp, terminalBottom]);

  return (
    <main
      className="transition-[margin-left,padding-bottom] duration-200 ease-in-out"
      style={{
        ['--sidebar-w' as string]: `${sidebarWidth}px`,
        paddingBottom: paddingBottom || undefined,
      }}
    >
      <style>{`@media (min-width: 768px) { main { margin-left: var(--sidebar-w, 224px); } }`}</style>
      <AppHeaderBar />
      {children}
    </main>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const connected = useConnected();
  const { activeTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isMdUp = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') setCollapsed(true);
    setMounted(true);
  }, []);

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const isLCARS = activeTheme === 'lcars';

  const sidebarWidth = mounted ? (collapsed ? 56 : 224) : 224;
  /** LCARS main column starts past elbow (bar + inner curve). */
  const LCARS_BAR = collapsed ? 56 : 150;
  const LCARS_INNER_R = 28;
  const lcarsContentLeft = LCARS_BAR + LCARS_INNER_R;
  const terminalLeftOffset = isMdUp ? (isLCARS ? lcarsContentLeft : sidebarWidth) : 0;

  return (
    <CookingTimersProvider>
    <AssistantProvider>
      {isLCARS ? (
        <SystemTerminalProvider
          sidebarOffsetPx={terminalLeftOffset}
          terminalDockPlacement="top"
        >
          <LCARSFrame collapsed={collapsed} onToggle={handleToggle}>
            {children}
          </LCARSFrame>
        </SystemTerminalProvider>
      ) : (
        <SystemTerminalProvider sidebarOffsetPx={terminalLeftOffset}>
          <div className="min-h-screen">
            <Sidebar connected={connected} collapsed={collapsed} onToggle={handleToggle} />
            <BottomNav />
            <AppShellMain collapsed={collapsed} mounted={mounted} isMdUp={isMdUp}>
              {children}
            </AppShellMain>
          </div>
        </SystemTerminalProvider>
      )}
    </AssistantProvider>
    </CookingTimersProvider>
  );
}
