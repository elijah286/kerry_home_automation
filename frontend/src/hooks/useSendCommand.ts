"use client";

import { useCallback } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";

export function useSendCommand() {
  const { sendCommand } = useWebSocket();

  return useCallback(
    (entityId: string, command: string, data?: Record<string, unknown>) => {
      void sendCommand(entityId, command, data);
    },
    [sendCommand],
  );
}
