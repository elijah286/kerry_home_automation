'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSystemTerminal } from '@/providers/SystemTerminalProvider';

const IDLE_BEFORE_FLASH_MS = 5000;
const FLASH_RAMP_MS = 5000;
const SUPPRESS_AFTER_TAP_MS = 30000;

/** Period at start / end of the flash ramp (ms per pulse cycle). */
const FLASH_PERIOD_START = 800;
const FLASH_PERIOD_END = 80;

/**
 * When the LCARS status log is not tailing new lines: after idle, flash the Auto
 * control with accelerating pulses, then re-enable tail-follow. Tap during the
 * flash suppresses auto-recovery for 30s; the idle → flash → recover cycle repeats.
 */
export function useLcarsLogAutoScrollNudge(enabled: boolean) {
  const { logAutoScroll, setLogAutoScroll } = useSystemTerminal();
  const lastInteractionRef = useRef(Date.now());
  const suppressUntilRef = useRef(0);
  const [flashPeriodMs, setFlashPeriodMs] = useState<number | null>(null);

  const bumpStatusInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (logAutoScroll) {
      setFlashPeriodMs(null);
    }
  }, [logAutoScroll]);

  useEffect(() => {
    if (!enabled) {
      setFlashPeriodMs(null);
      return;
    }
    if (logAutoScroll) return;

    const tick = () => {
      const now = Date.now();
      if (now < suppressUntilRef.current) {
        setFlashPeriodMs(null);
        return;
      }
      const idle = now - lastInteractionRef.current;
      if (idle < IDLE_BEFORE_FLASH_MS) {
        setFlashPeriodMs(null);
        return;
      }
      if (idle < IDLE_BEFORE_FLASH_MS + FLASH_RAMP_MS) {
        const t = (idle - IDLE_BEFORE_FLASH_MS) / FLASH_RAMP_MS;
        setFlashPeriodMs(Math.max(FLASH_PERIOD_END, Math.round(FLASH_PERIOD_START - t * (FLASH_PERIOD_START - FLASH_PERIOD_END))));
        return;
      }
      setLogAutoScroll(true);
      lastInteractionRef.current = now;
      setFlashPeriodMs(null);
    };

    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [enabled, logAutoScroll, setLogAutoScroll]);

  const onAutoButtonClick = useCallback(() => {
    const now = Date.now();
    const idle = now - lastInteractionRef.current;
    const inFlashCountdown =
      !logAutoScroll &&
      now >= suppressUntilRef.current &&
      idle >= IDLE_BEFORE_FLASH_MS &&
      idle < IDLE_BEFORE_FLASH_MS + FLASH_RAMP_MS;

    if (inFlashCountdown) {
      suppressUntilRef.current = now + SUPPRESS_AFTER_TAP_MS;
      lastInteractionRef.current = now;
      setFlashPeriodMs(null);
      return;
    }

    lastInteractionRef.current = now;
    setLogAutoScroll(!logAutoScroll);
  }, [logAutoScroll, setLogAutoScroll]);

  return { bumpStatusInteraction, flashPeriodMs, onAutoButtonClick, logAutoScroll };
}
