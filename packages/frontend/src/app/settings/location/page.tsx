'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { ArrowLeft, MapPin, Search, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

// Dynamically import the map component (Leaflet requires window)
const LocationMap = dynamic(() => import('./LocationMap'), { ssr: false });

async function saveSetting(key: string, value: unknown) {
  await fetch(`${API_BASE}/api/settings/${key}`, { credentials: 'include',
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
}

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'KerryHomeAutomation/3.0' },
  });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

export default function LocationPage() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState('');

  // Load saved location
  useEffect(() => {
    fetch(`${API_BASE}/api/settings`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { settings: Record<string, unknown> }) => {
        const s = data.settings;
        if (typeof s.home_latitude === 'number') setLat(s.home_latitude);
        if (typeof s.home_longitude === 'number') setLon(s.home_longitude);
        if (typeof s.home_address === 'string') setAddress(s.home_address as string);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleGeocode = async () => {
    if (!address.trim()) return;
    setGeocoding(true);
    setError('');
    try {
      const result = await geocodeAddress(address.trim());
      if (!result) {
        setError('Address not found. Try a more specific address.');
        return;
      }
      setLat(result.lat);
      setLon(result.lon);
      await Promise.all([
        saveSetting('home_latitude', result.lat),
        saveSetting('home_longitude', result.lon),
        saveSetting('home_address', address.trim()),
      ]);
    } finally {
      setGeocoding(false);
    }
  };

  const handleMarkerDrag = useCallback(async (newLat: number, newLon: number) => {
    setLat(newLat);
    setLon(newLon);
    await Promise.all([
      saveSetting('home_latitude', newLat),
      saveSetting('home_longitude', newLon),
    ]);
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/settings')}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}>
          <MapPin className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">Location</h1>
      </div>

      {/* Address search */}
      <Card>
        <h2 className="text-sm font-medium mb-1">Home Address</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Enter your address to set the home location. Drag the pin to fine-tune.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGeocode()}
            placeholder="123 Main St, City, State"
            className="flex-1 rounded-md border px-3 py-2 text-sm"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
          <button
            onClick={handleGeocode}
            disabled={geocoding || !address.trim()}
            className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: '#fff',
              opacity: geocoding || !address.trim() ? 0.5 : 1,
            }}
          >
            {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Find
          </button>
        </div>
        {error && (
          <p className="text-xs mt-2" style={{ color: 'var(--color-danger)' }}>{error}</p>
        )}
      </Card>

      {/* Map */}
      {!loading && lat != null && lon != null && (
        <Card>
          <h2 className="text-sm font-medium mb-3">Pin Location</h2>
          <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--color-border)', height: '350px' }}>
            <LocationMap lat={lat} lon={lon} onMarkerDrag={handleMarkerDrag} />
          </div>
          <div className="flex gap-4 mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span>Lat: {lat.toFixed(6)}</span>
            <span>Lon: {lon.toFixed(6)}</span>
          </div>
        </Card>
      )}

      {!loading && lat == null && (
        <Card>
          <div className="text-center py-8">
            <MapPin className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Enter your address above to set your home location
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
