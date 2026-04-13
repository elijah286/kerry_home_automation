'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiBase } from '@/lib/api-base';

/** How long a log error/fatal counts for the sliding window. */
const ERROR_WINDOW_MS = 5 * 60 * 1000;

type LogEntryWire = { ts: number; level: string };

function isErrorLevel(level: string): boolean {
  return level === 'error' || level === 'fatal';
}

/**
 * Tracks unseen error/fatal lines in the system log (snapshot + SSE).
 * When the user opens the system log, the latest error at that time is acknowledged; the Status
 * control clears until a newer error arrives. New errors while the log is closed turn it red again.
 */
export function useSystemLogErrorAlert(enabled: boolean, terminalOpen: boolean): boolean {
  const [lastErrorTs, setLastErrorTs] = useState<number | null>(null);
  /** Last error timestamp treated as "seen"; alert when lastErrorTs > this (within window). */
  const [acknowledgedErrorTs, setAcknowledgedErrorTs] = useState<number | null>(null);
  const [clock, setClock] = useState(0);
  const prevTerminalOpen = useRef(false);
  /** Opened log before snapshot arrived — ack first error once it lands. */
  const pendingAckAfterOpen = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setClock((c) => c + 1), 4000);
    return () => clearInterval(id);
  }, []);

  /** Acknowledge errors when the user opens the log (or when a late snapshot arrives after open). */
  useEffect(() => {
    if (!enabled) return;

    const risingEdge = terminalOpen && !prevTerminalOpen.current;
    prevTerminalOpen.current = terminalOpen;

    if (risingEdge) {
      if (lastErrorTs != null) {
        setAcknowledgedErrorTs(lastErrorTs);
        pendingAckAfterOpen.current = false;
      } else {
        pendingAckAfterOpen.current = true;
      }
    }

    if (!terminalOpen) {
      pendingAckAfterOpen.current = false;
    } else if (pendingAckAfterOpen.current && lastErrorTs != null) {
      setAcknowledgedErrorTs(lastErrorTs);
      pendingAckAfterOpen.current = false;
    }
  }, [enabled, terminalOpen, lastErrorTs]);

  useEffect(() => {
    if (!enabled) {
      setLastErrorTs(null);
      setAcknowledgedErrorTs(null);
      pendingAckAfterOpen.current = false;
      prevTerminalOpen.current = false;
      return;
    }

    const base = getApiBase();
    let cancelled = false;

    const applySnapshot = (entries: LogEntryWire[]) => {
      const cutoff = Date.now() - ERROR_WINDOW_MS;
      let max = 0;
      for (const e of entries) {
        if (isErrorLevel(e.level) && e.ts >= cutoff) {
          max = Math.max(max, e.ts);
        }
      }
      setLastErrorTs(max > 0 ? max : null);
    };

    fetch(`${base}/api/system/logs`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { entries?: LogEntryWire[] } | null) => {
        if (cancelled || !data?.entries) return;
        applySnapshot(data.entries);
      })
      .catch(() => {});

    const es = new EventSource(`${base}/api/system/logs/stream`, { withCredentials: true });
    es.addEventListener('message', (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as { type?: string; entry?: LogEntryWire };
        if (parsed.type !== 'entry' || !parsed.entry) return;
        const e = parsed.entry;
        if (!isErrorLevel(e.level)) return;
        if (Date.now() - e.ts >= ERROR_WINDOW_MS) return;
        setLastErrorTs((prev) => {
          const t = e.ts;
          return prev == null ? t : Math.max(prev, t);
        });
      } catch {
        /* ignore */
      }
    });

    return () => {
      cancelled = true;
      es.close();
    };
  }, [enabled]);

  return useMemo(() => {
    if (!enabled || lastErrorTs == null) return false;
    if (Date.now() - lastErrorTs >= ERROR_WINDOW_MS) return false;
    const ack = acknowledgedErrorTs ?? -1;
    return lastErrorTs > ack;
  }, [enabled, lastErrorTs, acknowledgedErrorTs, clock]);
}
