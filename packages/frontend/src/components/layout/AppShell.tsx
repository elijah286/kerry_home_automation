'use client';

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { ChatBot } from '../ChatBot';
import { useConnected } from '@/hooks/useWebSocket';

export function AppShell({ children }: { children: ReactNode }) {
  const connected = useConnected();

  return (
    <div className="min-h-screen">
      <Sidebar connected={connected} />
      <BottomNav />
      <main className="md:ml-56 pb-16 md:pb-0">
        {children}
      </main>
      <ChatBot />
    </div>
  );
}
