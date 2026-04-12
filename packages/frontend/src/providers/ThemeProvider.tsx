'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getThemeById } from '@/lib/themes';
import { useAuth } from '@/providers/AuthProvider';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  resolved: 'light' | 'dark';
  activeTheme: string;
  setActiveTheme: (id: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  resolved: 'dark',
  activeTheme: 'default',
  setActiveTheme: () => {},
  fontSize: 14,
  setFontSize: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

function applyThemeVariables(themeId: string, resolved: 'light' | 'dark') {
  const t = getThemeById(themeId);
  const root = document.documentElement;

  for (let i = root.style.length - 1; i >= 0; i--) {
    const prop = root.style[i];
    if (prop.startsWith('--') && prop !== '--font-size-base') {
      root.style.removeProperty(prop);
    }
  }

  if (t && t.variables) {
    const vars = t.variables[resolved] ?? {};
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }

  root.setAttribute('data-active-theme', themeId);
}

function applyVisualState(mode: ThemeMode, themeId: string, fontSize: number) {
  const r = resolveTheme(mode);
  document.documentElement.setAttribute('data-theme', r);
  document.documentElement.setAttribute('data-active-theme', themeId);
  document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`);
  applyThemeVariables(themeId, r);
  return r;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading, uiPreferences, uiPreferenceLocks, patchUiPreferences } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');
  const [activeTheme, setActiveThemeState] = useState('default');
  const [fontSize, setFontSizeState] = useState(14);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      const savedMode = localStorage.getItem('ha-theme') as ThemeMode | null;
      const savedTheme = localStorage.getItem('ha-active-theme') || 'default';
      const savedSize = Number(localStorage.getItem('ha-font-size')) || 14;
      const mode = savedMode && ['light', 'dark', 'system'].includes(savedMode) ? savedMode : 'system';
      const r = applyVisualState(mode, savedTheme, savedSize);
      setThemeState(mode);
      setResolved(r);
      setActiveThemeState(savedTheme);
      setFontSizeState(savedSize);
      return;
    }

    const mode = (uiPreferences.colorMode as ThemeMode | undefined) ?? 'system';
    const tid = uiPreferences.activeTheme ?? 'default';
    const fs = uiPreferences.fontSize ?? 14;
    const r = applyVisualState(mode, tid, fs);
    setThemeState(mode);
    setResolved(r);
    setActiveThemeState(tid);
    setFontSizeState(fs);
    localStorage.setItem('ha-theme', mode);
    localStorage.setItem('ha-active-theme', tid);
    localStorage.setItem('ha-font-size', String(fs));
  }, [
    loading,
    user,
    uiPreferences.colorMode,
    uiPreferences.activeTheme,
    uiPreferences.fontSize,
  ]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const r = getSystemTheme();
      setResolved(r);
      document.documentElement.setAttribute('data-theme', r);
      applyThemeVariables(activeTheme, r);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme, activeTheme]);

  const setTheme = useCallback(
    (mode: ThemeMode) => {
      if (user && uiPreferenceLocks.colorMode) return;
      setThemeState(mode);
      localStorage.setItem('ha-theme', mode);
      const r = resolveTheme(mode);
      setResolved(r);
      document.documentElement.setAttribute('data-theme', r);
      applyThemeVariables(activeTheme, r);
      if (user && !uiPreferenceLocks.colorMode) {
        void patchUiPreferences({ colorMode: mode });
      }
    },
    [user, uiPreferenceLocks.colorMode, activeTheme, patchUiPreferences],
  );

  const setActiveTheme = useCallback(
    (id: string) => {
      if (user && uiPreferenceLocks.activeTheme) return;
      setActiveThemeState(id);
      localStorage.setItem('ha-active-theme', id);
      document.documentElement.setAttribute('data-active-theme', id);
      applyThemeVariables(id, resolved);
      if (user && !uiPreferenceLocks.activeTheme) {
        void patchUiPreferences({ activeTheme: id });
      }
    },
    [user, uiPreferenceLocks.activeTheme, resolved, patchUiPreferences],
  );

  const setFontSize = useCallback(
    (size: number) => {
      if (user && uiPreferenceLocks.fontSize) return;
      setFontSizeState(size);
      localStorage.setItem('ha-font-size', String(size));
      document.documentElement.style.setProperty('--font-size-base', `${size}px`);
      if (user && !uiPreferenceLocks.fontSize) {
        void patchUiPreferences({ fontSize: size });
      }
    },
    [user, uiPreferenceLocks.fontSize, patchUiPreferences],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved, activeTheme, setActiveTheme, fontSize, setFontSize }}>
      {children}
    </ThemeContext.Provider>
  );
}
