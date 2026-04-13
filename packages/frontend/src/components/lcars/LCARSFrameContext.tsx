'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface LCARSFrameGeometry {
  contentTop: number;
  contentBottom: number;
  contentLeft: number;
  contentRight: number;
  barW: number;
  elbowW: number;
  headerH: number;
  footerH: number;
  showTopTerminal: boolean;
  topChromeH: number;
  mainChromeTop: number;
}

const LCARSFrameCtx = createContext<LCARSFrameGeometry | null>(null);

export function useLCARSFrame(): LCARSFrameGeometry | null {
  return useContext(LCARSFrameCtx);
}

export function LCARSFrameProvider({
  value,
  children,
}: {
  value: LCARSFrameGeometry;
  children: ReactNode;
}) {
  return <LCARSFrameCtx.Provider value={value}>{children}</LCARSFrameCtx.Provider>;
}
