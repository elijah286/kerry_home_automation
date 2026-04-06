"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { fetchSystemMode } from "@/lib/api";
import { getWebSocketClient } from "@/lib/ws";
import { useAuth } from "./AuthProvider";
import type { EntityState, SystemMode } from "@/types";

class EntityStateStore {
  private map = new Map<string, EntityState>();
  private subs = new Map<string, Set<() => void>>();

  mergeStates(states: Iterable<EntityState>): void {
    for (const s of states) {
      this.map.set(s.entity_id, s);
      this.notify(s.entity_id);
    }
  }

  setState(s: EntityState): void {
    this.map.set(s.entity_id, s);
    this.notify(s.entity_id);
  }

  private notify(id: string): void {
    this.subs.get(id)?.forEach((cb) => cb());
  }

  subscribeEntity(id: string, cb: () => void): () => void {
    let set = this.subs.get(id);
    if (!set) {
      set = new Set();
      this.subs.set(id, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) {
        this.subs.delete(id);
      }
    };
  }

  subscribeEntities(ids: readonly string[], cb: () => void): () => void {
    const unsubs = ids.map((id) => this.subscribeEntity(id, cb));
    return () => {
      for (const u of unsubs) {
        u();
      }
    };
  }

  getSnapshot(id: string): EntityState | undefined {
    return this.map.get(id);
  }

  getMap(): ReadonlyMap<string, EntityState> {
    return this.map;
  }
}

export type WebSocketContextValue = {
  connected: boolean;
  initialSyncDone: boolean;
  entityStates: ReadonlyMap<string, EntityState>;
  systemMode: SystemMode | null;
  setSystemMode: Dispatch<SetStateAction<SystemMode | null>>;
  sendCommand: (
    entityId: string,
    command: string,
    data?: Record<string, unknown>,
  ) => Promise<void>;
  store: EntityStateStore;
};

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [store] = useState(() => new EntityStateStore());

  const [connected, setConnected] = useState(false);
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [systemMode, setSystemMode] = useState<SystemMode | null>(null);

  const sendCommand = useCallback(
    async (entityId: string, command: string, data?: Record<string, unknown>) => {
      const client = getWebSocketClient();
      await client.sendCommand(entityId, command, data);
    },
    [],
  );

  useEffect(() => {
    if (!token) return;

    const client = getWebSocketClient();
    client.onConnectionChange = (c) => setConnected(c);
    client.onStateChanged = (ev) => {
      store.setState(ev.new_state);
    };
    client.onModeChanged = (ev) => {
      setSystemMode(ev.new_mode);
    };
    client.onPresenceChanged = () => {};
    client.connect();
    fetchSystemMode()
      .then((r) => setSystemMode(r.mode))
      .catch(() => {});
    return () => {
      client.disconnect();
      client.onConnectionChange = null;
      client.onStateChanged = null;
      client.onModeChanged = null;
      client.onPresenceChanged = null;
    };
  }, [store, token]);

  useEffect(() => {
    if (!connected) {
      return;
    }
    const client = getWebSocketClient();
    let cancelled = false;
    (async () => {
      try {
        const states = await client.getStates();
        if (cancelled) {
          return;
        }
        store.mergeStates(states);
        const ids = states.map((s) => s.entity_id);
        if (ids.length > 0) {
          await client.subscribe(ids);
        }
        if (cancelled) {
          return;
        }
        setInitialSyncDone(true);
      } catch {
        if (!cancelled) {
          setInitialSyncDone(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, store]);

  const value = useMemo<WebSocketContextValue>(
    () => ({
      connected,
      initialSyncDone,
      entityStates: store.getMap(),
      systemMode,
      setSystemMode,
      sendCommand,
      store,
    }),
    [connected, initialSyncDone, systemMode, sendCommand, store],
  );

  return (
    <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
  );
}

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error("useWebSocket must be used within WebSocketProvider");
  }
  return ctx;
}
