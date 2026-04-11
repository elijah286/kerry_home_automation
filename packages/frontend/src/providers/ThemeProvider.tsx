'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getThemeById, type Theme } from '@/lib/themes';

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

  // Remove all inline CSS custom properties (theme variables)
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');
  const [activeTheme, setActiveThemeState] = useState('default');
  const [fontSize, setFontSizeState] = useState(14);

  // Load saved preferences on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('ha-theme') as ThemeMode | null;
    const savedTheme = localStorage.getItem('ha-active-theme') || 'default';
    const savedSize = Number(localStorage.getItem('ha-font-size')) || 14;

    const mode = savedMode && ['light', 'dark', 'system'].includes(savedMode) ? savedMode : 'system';
    const r = resolveTheme(mode);

    setThemeState(mode);
    setResolved(r);
    setActiveThemeState(savedTheme);
    setFontSizeState(savedSize);

    document.documentElement.setAttribute('data-theme', r);
    document.documentElement.setAttribute('data-active-theme', savedTheme);
    document.documentElement.style.setProperty('--font-size-base', `${savedSize}px`);
    applyThemeVariables(savedTheme, r);
  }, []);

  // Listen to system theme changes
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

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    localStorage.setItem('ha-theme', mode);
    const r = resolveTheme(mode);
    setResolved(r);
    document.documentElement.setAttribute('data-theme', r);
    applyThemeVariables(activeTheme, r);
  };

  const setActiveTheme = (id: string) => {
    setActiveThemeState(id);
    localStorage.setItem('ha-active-theme', id);
    document.documentElement.setAttribute('data-active-theme', id);
    applyThemeVariables(id, resolved);
  };

  const setFontSize = (size: number) => {
    setFontSizeState(size);
    localStorage.setItem('ha-font-size', String(size));
    document.documentElement.style.setProperty('--font-size-base', `${size}px`);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved, activeTheme, setActiveTheme, fontSize, setFontSize }}>
      {children}
    </ThemeContext.Provider>
  );
}
