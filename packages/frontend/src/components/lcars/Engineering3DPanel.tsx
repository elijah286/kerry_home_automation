'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { LCARS_COLORS } from '@/components/lcars/colors';
import { useFooterSlot } from './LCARSFooterSlotContext';
import { ShipGalleryPanel } from './ShipGalleryPanel';

export interface ShipEntry {
  id: string;
  name: string;
  shortName: string;
  class: string;
  modelUrl: string;
}

export const SHIP_REGISTRY: ShipEntry[] = [
  {
    id: 'enterprise-d',
    name: 'USS Enterprise NCC-1701-D',
    shortName: 'Enterprise-D',
    class: 'Galaxy Class',
    modelUrl: 'https://sketchfab.com/3d-models/uss-enterprise-d-star-trek-tng-e3118c97914342b3ad7dd957c4b4ce4e',
  },
  {
    id: 'enterprise-e',
    name: 'USS Enterprise NCC-1701-E',
    shortName: 'Enterprise-E',
    class: 'Sovereign Class',
    modelUrl: 'https://sketchfab.com/3d-models/uss-enterprise-ncc-1701-e-afb303fa7a4649668a1eae43d03cd339',
  },
  {
    id: 'voyager',
    name: 'USS Voyager NCC-74656',
    shortName: 'Voyager',
    class: 'Intrepid Class',
    modelUrl: 'https://sketchfab.com/3d-models/uss-voyager-4k-textures-star-trek-intrepid-3a8cb1eb461a48ea8eac9a2dff9fab18',
  },
  {
    id: 'defiant',
    name: 'USS Defiant NX-74205',
    shortName: 'Defiant',
    class: 'Defiant Class',
    modelUrl: 'https://sketchfab.com/3d-models/uss-defiant-star-trek-zeo-56e09b38c122468a8b0553ba7766025e',
  },
];

/** HaughtyGrayAlien — USS Enterprise D (Sketchfab); embed works without a direct GLB URL. */
export const DEFAULT_ENGINEERING_MODEL_URL = SHIP_REGISTRY[0].modelUrl;

const STORAGE_KEY = 'lcars-engineering-model-url';

const GlbOrbitViewer = dynamic(
  () => import('@/components/lcars/GlbOrbitViewer').then((m) => m.GlbOrbitViewer),
  { ssr: false, loading: () => <ViewerChrome message="Initializing ODN relay…" /> },
);

/** Sketchfab embed: mouse orbit/zoom still work with ui_controls=0. */
function sketchfabEmbedSrc(modelId: string): string {
  const q = new URLSearchParams({
    autostart: '1',
    autospin: '0.28',
    preload: '1',
    ui_controls: '0',
    ui_infos: '0',
    ui_hint: '0',
    ui_watermark: '0',
    ui_inspector: '0',
    ui_stop: '0',
    ui_watermark_link: '0',
    ui_annotations: '0',
    ui_help: '0',
    ui_fullscreen: '0',
    ui_vr: '0',
    ui_ar: '0',
    ui_settings: '0',
    ui_color: '000000',
  });
  return `https://sketchfab.com/models/${modelId}/embed?${q.toString()}`;
}

function parseSketchfabModelId(input: string): string | null {
  const raw = input.trim();
  try {
    const url = new URL(raw);
    if (!url.hostname.endsWith('sketchfab.com')) return null;
    const modelsInPath = url.pathname.match(/\/models\/([a-f0-9]{32})/i);
    if (modelsInPath) return modelsInPath[1]!.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    const tail = last.match(/([a-f0-9]{32})$/i);
    if (tail) return tail[1]!.toLowerCase();
    return null;
  } catch {
    return null;
  }
}

