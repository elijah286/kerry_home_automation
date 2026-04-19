'use client';

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useRouter } from 'next/navigation';
import { Settings2 } from 'lucide-react';
import { getApiBase, apiFetch, authQueryParam } from '@/lib/api-base';
import {
  CameraInfo,
  CameraSettings,
  PlayerMode,
  Quality,
  Tier,
  PlayerStatus,
  initialTier,
  useStableSnapshotSrc,
  CameraPlayer,
  SettingsPanel,
} from './_components';

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------

const SETTINGS_KEY = 'cameras-grid-settings';
const DEFAULT_SETTINGS: CameraSettings = { columns: 4, hidden: [] };
const COLUMN_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

function loadSettings(): CameraSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CameraSettings>;
    const columns = COLUMN_OPTIONS.includes(parsed.columns as 1 | 2 | 3 | 4 | 5 | 6)
      ? (parsed.columns as number)
      : DEFAULT_SETTINGS.columns;
    const hidden = Array.isArray(parsed.hidden) ? parsed.hidden.filter((x): x is string => typeof x === 'string') : [];
    return { columns, hidden };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: CameraSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}

// ---------------------------------------------------------------------------
// Camera tile — reuses CameraPlayer in auto mode, so every tile starts on HLS
// as soon as the stream is ready and shows a snapshot underlay while it warms
// up. Still gated by page + viewport visibility: off-screen / backgrounded
// tiles drop down to a single static snapshot so we're not running 9 live
// ffmpeg pipelines when the user isn't looking.
// ---------------------------------------------------------------------------

// Stagger delay between tiles so they don't all start HLS at the same time.
// 9 tiles × 600ms = last tile starts at ~5.4s, spreading ffmpeg session spin-up
// across the whole warmup window instead of pegging all CPU cores at once.
const TILE_STAGGER_MS = 600;

