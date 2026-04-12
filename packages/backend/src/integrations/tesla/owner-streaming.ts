// ---------------------------------------------------------------------------
// Tesla Owner API streaming — same mechanism as TeslaMate / TeslaPy
// wss://streaming.vn.teslamotors.com/streaming/ + data:subscribe_oauth
//
// Important: Tesla appears to allow only ONE WebSocket per access token for this
// endpoint; opening one socket per vehicle causes only the last/first subscription
// to receive data. We use a SINGLE connection and send one subscribe message per
// vehicle (multiplexed), routing `data:update` by `tag`.
// ---------------------------------------------------------------------------

import WebSocket from 'ws';
import type { VehicleState } from '@ha/shared';
import type { TeslaApiClient } from './api-client.js';
import type { TeslaVehicleListItem } from './api-client.js';
import { applyOwnerStreamingUpdate } from './mapper.js';
import { stateStore } from '../../state/store.js';
import { logger } from '../../logger.js';

const STREAMING_URL = 'wss://streaming.vn.teslamotors.com/streaming/';

/** Column order must match Tesla streaming payload (TeslaPy Vehicle.COLS + leading timestamp). */
const STREAM_COLS = [
  'speed',
  'odometer',
  'soc',
  'elevation',
  'est_heading',
  'est_lat',
  'est_lng',
  'power',
  'shift_state',
  'range',
  'est_range',
  'heading',
] as const;

const STREAM_KEYS = ['timestamp', ...STREAM_COLS] as const;

export interface OwnerStreamingHandle {
  stop: () => void;
}

function parseStreamCell(raw: string): string | number | boolean | null {
  const v = raw.trim();
  if (v === '') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  return v;
}

function parseDataUpdate(valueStr: string): Record<string, string | number | boolean | null> | null {
  const parts = valueStr.split(',');
  if (parts.length !== STREAM_KEYS.length) {
    logger.warn(
      { expected: STREAM_KEYS.length, got: parts.length },
      'Tesla streaming: unexpected field count (API may have changed)',
    );
    return null;
  }
  const row: Record<string, string | number | boolean | null> = {};
  for (let i = 0; i < STREAM_KEYS.length; i++) {
    row[STREAM_KEYS[i]] = parseStreamCell(parts[i] ?? '');
  }
  return row;
}

/**
 * Map streaming `data:update` `tag` → vehicle.
 * Tesla echoes `vehicle_id`, numeric `id`, or string `id_s` (fleet / enterprise — large ids
 * must not rely on JS number `id`, which loses precision).
 */
function buildTagIndex(vehicles: TeslaVehicleListItem[]): Map<string, TeslaVehicleListItem> {
  const m = new Map<string, TeslaVehicleListItem>();
  for (const v of vehicles) {
    m.set(String(v.vehicle_id), v);
    if (v.id_s) {
      m.set(v.id_s, v);
      m.set(String(v.id_s), v);
    }
    m.set(String(v.id), v);
  }
  return m;
}

/** Tags to use when subscribing (same car may need both for some accounts). */
function streamingSubscribeTags(v: TeslaVehicleListItem): string[] {
  const tags = new Set<string>();
  tags.add(String(v.vehicle_id));
  if (v.id_s) tags.add(v.id_s);
  return [...tags];
}

function runMultiplexedStream(params: {
  entryId: string;
  client: TeslaApiClient;
  vehicles: TeslaVehicleListItem[];
  signal: AbortSignal;
}): void {
  const { entryId, client, vehicles, signal } = params;
  const log = logger.child({ module: 'tesla-streaming', entryId });
  const byTag = buildTagIndex(vehicles);

  let ws: WebSocket | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let backoffMs = 2000;
  const maxBackoffMs = 60_000;

  const cleanupSocket = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try {
        ws.removeAllListeners();
        ws.close();
      } catch { /* ignore */ }
      ws = null;
    }
  };

  const scheduleReconnect = () => {
    if (signal.aborted) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, backoffMs);
    backoffMs = Math.min(maxBackoffMs, Math.round(backoffMs * 1.5));
  };

  const connect = () => {
    if (signal.aborted) return;

    void (async () => {
      let token: string;
      try {
        token = await client.getAccessToken();
      } catch (err) {
        log.warn({ err }, 'streaming: token failed, retrying');
        scheduleReconnect();
        return;
      }
      backoffMs = 2000;

      ws = new WebSocket(STREAMING_URL, {
        handshakeTimeout: 20_000,
      });

      ws.on('open', () => {
        if (!ws) return;
        let subCount = 0;
        for (const v of vehicles) {
          for (const tag of streamingSubscribeTags(v)) {
            const msg = {
              msg_type: 'data:subscribe_oauth',
              token,
              value: STREAM_COLS.join(','),
              tag,
            };
            ws!.send(JSON.stringify(msg));
            subCount++;
          }
        }
        log.info(
          { vehicles: vehicles.length, subscribeMessages: subCount },
          'streaming subscribed (multiplexed)',
        );
      });

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const text = typeof data === 'string' ? data : data.toString('utf8');
          const msg = JSON.parse(text) as {
            msg_type?: string;
            value?: string;
            tag?: string | number;
          };
          if (msg.msg_type === 'control:hello') return;
          if (msg.msg_type === 'data:error') {
            log.warn({ value: msg.value, tag: msg.tag }, 'streaming data:error');
            return;
          }
          if (msg.msg_type !== 'data:update' || typeof msg.value !== 'string') return;

          const tag = msg.tag != null ? String(msg.tag) : '';
          const vehicle = byTag.get(tag);
          if (!vehicle) {
            log.debug({ tag, knownTags: [...byTag.keys()] }, 'streaming: unknown tag (ignored)');
            return;
          }

          const row = parseDataUpdate(msg.value);
          if (!row) return;

          const deviceId = `tesla.${entryId}.vehicle.${vehicle.vin}`;
          const existing = stateStore.get(deviceId) as VehicleState | undefined;
          const next = applyOwnerStreamingUpdate(entryId, vehicle, existing, row);
          if (next) stateStore.update(next);
        } catch (err) {
          log.debug({ err }, 'streaming message parse');
        }
      });

      ws.on('error', (err) => {
        log.warn({ err }, 'streaming socket error');
      });

      ws.on('close', () => {
        log.debug('streaming closed');
        ws = null;
        if (!signal.aborted) scheduleReconnect();
      });
    })();
  };

  connect();

  signal.addEventListener('abort', () => {
    cleanupSocket();
  });
}

/**
 * Start TeslaMate-style Owner streaming for all vehicles in this entry.
 * One WebSocket, one subscribe per vehicle (Tesla token/session limit).
 */
export function startOwnerStreaming(params: {
  entryId: string;
  client: TeslaApiClient;
  vehicles: TeslaVehicleListItem[];
}): OwnerStreamingHandle {
  const ac = new AbortController();
  const { entryId, client, vehicles } = params;

  if (vehicles.length > 0) {
    runMultiplexedStream({ entryId, client, vehicles, signal: ac.signal });
  }

  return {
    stop: () => {
      ac.abort();
    },
  };
}