function looksLikeDirectGltfUrl(url: string): boolean {
  const path = url.trim().split(/[?#]/)[0]?.toLowerCase() ?? '';
  return path.endsWith('.glb') || path.endsWith('.gltf');
}

function resolveCurrentShip(modelUrl: string): ShipEntry | null {
  const id = parseSketchfabModelId(modelUrl);
  if (!id) return null;
  return SHIP_REGISTRY.find((s) => parseSketchfabModelId(s.modelUrl) === id) ?? null;
}

function validateModelUrl(url: string): { ok: true } | { ok: false; reason: string } {
  const t = url.trim();
  if (!t) return { ok: false, reason: 'URL is empty.' };
  if (typeof URL !== 'undefined' && 'canParse' in URL && typeof URL.canParse === 'function') {
    if (!URL.canParse(t)) return { ok: false, reason: 'Not a valid URL.' };
  } else {
    try {
      const parsed = new URL(t);
      void parsed;
    } catch {
      return { ok: false, reason: 'Not a valid URL.' };
    }
  }
  if (parseSketchfabModelId(t) || looksLikeDirectGltfUrl(t)) return { ok: true };
  return {
    ok: false,
    reason: 'Use a Sketchfab model page URL, or a direct HTTPS link to a .glb / .gltf file.',
  };
}

export function Engineering3DPanel() {
  const [modelUrl, setModelUrl] = useState(DEFAULT_ENGINEERING_MODEL_URL);
  const [glbError, setGlbError] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const { setFooterFirstExtra } = useFooterSlot();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && validateModelUrl(stored).ok) setModelUrl(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const sketchfabId = useMemo(() => parseSketchfabModelId(modelUrl), [modelUrl]);
  const useGlb = !sketchfabId && looksLikeDirectGltfUrl(modelUrl);
  const currentShip = useMemo(() => resolveCurrentShip(modelUrl), [modelUrl]);

  const selectShip = useCallback((ship: ShipEntry) => {
    setModelUrl(ship.modelUrl);
    try {
      localStorage.setItem(STORAGE_KEY, ship.modelUrl);
    } catch { /* ignore */ }
    setGalleryOpen(false);
  }, []);

  /* Inject ship name button into footer bar's first segment */
  useEffect(() => {
    setFooterFirstExtra(
      <button
        type="button"
        onClick={() => setGalleryOpen(true)}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 10,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#000',
          fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          zIndex: 1,
        }}
      >
        {currentShip?.shortName ?? 'Select Vessel'}
      </button>,
    );
    return () => setFooterFirstExtra(null);
  }, [currentShip, setFooterFirstExtra]);

  useEffect(() => {
    setGlbError(null);
  }, [modelUrl]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
      }}
    >
      <div
        className="lcars-scan-container"
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: 12,
          overflow: 'hidden',
          border: `2px solid ${LCARS_COLORS.gray}`,
          position: 'relative',
          background: '#030308',
        }}
      >
        {sketchfabId ? (
          <iframe
            key={sketchfabId}
            title="LCARS structural scan"
            src={sketchfabEmbedSrc(sketchfabId)}
            style={{
              position: 'absolute',
              top: -60,
              left: -30,
              right: -30,
              bottom: -50,
              width: 'calc(100% + 60px)',
              height: 'calc(100% + 110px)',
              border: 'none',
              display: 'block',
            }}
            allow="autoplay; fullscreen; xr-spatial-tracking"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : useGlb ? (
          <div style={{ position: 'absolute', inset: 0, minHeight: 0 }}>
            {glbError ? (
              <ViewerChrome message={glbError} />
            ) : (
              <GlbOrbitViewer
                key={modelUrl}
                url={modelUrl}
                onLoadError={(msg) => setGlbError(msg)}
              />
            )}
          </div>
        ) : (
          <ViewerChrome message="Invalid model URL. Use a Sketchfab model page or a direct .glb / .gltf link (see lcars-engineering-model-url in localStorage)." />
        )}
      </div>

      <ShipGalleryPanel
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        currentShip={currentShip}
        onSelectShip={selectShip}
      />
    </div>
  );
}

function ViewerChrome({ message }: { message: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        fontSize: 12,
        color: LCARS_COLORS.sunflower,
        background: '#030308',
        fontFamily: "'Antonio', 'Helvetica Neue', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}
    >
      {message}
    </div>
  );
}