const CameraTile = memo(function CameraTile({
  cam,
  index,
  onSelect,
}: {
  cam: CameraInfo;
  index: number;
  onSelect: () => void;
}) {
  const [visible,    setVisible]    = useState(true);
  const [inView,     setInView]     = useState(true);
  const [hlsReady,   setHlsReady]   = useState(index === 0);
  const [tier,       setTier]       = useState<Tier>(() => initialTier('auto'));
  const [status,     setStatus]     = useState<PlayerStatus>('connecting');
  const [snapshotRev, setSnapshotRev] = useState(0);
  const tileRef = useRef<HTMLDivElement | null>(null);

  // Stagger HLS start only — snapshot is always shown immediately so the
  // tile is never black, even before HLS has started.
  useEffect(() => {
    if (index === 0) return;
    const t = window.setTimeout(() => setHlsReady(true), index * TILE_STAGGER_MS);
    return () => window.clearTimeout(t);
  }, [index]);

  // Track page visibility (tab switched away / browser minimized)
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Track viewport visibility (scrolled off-screen)
  useEffect(() => {
    if (!tileRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.01 },
    );
    obs.observe(tileRef.current);
    return () => obs.disconnect();
  }, []);

  const pageActive = visible && inView;
  const hlsActive  = hlsReady && pageActive;

  // Refresh the base snapshot every 5s so the grid never looks frozen.
  // CameraPlayer takes over with live HLS once it's active.
  useEffect(() => {
    if (!pageActive) return;
    const t = window.setInterval(() => setSnapshotRev((n) => n + 1), 5_000);
    return () => window.clearInterval(t);
  }, [pageActive]);

  const snapshotSrc = `${getApiBase()}/api/cameras/${encodeURIComponent(cam.name)}/snapshot?r=${snapshotRev}${authQueryParam(true)}`;
  const stableSnapshotSrc = useStableSnapshotSrc(snapshotSrc, cam.name);

  return (
    <div
      ref={tileRef}
      className="relative aspect-video cursor-pointer overflow-hidden rounded-sm bg-black"
      onClick={onSelect}
    >
      {/* Snapshot always shown as base — tile is never fully black on load */}
      {stableSnapshotSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stableSnapshotSrc}
          alt={cam.label}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* CameraPlayer overlays once HLS stagger delay has passed */}
      {hlsActive && (
        <CameraPlayer
          name={cam.name}
          mode="auto"
          quality="sd"
          fit="cover"
          onTierChange={(t, s) => { setTier(t); setStatus(s); }}
        />
      )}

      {hlsActive && status === 'failed' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
          <span className="text-[11px] text-zinc-400">No signal</span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4">
        <span className="text-xs font-medium text-white drop-shadow-sm">{cam.label}</span>
        {hlsActive && tier === 'hls' && status === 'live' && (
          <span className="rounded bg-red-500/85 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
            Live
          </span>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main cameras page
// ---------------------------------------------------------------------------

const FALLBACK_CAMERAS: CameraInfo[] = [
  { name: 'back_door',   label: 'Back Door' },
  { name: 'living_room', label: 'Living Room' },
  { name: 'garage',      label: 'Garage' },
  { name: 'backyard',    label: 'Backyard' },
  { name: 'street',      label: 'Street' },
  { name: 'driveway',    label: 'Driveway' },
  { name: 'game_room',   label: 'Game Room' },
  { name: 'pool',        label: 'Pool' },
  { name: 'front_porch', label: 'Front Porch' },
];

export default function CamerasPage() {
  const [cameras,        setCameras]        = useState<CameraInfo[]>([]);
  const [pendingEntries, setPendingEntries] = useState(0);
  const [listError,      setListError]      = useState(false);
  const [recovering,     setRecovering]     = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  const [settings,       setSettings]       = useState<CameraSettings>(DEFAULT_SETTINGS);

  const router = useRouter();

  // Hydrate settings from localStorage after mount (avoids SSR mismatch).
  useEffect(() => { setSettings(loadSettings()); }, []);

  const updateSettings = useCallback((next: CameraSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const loadCameras = () => {
    apiFetch(`${getApiBase()}/api/cameras`)
      .then((r) => {
        if (!r.ok) throw new Error('bad status');
        return r.json();
      })
      .then((data: { cameras?: CameraInfo[]; recover?: { pendingEntries?: number } }) => {
        setCameras(data.cameras ?? []);
        setPendingEntries(data.recover?.pendingEntries ?? 0);
        setListError(false);
      })
      .catch(() => {
        setListError(true);
        setCameras(FALLBACK_CAMERAS);
        setPendingEntries(0);
      });
  };

  useEffect(() => {
    loadCameras();
    const id = window.setInterval(loadCameras, 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Handle ?open=<name> by redirecting to the camera's own route.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get('open');
    if (!target || cameras.length === 0) return;
    const needle = target.toLowerCase();
    const match =
      cameras.find((c) => c.name === target) ??
      cameras.find((c) => c.name.toLowerCase() === needle) ??
      cameras.find((c) => c.label.toLowerCase().includes(needle));
    if (match) {
      router.replace(`/cameras/${encodeURIComponent(match.name)}`);
    }
  }, [cameras, router]);

  const onRecover = () => {
    setRecovering(true);
    apiFetch(`${getApiBase()}/api/cameras/recover`, { method: 'POST' })
      .finally(() => {
        setRecovering(false);
        loadCameras();
      });
  };

  const visibleCameras = useMemo(() => {
    const hidden = new Set(settings.hidden);
    return cameras.filter((c) => !hidden.has(c.name));
  }, [cameras, settings.hidden]);

  const showEmptyHint = cameras.length === 0 && !listError;
  const allHidden = cameras.length > 0 && visibleCameras.length === 0;

  // Dummy settings for SettingsPanel — grid page has no selectedCam
  const noopMode: PlayerMode = 'auto';
  const noopQuality: Quality = 'sd';

  return (
    <>
      <div className="p-2 lg:p-3">
        {/* Toolbar */}
        <div className="mb-2 flex items-center justify-end gap-2">
          <span className="text-[11px] text-zinc-500">
            {visibleCameras.length} of {cameras.length} shown · {settings.columns} cols
          </span>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>

        {showEmptyHint && (
          <div className="mb-3 rounded-md border border-zinc-700/80 bg-zinc-900/50 px-3 py-3 text-sm text-zinc-300">
            <p className="font-medium text-zinc-100">No cameras listed yet</p>
            <p className="mt-1 text-xs text-zinc-400">
              The backend pulls this list from go2rtc (UniFi Protect). If go2rtc was offline when the server
              started, names stay empty until it reconnects. This page rechecks every 15 seconds, and the
              server retries automatically.
            </p>
            {pendingEntries > 0 && (
              <p className="mt-2 text-xs text-amber-200/90">
                {pendingEntries} UniFi integration {pendingEntries === 1 ? 'entry has' : 'entries have'} not
                finished connecting to go2rtc — still retrying.
              </p>
            )}
            <button
              type="button"
              onClick={onRecover}
              disabled={recovering}
              className="mt-3 rounded border border-zinc-500 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              {recovering ? 'Reconnecting…' : 'Retry connection now'}
            </button>
          </div>
        )}
        {listError && (
          <div className="mb-3 rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-100/90">
            Could not reach the camera API — showing a static list. Check that the backend on port 3000 is running.
          </div>
        )}
        {allHidden && (
          <div className="mb-3 rounded-md border border-zinc-700/80 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
            All cameras are hidden. Open Settings to show some.
          </div>
        )}

        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${settings.columns}, minmax(0, 1fr))` }}
        >
          {visibleCameras.map((cam, i) => (
            <CameraTile
              key={cam.name}
              cam={cam}
              index={i}
              onSelect={() => router.push(`/cameras/${encodeURIComponent(cam.name)}`)}
            />
          ))}
        </div>
      </div>

      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        cameras={cameras}
        settings={settings}
        onChange={updateSettings}
        selectedCam={null}
        mode={noopMode}
        quality={noopQuality}
        onModeChange={() => { /* grid page — no per-camera mode */ }}
        onQualityChange={() => { /* grid page — no per-camera quality */ }}
        columnOptions={COLUMN_OPTIONS}
      />
    </>
  );
}
