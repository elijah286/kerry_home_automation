'use client';

// ---------------------------------------------------------------------------
// Card handlers context — one place for the dashboard shell to inject the
// app-level callbacks that cards need (router navigation, more-info dialog).
// Every card accesses them via `useCardHandlers()` so no card component
// takes a router dependency directly. Swapping out the router or the dialog
// system is a one-line change in the provider.
// ---------------------------------------------------------------------------

import { createContext, useContext, type ReactNode } from 'react';
import type { DeviceCommandHandlers } from '@/hooks/useDeviceCommand';

const CardHandlersContext = createContext<DeviceCommandHandlers>({});

export function CardHandlersProvider({
  handlers,
  children,
}: {
  handlers: DeviceCommandHandlers;
  children: ReactNode;
}) {
  return (
    <CardHandlersContext.Provider value={handlers}>{children}</CardHandlersContext.Provider>
  );
}

export function useCardHandlers(): DeviceCommandHandlers {
  return useContext(CardHandlersContext);
}
