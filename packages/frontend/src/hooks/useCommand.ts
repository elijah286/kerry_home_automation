'use client';

import { useState, useCallback } from 'react';
import { sendCommand } from '@/lib/api';

/**
 * Hook for tracking pending command state per action key.
 * Use `send(key, command)` and `isPending(key)` to show spinners
 * and disable buttons while a command is in flight.
 */
export function useCommand(deviceId: string) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [lastError, setLastError] = useState<string | null>(null);

  const send = useCallback(async (key: string, command: Record<string, unknown>) => {
    setLastError(null);
    setPending((prev) => new Set(prev).add(key));
    try {
      await sendCommand(deviceId, command);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [deviceId]);

  const clearError = useCallback(() => setLastError(null), []);

  const isPending = useCallback((key: string) => pending.has(key), [pending]);

  return { send, isPending, anyPending: pending.size > 0, lastError, clearError };
}
