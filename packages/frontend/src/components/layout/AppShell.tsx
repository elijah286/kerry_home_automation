'use client';

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useWebSocket } from '@/hooks/useWebSocket';

export function AppShell({ children }: { children: ReactNode }) {
  const { connected } = useWebSocket();

  return (
    <div className="min-h-screen">
      <Sidebar connected={connected} />
      <BottomNav />
      <main className="md:ml-56 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  );
}
