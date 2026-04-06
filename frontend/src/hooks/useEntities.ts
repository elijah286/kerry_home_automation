"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { EntityState } from "@/types";

export function useEntities(entityIds: readonly string[]) {
  const { store } = useWebSocket();

  const stableIds = useMemo(() => [...new Set(entityIds)].sort(), [entityIds]);

  return useSyncExternalStore(
    (onChange) => store.subscribeEntities(stableIds, onChange),
    () => {
      const m = new Map<string, EntityState>();
      for (const id of stableIds) {
        const s = store.getSnapshot(id);
        if (s) {
          m.set(id, s);
        }
      }
      return m;
    },
    () => new Map<string, EntityState>(),
  );
}
