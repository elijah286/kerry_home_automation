'use client';

/**
 * Lets a page append an extra crumb to the global header breadcrumb trail
 * without needing a new route. Useful when an inline "fullscreen" view
 * doesn't change the URL pathname (e.g. selecting a camera on /cameras
 * should show "Dashboard > Cameras > Back Door" even though the URL is
 * still just /cameras).
 *
 * Usage:
 *   const { setExtra } = useBreadcrumbOverride();
 *   useEffect(() => {
 *     setExtra(selectedCam ? [{ href: '/cameras', label: selectedCam.label, current: true }] : []);
 *     return () => setExtra([]);
 *   }, [selectedCam, setExtra]);
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { BreadcrumbItem } from '@/lib/appBreadcrumbs';

interface Ctx {
  extra: BreadcrumbItem[];
  setExtra: (items: BreadcrumbItem[]) => void;
}

const BreadcrumbOverrideContext = createContext<Ctx>({ extra: [], setExtra: () => {} });

export function BreadcrumbOverrideProvider({ children }: { children: ReactNode }) {
  const [extra, setExtraState] = useState<BreadcrumbItem[]>([]);
  const setExtra = useCallback((items: BreadcrumbItem[]) => setExtraState(items), []);
  const value = useMemo(() => ({ extra, setExtra }), [extra, setExtra]);
  return <BreadcrumbOverrideContext.Provider value={value}>{children}</BreadcrumbOverrideContext.Provider>;
}

export function useBreadcrumbOverride(): Ctx {
  return useContext(BreadcrumbOverrideContext);
}

/**
 * Merges route-derived breadcrumb items with any page-supplied extras.
 * Flips `current` off for pre-existing items when extras are appended so
 * the last extra is the sole "current" crumb.
 */
export function mergeBreadcrumbItems(routeItems: BreadcrumbItem[], extra: BreadcrumbItem[]): BreadcrumbItem[] {
  if (extra.length === 0) return routeItems;
  return [
    ...routeItems.map((i) => ({ ...i, current: false })),
    ...extra,
  ];
}
