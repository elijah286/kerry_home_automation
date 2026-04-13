'use client';

import { useState, createContext, useContext, type ReactNode } from 'react';

export type AlertLevel = 'none' | 'yellow' | 'red';

interface AlertContextValue {
  alertLevel: AlertLevel;
  setAlertLevel: (level: AlertLevel) => void;
}

const AlertContext = createContext<AlertContextValue>({
  alertLevel: 'none',
  setAlertLevel: () => {},
});

export function useAlert() {
  return useContext(AlertContext);
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alertLevel, setAlertLevel] = useState<AlertLevel>('none');
  return (
    <AlertContext.Provider value={{ alertLevel, setAlertLevel }}>
      {children}
    </AlertContext.Provider>
  );
}

/** @deprecated Red/yellow state is shown on the frame and Bridge controls only; no floating banner. */
export function LCARSAlertBanner() {
  return null;
}
