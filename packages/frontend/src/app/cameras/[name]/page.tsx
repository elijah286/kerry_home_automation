'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Settings2 } from 'lucide-react';
import { getApiBase, apiFetch } from '@/lib/api-base';
import { useBreadcrumbOverride } from '@/providers/BreadcrumbOverrideProvider';
import {
  CameraInfo,
  CameraSettings,
  PlayerMode,
  Quality,
  InlineCameraPlayer,
  SettingsPanel,
} from '../_components';

const PLACEHOLDER_SETTINGS: CameraSettings = { columns: 4, hidden: [] };

export default function CameraPage() {
  const params = useParams();
  const name = typeof params.name === 'string' ? decodeURIComponent(params.name) : '';

  const router = useRouter();
  const { setExtra } = useBreadcrumbOverride();

  // Start with a placeholder so the player can mount immediately.
  const [cam, setCam] = useState<CameraInfo>({ name, label: name, hasHd: false });
  const [playerMode, setPlayerMode] = useState<PlayerMode>('auto');
  const [playerQuality, setPlayerQuality] = useState<Quality>('sd');
  const [showSettings, setShowSettings] = useState(false);

  // Fetch the full camera list to get the real label and hasHd flag.
  useEffect(() => {
    apiFetch(`${getApiBase()}/api/cameras`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as { cameras?: CameraInfo[] };
        const match = data.cameras?.find((c) => c.name === name);
        if (match) {
          setCam(match);
          // If the camera supports HD, default to HD quality.
          if (match.hasHd) setPlayerQuality('hd');
        }
      })
      .catch(() => { /* ignore — placeholder cam stays */ });
  }, [name]);

  // Set breadcrumb override: Dashboard > Cameras > <label>
  useEffect(() => {
    setExtra([{ href: '/cameras', label: cam.label, current: true }]);
    return () => setExtra([]);
  }, [cam.label, setExtra]);

  // Escape key → back to grid
  const handleClose = useCallback(() => {
    router.push('/cameras');
  }, [router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  return (
    <>
      <div className="p-2 lg:p-3">
        <InlineCameraPlayer
          cam={cam}
          onClose={handleClose}
          mode={playerMode}
          quality={playerQuality}
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>
      </div>

      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        cameras={[cam]}
        settings={PLACEHOLDER_SETTINGS}
        onChange={() => { /* grid settings not applicable on single camera page */ }}
        selectedCam={cam}
        mode={playerMode}
        quality={playerQuality}
        onModeChange={setPlayerMode}
        onQualityChange={setPlayerQuality}
      />
    </>
  );
}
