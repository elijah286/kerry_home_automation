'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { LCARS_COLORS } from '@/components/lcars/colors';

/** HaughtyGrayAlien — USS Enterprise D (Sketchfab); embed works without a direct GLB URL. */
export const DEFAULT_ENGINEERING_MODEL_URL =
  'https://sketchfab.com/3d-models/uss-enterprise-d-star-trek-tng-e3118c97914342b3ad7dd957c4b4ce4e';

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
              inset: 0,
              width: '100%',
              height: '100%',
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
