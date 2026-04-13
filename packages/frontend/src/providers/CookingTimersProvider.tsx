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

export interface CookingTimer {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  running: boolean;
}

export function formatCookingTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface CookingTimersContextValue {
  timers: CookingTimer[];
  addTimer: (label: string, seconds: number) => void;
  toggleTimer: (id: string) => void;
  resetTimer: (id: string) => void;
  removeTimer: (id: string) => void;
  updateTimerLabel: (id: string, label: string) => void;
  stopTimer: (id: string) => void;
}

const CookingTimersContext = createContext<CookingTimersContextValue | null>(null);

export function useCookingTimers(): CookingTimersContextValue {
  const ctx = useContext(CookingTimersContext);
  if (!ctx) throw new Error('useCookingTimers must be used within CookingTimersProvider');
  return ctx;
}

export function CookingTimersProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<CookingTimer[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimers((prev) => {
        let changed = false;
        const next = prev.map((t) => {
          if (t.running && t.remainingSeconds > 0) {
            changed = true;
            return { ...t, remainingSeconds: t.remainingSeconds - 1 };
          }
          return t;
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const addTimer = useCallback((label: string, seconds: number) => {
    setTimers((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label,
        totalSeconds: seconds,
        remainingSeconds: seconds,
        running: true,
      },
    ]);
  }, []);

  const toggleTimer = useCallback((id: string) => {
    setTimers((prev) => prev.map((t) => (t.id === id ? { ...t, running: !t.running } : t)));
  }, []);

  const resetTimer = useCallback((id: string) => {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, remainingSeconds: t.totalSeconds, running: false } : t,
      ),
    );
  }, []);

  const removeTimer = useCallback((id: string) => {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateTimerLabel = useCallback((id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setTimers((prev) => prev.map((t) => (t.id === id ? { ...t, label: trimmed } : t)));
  }, []);

  const stopTimer = useCallback((id: string) => {
    setTimers((prev) => prev.map((t) => (t.id === id ? { ...t, running: false } : t)));
  }, []);

  const value = useMemo(
    () => ({
      timers,
      addTimer,
      toggleTimer,
      resetTimer,
      removeTimer,
      updateTimerLabel,
      stopTimer,
    }),
    [timers, addTimer, toggleTimer, resetTimer, removeTimer, updateTimerLabel, stopTimer],
  );

  return <CookingTimersContext.Provider value={value}>{children}</CookingTimersContext.Provider>;
}
