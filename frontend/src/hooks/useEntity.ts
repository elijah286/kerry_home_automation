"use client";

import { useSyncExternalStore } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";

export function useEntity(entityId: string) {
  const { store, initialSyncDone } = useWebSocket();

  const snapshot = useSyncExternalStore(
    (onChange) => store.subscribeEntity(entityId, onChange),
    () => store.getSnapshot(entityId),
    () => undefined,
  );

  return {
    state: snapshot?.state,
    attributes: snapshot?.attributes ?? {},
    lastChanged: snapshot?.last_changed,
    loading: !initialSyncDone,
  };
}
