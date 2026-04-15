'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useAlert } from './LCARSAlertOverlay';

/** TNG red alert / klaxon — https://www.trekcore.com/audio/redalertandklaxons/tng_red_alert1.mp3 (mirrored in public/audio). */
const RED_ALERT_KLAXON_SRC = '/audio/tng_red_alert1.mp3';

/**
 * Sound types available to the LCARS UI.
 *
 * Legacy names (`beep`, `chirp`, `deny`, `alert`, `hail`, `scan`, `process`)
 * are preserved for backward compat — existing call-sites (bridge page, settings
 * page) keep working unchanged.  New names map 1:1 to the TrekCore MP3s.
 */
export type SoundType =
  | 'beep'      // default button press        → computerbeep_5.mp3
  | 'chirp'     // light confirmation           → computerbeep_5.mp3
  | 'deny'      // denied / invalid action      → consolewarning.mp3
  | 'alert'     // warning tone                 → consolewarning.mp3
  | 'hail'      // incoming notification        → computerbeep_24.mp3
  | 'scan'      // sweep / processing           → computer_work_beep.mp3
  | 'process'   // multi-step processing        → computer_work_beep.mp3
  | 'error'     // critical error in status log → consolewarning.mp3
  | 'statusOn'  // status viewer opened         → computerbeep_16.mp3
  | 'statusOff' // status viewer closed         → computerbeep_20.mp3
  | 'sidebar'   // right panel (assistant) open → computerbeep_24.mp3
  | 'loading';  // boot / loading screen        → computer_work_beep.mp3

/** Map every SoundType to a public audio file path. */
const SOUND_FILES: Record<SoundType, string> = {
  beep:      '/audio/computerbeep_5.mp3',
  chirp:     '/audio/computerbeep_5.mp3',
  deny:      '/audio/consolewarning.mp3',
  alert:     '/audio/consolewarning.mp3',
  hail:      '/audio/computerbeep_24.mp3',
  scan:      '/audio/computer_work_beep.mp3',
  process:   '/audio/computer_work_beep.mp3',
  error:     '/audio/consolewarning.mp3',
  statusOn:  '/audio/computerbeep_16.mp3',
  statusOff: '/audio/computerbeep_20.mp3',
  sidebar:   '/audio/computerbeep_24.mp3',
  loading:   '/audio/computer_work_beep.mp3',
};

/** Default volume for each sound (0–1). */
const SOUND_VOLUME: Partial<Record<SoundType, number>> = {
  beep:      0.25,
  chirp:     0.25,
  error:     0.35,
  deny:      0.35,
  alert:     0.35,
  loading:   0.30,
};
const DEFAULT_VOLUME = 0.30;

/* ---------- Preload & playback helpers ---------- */

/** Pre-decoded template elements keyed by file path. */
const preloaded = new Map<string, HTMLAudioElement>();

function ensurePreloaded() {
  if (typeof window === 'undefined') return;
  const paths = new Set(Object.values(SOUND_FILES));
  for (const src of paths) {
    if (preloaded.has(src)) continue;
    const a = new Audio(src);
    a.preload = 'auto';
    preloaded.set(src, a);
  }
}

/** Play a short MP3 once.  Clones the template so overlapping plays work fine. */
function playFile(src: string, volume: number) {
  const template = preloaded.get(src);
  if (!template) return;
  const a = template.cloneNode() as HTMLAudioElement;
  a.volume = volume;
  void a.play().catch(() => {});
}

/* ---------- Context ---------- */

interface SoundsContextValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  play: (sound: SoundType) => void;
}

const SoundsContext = createContext<SoundsContextValue>({
  enabled: false,
  setEnabled: () => {},
  play: () => {},
});

export function useLCARSSounds() {
  return useContext(SoundsContext);
}

/* ---------- Provider ---------- */

export function LCARSSoundsProvider({ children }: { children: ReactNode }) {
  const { activeTheme } = useTheme();
  const { alertLevel } = useAlert();
  const { user, uiPreferences, uiPreferenceLocks, patchUiPreferences } = useAuth();
  const [enabled, setEnabledState] = useState(false);
  const redKlaxonRef = useRef<HTMLAudioElement | null>(null);

  /* Preload MP3s once on mount */
  useEffect(() => {
    ensurePreloaded();
  }, []);

  /* ---- Persist enabled preference ---- */

  useEffect(() => {
    if (user) {
      if (uiPreferences.lcarsSoundsEnabled !== undefined) {
        setEnabledState(uiPreferences.lcarsSoundsEnabled);
      } else {
        const stored = localStorage.getItem('lcars-sounds');
        setEnabledState(stored === 'true');
      }
      return;
    }
    const stored = localStorage.getItem('lcars-sounds');
    if (stored === 'true') setEnabledState(true);
  }, [user, uiPreferences.lcarsSoundsEnabled]);

  useEffect(() => {
    localStorage.setItem('lcars-sounds', String(enabled));
  }, [enabled]);

  /* ---- Red alert klaxon (preserved exactly) ---- */

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stop = () => {
      const a = redKlaxonRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
    };

    if (alertLevel !== 'red' || !enabled || activeTheme !== 'lcars' || reduce) {
      stop();
      return;
    }

    let a = redKlaxonRef.current;
    if (!a) {
      a = new Audio(RED_ALERT_KLAXON_SRC);
      a.loop = true;
      a.volume = 0.32;
      redKlaxonRef.current = a;
    }
    void a.play().catch(() => {});

    return stop;
  }, [alertLevel, enabled, activeTheme]);

  /* ---- Setter (admin-lockable) ---- */

  const setEnabled = useCallback(
    (v: boolean) => {
      if (user && uiPreferenceLocks.lcarsSoundsEnabled) return;
      setEnabledState(v);
      if (user && !uiPreferenceLocks.lcarsSoundsEnabled) {
        void patchUiPreferences({ lcarsSoundsEnabled: v });
      }
    },
    [user, uiPreferenceLocks.lcarsSoundsEnabled, patchUiPreferences],
  );

  /* ---- Play ---- */

  const play = useCallback(
    (sound: SoundType) => {
      if (!enabled || activeTheme !== 'lcars') return;
      const src = SOUND_FILES[sound];
      if (!src) return;
      const vol = SOUND_VOLUME[sound] ?? DEFAULT_VOLUME;
      playFile(src, vol);
    },
    [enabled, activeTheme],
  );

  return (
    <SoundsContext.Provider value={{ enabled, setEnabled, play }}>
      {children}
    </SoundsContext.Provider>
  );
}
