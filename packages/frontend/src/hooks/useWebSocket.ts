'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { DeviceState, IntegrationHealth, WsServerMessage } from '@ha/shared';

type Listener = () => void;

class DeviceStore {
  private devices = new Map<string, DeviceState>();
  private integrations: Record<string, IntegrationHealth> = {};
  private listeners = new Set<Listener>();
  connected = false;

  // Cached array — invalidated only when devices actually change
  private cachedDevices: DeviceState[] | null = null;
  // Separate revision counters for different data slices
  private deviceRevision = 0;
  private integrationRevision = 0;
  private connectionRevision = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  getDeviceRevision(): number { return this.deviceRevision; }
  getIntegrationRevision(): number { return this.integrationRevision; }
  getConnectionRevision(): number { return this.connectionRevision; }

  applyMessage(msg: WsServerMessage): void {
    switch (msg.type) {
      case 'snapshot':
        this.devices.clear();
        for (const d of msg.devices) this.devices.set(d.id, d);
        this.integrations = msg.integrations;
        this.cachedDevices = null;
        this.deviceRevision++;
        this.integrationRevision++;
        break;
      case 'device_updated':
        this.devices.set(msg.device.id, msg.device);
        this.cachedDevices = null;
        this.deviceRevision++;
        break;
      case 'device_removed':
        this.devices.delete(msg.deviceId);
        this.cachedDevices = null;
        this.deviceRevision++;
        break;
      case 'integration_health':
        this.integrations = { ...this.integrations, [msg.id]: msg.health };
        this.integrationRevision++;
        break;
    }
    this.notify();
  }

  setConnected(val: boolean): void {
    if (this.connected === val) return;
    this.connected = val;
    this.connectionRevision++;
    this.notify();
  }

  getAllDevices(): DeviceState[] {
    if (!this.cachedDevices) {
      this.cachedDevices = [...this.devices.values()];
    }
    return this.cachedDevices;
  }

  getDevice(id: string): DeviceState | undefined {
    return this.devices.get(id);
  }

  getIntegrations(): Record<string, IntegrationHealth> {
    return this.integrations;
  }
}

const store = new DeviceStore();

const WS_URL = typeof window !== 'undefined'
  ? `ws://${window.location.hostname}:3000/ws`
  : 'ws://localhost:3000/ws';

let ws: WebSocket | null = null;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function connectWs(): void {
  if (ws && ws.readyState <= WebSocket.OPEN) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    retryCount = 0;
    store.setConnected(true);
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as WsServerMessage;
      store.applyMessage(msg);
    } catch { /* ignore malformed */ }
  };

  ws.onclose = () => {
    store.setConnected(false);
    ws = null;
    const delay = Math.min(1000 * 2 ** retryCount, 30_000);
    retryCount++;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(connectWs, delay);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

/**
 * Subscribe to device state updates. Re-renders only when devices change.
 */
export function useWebSocket() {
  useEffect(() => { connectWs(); }, []);

  const deviceRevision = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getDeviceRevision(),
    () => 0,
  );

  // Stable references — only recompute when deviceRevision changes
  const devices = useMemo(() => store.getAllDevices(), [deviceRevision]);
  const getDevice = useMemo(() => (id: string) => store.getDevice(id), [deviceRevision]);

  return { devices, integrations: store.getIntegrations(), connected: store.connected, getDevice };
}

/**
 * Subscribe only to connection state. Does NOT re-render on device updates.
 * Use this in layout components (AppShell, Sidebar) that only need the green/red dot.
 */
export function useConnected(): boolean {
  useEffect(() => { connectWs(); }, []);

  useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getConnectionRevision(),
    () => 0,
  );

  return store.connected;
}
