'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { LCARS_PALETTES, TNG_PALETTE, type LCARSPalette } from './colors';
import { useAlert, type AlertLevel } from './LCARSAlertOverlay';

const STORAGE_KEY = 'lcars-variant';

interface LCARSVariantContextValue {
  variant: string;
  setVariant: (v: string) => void;
  palette: LCARSPalette;
  /** Resolved colors accounting for alert state */
  colors: ResolvedColors;
}

export interface ResolvedColors {
  elbowTop: string;
  elbowBottom: string;
  headerBar: string;
  footerBar: string;
  verticalSegments: string[];
  footerSegments: string[];
  navColors: string[];
  navActive: string;
  accent: string;
  muted: string;
  text: string;
}

function resolveColors(palette: LCARSPalette, alertLevel: AlertLevel): ResolvedColors {
  if (alertLevel === 'red') {
    return {
      elbowTop: palette.redAlert.elbowTop,
      elbowBottom: palette.redAlert.elbowBottom,
      headerBar: palette.redAlert.headerBar,
      footerBar: palette.redAlert.footerBar,
      verticalSegments: palette.redAlert.verticalSegments,
      footerSegments: palette.redAlert.footerSegments,
      navColors: palette.redAlert.navColors,
      navActive: palette.redAlert.navActive,
      accent: palette.redAlert.accent,
      muted: '#a0a0a0',
      text: '#000000',
    };
  }
  if (alertLevel === 'yellow') {
    return {
      elbowTop: '#ccaa00',
      elbowBottom: '#aa8800',
      headerBar: '#ccaa00',
      footerBar: '#aa8800',
      verticalSegments: ['#bbaa00', '#ccaa00', '#998800', '#bbaa00'],
      footerSegments: ['#aa8800', '#bbaa00', '#998800', '#ccaa00'],
      navColors: palette.navColors.map(() => '#aa8800'),
      navActive: '#ffcc00',
      accent: '#ffcc00',
      muted: '#666622',
      text: '#000000',
    };
  }
  return {
    elbowTop: palette.elbowTop,
    elbowBottom: palette.elbowBottom,
    headerBar: palette.headerBar,
    footerBar: palette.footerBar,
    verticalSegments: palette.verticalSegments,
    footerSegments: palette.footerSegments,
    navColors: palette.navColors,
    navActive: palette.navActive,
    accent: palette.accent,
    muted: palette.muted,
    text: palette.text,
  };
}

const LCARSVariantContext = createContext<LCARSVariantContextValue>({
  variant: 'tng',
  setVariant: () => {},
  palette: TNG_PALETTE,
  colors: resolveColors(TNG_PALETTE, 'none'),
});

export function useLCARSVariant() {
  return useContext(LCARSVariantContext);
}

export function LCARSVariantProvider({ children }: { children: ReactNode }) {
  const { user, uiPreferences, uiPreferenceLocks, patchUiPreferences } = useAuth();
  const [variant, setVariantState] = useState('tng');
  const { alertLevel } = useAlert();

  useEffect(() => {
    if (user) {
      const v = uiPreferences.lcarsVariant;
      if (v && LCARS_PALETTES[v]) {
        setVariantState(v);
        localStorage.setItem(STORAGE_KEY, v);
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && LCARS_PALETTES[stored]) setVariantState(stored);
      }
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LCARS_PALETTES[stored]) {
      setVariantState(stored);
    }
  }, [user, uiPreferences.lcarsVariant]);

  const setVariant = useCallback(
    (v: string) => {
      if (!LCARS_PALETTES[v]) return;
      if (user && uiPreferenceLocks.lcarsVariant) return;
      setVariantState(v);
      localStorage.setItem(STORAGE_KEY, v);
      if (user && !uiPreferenceLocks.lcarsVariant) {
        void patchUiPreferences({ lcarsVariant: v });
      }
    },
    [user, uiPreferenceLocks.lcarsVariant, patchUiPreferences],
  );

  const palette = LCARS_PALETTES[variant] || TNG_PALETTE;
  const colors = resolveColors(palette, alertLevel);

  return (
    <LCARSVariantContext.Provider value={{ variant, setVariant, palette, colors }}>
      {children}
    </LCARSVariantContext.Provider>
  );
}
