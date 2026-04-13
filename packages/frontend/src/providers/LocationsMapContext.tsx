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
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  buildMapTrackableList,
  trackableToLocatable,
  type LocatableDevice,
  type MapTrackableDevice,
} from '@/lib/locations-map';

const LS_HIDDEN_IDS = 'ha-locations-map-hidden-ids';

interface LocationsMapContextValue {
  /** Vehicles + other locators; vehicles appear even when GPS not yet available */
  trackableDevices: MapTrackableDevice[];
  /** Markers only — has coordinates and not hidden */
  visibleLocatableDevices: LocatableDevice[];
  hiddenIds: Set<string>;
  toggleDeviceOnMap: (id: string) => void;
  prefsHydrated: boolean;
}

const LocationsMapContext = createContext<LocationsMapContextValue | null>(null);

export function LocationsMapProvider({ children }: { children: ReactNode }) {
  const { devices } = useWebSocket();

  const trackableDevices = useMemo(() => buildMapTrackableList(devices), [devices]);

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [prefsHydrated, setPrefsHydrated] = useState(false);

  useEffect(() => {
    try {
      const rawHidden = localStorage.getItem(LS_HIDDEN_IDS);
      if (rawHidden) setHiddenIds(new Set(JSON.parse(rawHidden) as string[]));
    } catch {
      /* ignore */
    }
    setPrefsHydrated(true);
  }, []);

  useEffect(() => {
    if (!prefsHydrated) return;
    try {
      localStorage.setItem(LS_HIDDEN_IDS, JSON.stringify([...hiddenIds]));
    } catch {
      /* ignore */
    }
  }, [hiddenIds, prefsHydrated]);

  const trackableIds = useMemo(
    () => new Set(trackableDevices.map((d) => d.id)),
    [trackableDevices],
  );

  useEffect(() => {
    setHiddenIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (trackableIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [trackableIds]);

  const toggleDeviceOnMap = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visibleLocatableDevices = useMemo(() => {
    const out: LocatableDevice[] = [];
    for (const t of trackableDevices) {
      if (hiddenIds.has(t.id)) continue;
      const loc = trackableToLocatable(t);
      if (loc) out.push(loc);
    }
    return out;
  }, [trackableDevices, hiddenIds]);

  const value = useMemo(
    () => ({
      trackableDevices,
      visibleLocatableDevices,
      hiddenIds,
      toggleDeviceOnMap,
      prefsHydrated,
    }),
    [trackableDevices, visibleLocatableDevices, hiddenIds, toggleDeviceOnMap, prefsHydrated],
  );

  return (
    <LocationsMapContext.Provider value={value}>{children}</LocationsMapContext.Provider>
  );
}

export function useLocationsMap(): LocationsMapContextValue {
  const ctx = useContext(LocationsMapContext);
  if (!ctx) throw new Error('useLocationsMap must be used within LocationsMapProvider');
  return ctx;
}
