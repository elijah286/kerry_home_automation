'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import * as Dialog from '@radix-ui/react-dialog';
import { Box, Link2, X } from 'lucide-react';
import { LCARS_COLORS } from '@/components/lcars/colors';

/** HaughtyGrayAlien — USS Enterprise D (Sketchfab); embed works without a direct GLB URL. */
export const DEFAULT_ENGINEERING_MODEL_URL =
  'https://sketchfab.com/3d-models/uss-enterprise-d-star-trek-tng-e3118c97914342b3ad7dd957c4b4ce4e';

const STORAGE_KEY = 'lcars-engineering-model-url';

const GlbOrbitViewer = dynamic(
  () => import('@/components/lcars/GlbOrbitViewer').then((m) => m.GlbOrbitViewer),
  { ssr: false, loading: () => <ViewerChrome message="Initializing ODN relay…" /> },
);

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState(DEFAULT_ENGINEERING_MODEL_URL);
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

  const applyDraft = useCallback(() => {
    const v = validateModelUrl(draftUrl);
    if (!v.ok) return;
    setModelUrl(draftUrl.trim());
    try {
      localStorage.setItem(STORAGE_KEY, draftUrl.trim());
    } catch {
      /* ignore */
    }
    setGlbError(null);
    setDialogOpen(false);
  }, [draftUrl]);

  useEffect(() => {
    if (dialogOpen) setDraftUrl(modelUrl);
  }, [dialogOpen, modelUrl]);

  useEffect(() => {
    setGlbError(null);
  }, [modelUrl]);

  return (
    <div
      style={{
        fontFamily: "'Antonio', 'Helvetica Neue', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: LCARS_COLORS.gold,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minHeight: 'min(72vh, 640px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 20px',
          background: LCARS_COLORS.limaBean,
          borderRadius: 999,
          color: '#000',
          flexWrap: 'wrap',
        }}
      >
        <Box size={20} aria-hidden />
        <span style={{ fontWeight: 700, fontSize: 16 }}>Structural imaging — main viewer</span>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 999,
            border: '2px solid #000',
            background: LCARS_COLORS.butterscotch,
            color: '#000',
            fontWeight: 700,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textTransform: 'inherit',
            letterSpacing: 'inherit',
          }}
        >
          <Link2 size={16} aria-hidden />
          Model link
        </button>
      </div>

      <div
        className="lcars-scan-container"
        style={{
          flex: 1,
          minHeight: 360,
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
            src={`https://sketchfab.com/models/${sketchfabId}/embed?autostart=1&autospin=0.28&preload=1&ui_controls=1&ui_infos=0&ui_hint=0&ui_watermark=0`}
            style={{ width: '100%', height: '100%', minHeight: 360, border: 'none', display: 'block' }}
            allow="autoplay; fullscreen; xr-spatial-tracking"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : useGlb ? (
          <div style={{ width: '100%', height: '100%', minHeight: 360, position: 'relative' }}>
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
          <ViewerChrome message="Invalid model URL. Open Model link and enter a Sketchfab page or .glb URL." />
        )}
      </div>

      <p style={{ fontSize: 10, color: LCARS_COLORS.gray, margin: 0, lineHeight: 1.5 }}>
        Default: Sketchfab Enterprise‑D (CC BY — credit the author on the model page). Direct GLB links
        require CORS headers from the host. Drag to pan orbit · scroll to zoom.
      </p>

      <Dialog.Root open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 p-0 shadow-xl"
            style={{
              background: '#0a0a14',
              borderColor: LCARS_COLORS.butterscotch,
              color: LCARS_COLORS.sunflower,
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{
                background: LCARS_COLORS.limaBean,
                color: '#000',
                borderBottom: `2px solid ${LCARS_COLORS.butterscotch}`,
              }}
            >
              <Dialog.Title className="text-sm font-bold tracking-wide">Model source URL</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded p-1 hover:opacity-80"
                  style={{ color: '#000' }}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
            <div className="space-y-3 px-4 py-4">
              <label className="block text-[10px] font-bold" style={{ color: LCARS_COLORS.ice }}>
                Sketchfab model page or direct .glb / .gltf
              </label>
              <textarea
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                rows={4}
                className="w-full resize-y rounded border px-2 py-2 text-[11px] normal-case tracking-normal"
                style={{
                  background: '#050508',
                  borderColor: LCARS_COLORS.gray,
                  color: LCARS_COLORS.sunflower,
                  fontFamily: 'ui-monospace, monospace',
                }}
                spellCheck={false}
              />
              <ModelLinkDialogActions draftUrl={draftUrl} onApply={applyDraft} onCancel={() => setDialogOpen(false)} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function ModelLinkDialogActions({
  draftUrl,
  onApply,
  onCancel,
}: {
  draftUrl: string;
  onApply: () => void;
  onCancel: () => void;
}) {
  const v = validateModelUrl(draftUrl);
  return (
    <div className="flex flex-col gap-2">
      {!v.ok && (
        <p className="text-[10px] normal-case tracking-normal" style={{ color: LCARS_COLORS.tomato }}>
          {v.reason}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-2 text-[11px] font-bold"
          style={{
            background: 'transparent',
            border: `2px solid ${LCARS_COLORS.gray}`,
            color: LCARS_COLORS.sunflower,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textTransform: 'inherit',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!v.ok}
          onClick={onApply}
          className="rounded-full px-4 py-2 text-[11px] font-bold disabled:opacity-40"
          style={{
            background: LCARS_COLORS.butterscotch,
            border: '2px solid #000',
            color: '#000',
            cursor: v.ok ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            textTransform: 'inherit',
          }}
        >
          Apply
        </button>
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
      }}
    >
      {message}
    </div>
  );
}
