'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Plus, Minus } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LocatableDevice, HistoryPoint } from '@/app/locations/page';

// ---------------------------------------------------------------------------
// Marker icon (avoids broken default icon with bundlers)
// ---------------------------------------------------------------------------

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

function makeIcon(index: number) {
  const color = COLORS[index % COLORS.length];
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${color};border:3px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      font-size:14px;
    ">🚗</div>`,
  });
}

// ---------------------------------------------------------------------------
// Auto-fit bounds
// ---------------------------------------------------------------------------

function FitBounds({ devices }: { devices: LocatableDevice[] }) {
  const map = useMap();
  const prevSig = useRef('');

  useEffect(() => {
    if (devices.length === 0) return;
    const sig = devices.map((d) => d.id).sort().join('\0');
    // Auto-fit when the set of mapped devices changes (not every GPS tick)
    if (sig !== prevSig.current) {
      const bounds = L.latLngBounds(devices.map((d) => [d.latitude, d.longitude]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      prevSig.current = sig;
    }
  }, [devices, map]);

  return null;
}

// ---------------------------------------------------------------------------
// Zoom / recenter overlay
// ---------------------------------------------------------------------------

function MapControls({ devices }: { devices: LocatableDevice[] }) {
  const map = useMap();

  const recenter = () => {
    if (devices.length === 0) return;
    const bounds = L.latLngBounds(devices.map((d) => [d.latitude, d.longitude]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  };

  const btnStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--color-card-bg)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
  };

  return (
    <div
      className="leaflet-bottom leaflet-right"
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className="leaflet-control"
        style={{
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          marginBottom: 16,
          marginRight: 10,
        }}
      >
        <button onClick={() => map.zoomIn()} style={{ ...btnStyle, borderBottom: 'none', borderRadius: '8px 8px 0 0' }} aria-label="Zoom in">
          <Plus className="h-4 w-4" />
        </button>
        <button onClick={() => map.zoomOut()} style={{ ...btnStyle, borderBottom: 'none' }} aria-label="Zoom out">
          <Minus className="h-4 w-4" />
        </button>
        <button onClick={recenter} style={{ ...btnStyle, borderRadius: '0 0 8px 8px' }} aria-label="Re-center on devices">
          <Crosshair className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LocationMapProps {
  devices: LocatableDevice[];
  historyPaths: Record<string, HistoryPoint[]>;
}

export default function LocationMap({ devices, historyPaths }: LocationMapProps) {
  const icons = useMemo(
    () => new Map(devices.map((d, i) => [d.id, makeIcon(i)])),
    [devices.map((d) => d.id).join(',')],
  );

  const center: [number, number] = devices.length > 0
    ? [devices[0].latitude, devices[0].longitude]
    : [39.8283, -98.5795];

  return (
    <MapContainer
      center={center}
      zoom={devices.length > 0 ? 13 : 4}
      style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBounds devices={devices} />
      <MapControls devices={devices} />

      {devices.map((d) => (
        <Marker
          key={d.id}
          position={[d.latitude, d.longitude]}
          icon={icons.get(d.id) ?? makeIcon(0)}
        >
          <Popup>
            <strong>{d.displayName || d.name}</strong>
          </Popup>
        </Marker>
      ))}

      {Object.entries(historyPaths).map(([deviceId, points], i) =>
        points.length > 1 ? (
          <Polyline
            key={deviceId}
            positions={points.map((p) => [p.lat, p.lng])}
            pathOptions={{
              color: COLORS[i % COLORS.length],
              weight: 3,
              opacity: 0.7,
              dashArray: '6 4',
            }}
          />
        ) : null,
      )}
    </MapContainer>
  );
}
