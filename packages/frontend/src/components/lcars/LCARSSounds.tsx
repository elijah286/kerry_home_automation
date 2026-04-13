'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useAlert } from './LCARSAlertOverlay';

/** TNG red alert / klaxon — https://www.trekcore.com/audio/redalertandklaxons/tng_red_alert1.mp3 (mirrored in public/audio). */
const RED_ALERT_KLAXON_SRC = '/audio/tng_red_alert1.mp3';

type SoundType = 'beep' | 'chirp' | 'deny' | 'alert' | 'hail' | 'scan' | 'process';

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

// Generate LCARS-like tones using Web Audio API
function createTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.15,
  delay: number = 0,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
  gain.gain.setValueAtTime(0, ctx.currentTime + delay);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.01);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration);
}

const SOUND_DEFS: Record<SoundType, (ctx: AudioContext) => void> = {
  beep: (ctx) => {
    createTone(ctx, 1200, 0.08, 'sine', 0.12);
  },
  chirp: (ctx) => {
    createTone(ctx, 800, 0.06, 'sine', 0.1);
    createTone(ctx, 1600, 0.06, 'sine', 0.1, 0.06);
  },
  deny: (ctx) => {
    createTone(ctx, 300, 0.15, 'square', 0.08);
  },
  alert: (ctx) => {
    createTone(ctx, 880, 0.2, 'sine', 0.15);
    createTone(ctx, 440, 0.2, 'sine', 0.15, 0.25);
    createTone(ctx, 880, 0.2, 'sine', 0.15, 0.5);
  },
  hail: (ctx) => {
    createTone(ctx, 523, 0.12, 'sine', 0.1);
    createTone(ctx, 659, 0.12, 'sine', 0.1, 0.12);
    createTone(ctx, 784, 0.15, 'sine', 0.1, 0.24);
  },
  scan: (ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(2000, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  },
  process: (ctx) => {
    for (let i = 0; i < 4; i++) {
      createTone(ctx, 600 + i * 200, 0.04, 'sine', 0.06, i * 0.06);
    }
  },
};

export function LCARSSoundsProvider({ children }: { children: ReactNode }) {
  const { activeTheme } = useTheme();
  const { alertLevel } = useAlert();
  const { user, uiPreferences, uiPreferenceLocks, patchUiPreferences } = useAuth();
  const [enabled, setEnabledState] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const redKlaxonRef = useRef<HTMLAudioElement | null>(null);

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

  const play = useCallback(
    (sound: SoundType) => {
      if (!enabled || activeTheme !== 'lcars') return;
      try {
        if (!ctxRef.current) {
          ctxRef.current = new AudioContext();
        }
        const ctx = ctxRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        SOUND_DEFS[sound]?.(ctx);
      } catch {
        // Web Audio not available
      }
    },
    [enabled, activeTheme],
  );

  return (
    <SoundsContext.Provider value={{ enabled, setEnabled, play }}>
      {children}
    </SoundsContext.Provider>
  );
}
