'use client';

import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import type { DeviceState, IntegrationId, IntegrationHealth, WsServerMessage } from '@ha/shared';

type Listener = () => void;

class DeviceStore {
  private devices = new Map<string, DeviceState>();
  private integrations: Record<string, IntegrationHealth> = {};
  private listeners = new Set<Listener>();
  private revision = 0;
  connected = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.revision++;
    for (const fn of this.listeners) fn();
  }

  getSnapshot(): number {
    return this.revision;
  }

  applyMessage(msg: WsServerMessage): void {
    switch (msg.type) {
      case 'snapshot':
        this.devices.clear();
        for (const d of msg.devices) this.devices.set(d.id, d);
        this.integrations = msg.integrations;
        break;
      case 'device_updated':
        this.devices.set(msg.device.id, msg.device);
        break;
      case 'device_removed':
        this.devices.delete(msg.deviceId);
        break;
      case 'integration_health':
        this.integrations = { ...this.integrations, [msg.id]: msg.health };
        break;
    }
    this.notify();
  }

  setConnected(val: boolean): void {
    this.connected = val;
    this.notify();
  }

  getAllDevices(): DeviceState[] {
    return [...this.devices.values()];
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

export function useWebSocket() {
  useEffect(() => {
    connectWs();
  }, []);

  const revision = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => 0,
  );

  return {
    devices: store.getAllDevices(),
    integrations: store.getIntegrations(),
    connected: store.connected,
    getDevice: (id: string) => store.getDevice(id),
  };
}
