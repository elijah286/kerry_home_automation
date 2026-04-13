'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface FooterSlotContextValue {
  footerFirstExtra: ReactNode | null;
  setFooterFirstExtra: (node: ReactNode | null) => void;
}

const FooterSlotCtx = createContext<FooterSlotContextValue>({
  footerFirstExtra: null,
  setFooterFirstExtra: () => {},
});

export function useFooterSlot() {
  return useContext(FooterSlotCtx);
}

export function FooterSlotProvider({ children }: { children: ReactNode }) {
  const [footerFirstExtra, setFooterFirstExtra] = useState<ReactNode | null>(null);
  return (
    <FooterSlotCtx.Provider value={{ footerFirstExtra, setFooterFirstExtra }}>
      {children}
    </FooterSlotCtx.Provider>
  );
}
