"use client";

import { useCallback } from "react";
import { postSystemMode } from "@/lib/api";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { SystemMode } from "@/types";

export function useSystemMode() {
  const { systemMode, setSystemMode } = useWebSocket();

  const setMode = useCallback(
    async (mode: SystemMode) => {
      const { mode: next } = await postSystemMode(mode);
      setSystemMode(next);
      return next;
    },
    [setSystemMode],
  );

  return {
    mode: systemMode,
    setMode,
  };
}
