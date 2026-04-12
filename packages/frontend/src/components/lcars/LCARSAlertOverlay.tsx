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

/**
 * LCARS Alert Banner — floating pill at top center.
 * The actual frame color transformation is handled by LCARSVariantProvider
 * which resolves alert-modified colors.
 */
export function LCARSAlertBanner() {
  const { alertLevel, setAlertLevel } = useAlert();

  if (alertLevel === 'none') return null;

  const isRed = alertLevel === 'red';
  const color = isRed ? '#ff2200' : '#ffcc00';
  const label = isRed ? 'RED ALERT' : 'YELLOW ALERT';

  return (
    <div
      onClick={() => setAlertLevel('none')}
      className={isRed ? 'lcars-alert-banner lcars-alert-banner--red' : 'lcars-alert-banner lcars-alert-banner--yellow'}
      style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 32px',
        background: color,
        borderBottomLeftRadius: 999,
        borderBottomRightRadius: 999,
        cursor: 'pointer',
      }}
      title="Click to dismiss"
    >
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: '#000', animation: 'lcars-blink 0.5s infinite',
      }} />
      <span style={{
        color: '#000', fontFamily: "'Antonio', 'Helvetica Neue', sans-serif",
        fontWeight: 700, fontSize: 16, letterSpacing: '0.2em', textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: '#000', animation: 'lcars-blink 0.5s infinite',
      }} />
    </div>
  );
}
