'use client';

// ---------------------------------------------------------------------------
// MapCard — Leaflet map with markers for tracker entities.
//
// react-leaflet is loaded dynamically so the leaflet CSS + JS doesn't land on
// dashboards that don't use a map. Markers bind to device.{latitude,longitude}
// when present (vehicle + any future tracker entity).
//
// Trails (`hoursToShow > 0`) are deferred to a follow-up ticket — they need
// per-device location history beyond the state snapshot we persist today.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef } from 'react';
import type { MapCard as MapCardDescriptor, DeviceState } from '@ha/shared';
import { useDevices } from '@/hooks/useDevices';
import { token } from '@/lib/tokens';

interface Point { id: string; name: string; lat: number; lng: number; }

export function MapCard({ card }: { card: MapCardDescriptor }) {
  // Single useDevices call with a selector that keeps only the entities this
  // card references. Selector must be stable across renders — memoise on the
  // entity-id set so re-renders don't spam the store.
  const selector = useMemo(() => {
    const ids = new Set(card.entities);
    return (all: DeviceState[]) => all.filter((d) => ids.has(d.id));
  }, [card.entities]);
  const devices = useDevices(selector);
  const points = devices
    .map((d) => toPoint(d.id, d))
    .filter((p): p is Point => p !== null);

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{
        background: token('--color-bg-card'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="map"
    >
      <LeafletMap points={points} autoFit={card.autoFit} themeMode={card.themeMode} />
      {points.length === 0 && (
        <div className="px-3 py-2 text-xs" style={{ color: token('--color-text-muted') }}>
          No trackable entities have a location yet.
        </div>
      )}
    </div>
  );
}

function toPoint(entityId: string, device: DeviceState | undefined): Point | null {
  if (!device) return null;
  const d = device as unknown as Record<string, unknown>;
  const lat = typeof d.latitude === 'number' ? d.latitude : null;
  const lng = typeof d.longitude === 'number' ? d.longitude : null;
  if (lat == null || lng == null) return null;
  return { id: entityId, name: device.displayName ?? device.name, lat, lng };
}

// ---------------------------------------------------------------------------
// Map body — imperative Leaflet (not react-leaflet) keeps us off the extra
// wrapper bundle and avoids SSR null-guards.
// ---------------------------------------------------------------------------

function LeafletMap({ points, autoFit, themeMode }: {
  points: Point[];
  autoFit: boolean;
  themeMode: 'auto' | 'light' | 'dark';
}) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof window === 'undefined') return;
    let disposed = false;
    let map: import('leaflet').Map | null = null;

    void Promise.all([
      import('leaflet'),
      // Leaflet's CSS must land before the map mounts or tiles render
      // at 0px. Dynamic stylesheet injection avoids forcing the global
      // CSS import on dashboards that don't use a map.
      import('leaflet/dist/leaflet.css' as string).catch(() => { /* optional */ }),
    ]).then(([leaflet]) => {
      if (disposed) return;
      // Leaflet ships both CJS (`default`) and ESM namespace exports.
      const L = (leaflet as unknown as { default?: typeof import('leaflet') }).default ?? leaflet;
      map = L.map(el, { attributionControl: false, zoomControl: true }).setView([39.5, -98.35], 4);

      const dark = themeMode === 'dark' ||
        (themeMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const tileUrl = dark
        ? 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

      const markers = points.map((p) => L.marker([p.lat, p.lng]).bindTooltip(p.name).addTo(map!));

      if (autoFit && markers.length > 0) {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
      }
    });

    return () => { disposed = true; map?.remove(); };
    // We intentionally re-run on every point set change; the map is cheap
    // to tear down and rebuilding avoids stale-marker bookkeeping.
  }, [JSON.stringify(points), autoFit, themeMode]);

  return <div ref={mapRef} style={{ height: 240, width: '100%' }} />;
}
