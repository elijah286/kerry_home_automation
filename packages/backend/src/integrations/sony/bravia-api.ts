// ---------------------------------------------------------------------------
// Sony Bravia IP Control REST API client (JSON-RPC over HTTP)
// ---------------------------------------------------------------------------

import { logger } from '../../logger.js';

const TIMEOUT_MS = 5_000;
const MAX_BODY = 512_000;

interface JsonRpcResponse {
  id: number;
  result?: unknown[];
  error?: unknown;
}

async function braviaRpc(
  host: string,
  psk: string,
  service: string,
  method: string,
  params: unknown[] = [],
  version: string = '1.0',
): Promise<unknown[] | null> {
  const url = `http://${host}/sony/${service}`;
  const body = JSON.stringify({ id: 1, method, version, params });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-PSK': psk,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const text = await res.text();
    if (text.length > MAX_BODY) return null;

    const json = JSON.parse(text) as JsonRpcResponse;
    if (json.error) {
      logger.debug({ host, service, method, error: json.error }, 'Bravia RPC error');
      return null;
    }
    return json.result ?? [];
  } catch {
    return null;
  }
}

// ---- System ----------------------------------------------------------------

export interface BraviaSystemInfo {
  model: string;
  name: string;
  product: string;
}

export async function getSystemInfo(host: string, psk: string): Promise<BraviaSystemInfo | null> {
  const result = await braviaRpc(host, psk, 'system', 'getSystemInformation');
  if (!result || !result[0]) return null;
  const info = result[0] as Record<string, string>;
  return {
    model: info.model ?? 'Sony TV',
    name: info.name ?? info.model ?? 'Sony TV',
    product: info.product ?? 'tv',
  };
}

export type PowerStatus = 'active' | 'standby';

export async function getPowerStatus(host: string, psk: string): Promise<PowerStatus | null> {
  const result = await braviaRpc(host, psk, 'system', 'getPowerStatus');
  if (!result || !result[0]) return null;
  const status = (result[0] as Record<string, string>).status;
  return status === 'active' ? 'active' : 'standby';
}

export async function setPowerStatus(host: string, psk: string, active: boolean): Promise<boolean> {
  const result = await braviaRpc(host, psk, 'system', 'setPowerStatus', [
    { status: active },
  ]);
  return result != null;
}

// ---- Audio -----------------------------------------------------------------

export interface BraviaVolume {
  volume: number;
  maxVolume: number;
  mute: boolean;
}

export async function getVolumeInfo(host: string, psk: string): Promise<BraviaVolume | null> {
  const result = await braviaRpc(host, psk, 'audio', 'getVolumeInformation');
  if (!result || !Array.isArray(result[0])) return null;
  // The API returns an array of volume targets; pick "speaker"
  const targets = result[0] as Array<Record<string, unknown>>;
  const speaker = targets.find((t) => t.target === 'speaker') ?? targets[0];
  if (!speaker) return null;
  return {
    volume: typeof speaker.volume === 'number' ? speaker.volume : 0,
    maxVolume: typeof speaker.maxVolume === 'number' ? speaker.maxVolume : 100,
    mute: Boolean(speaker.mute),
  };
}

export async function setVolume(host: string, psk: string, volume: number): Promise<boolean> {
  const result = await braviaRpc(host, psk, 'audio', 'setAudioVolume', [
    { target: 'speaker', volume: String(volume) },
  ]);
  return result != null;
}

export async function setMute(host: string, psk: string, mute: boolean): Promise<boolean> {
  const result = await braviaRpc(host, psk, 'audio', 'setAudioMute', [
    { status: mute },
  ]);
  return result != null;
}

// ---- AV Content ------------------------------------------------------------

export interface BraviaInput {
  uri: string;
  title: string;
  connection: boolean;
}

export async function getExternalInputs(host: string, psk: string): Promise<BraviaInput[]> {
  const result = await braviaRpc(host, psk, 'avContent', 'getCurrentExternalInputsStatus');
  if (!result || !Array.isArray(result[0])) return [];
  return (result[0] as Array<Record<string, unknown>>).map((inp) => ({
    uri: String(inp.uri ?? ''),
    title: String(inp.title ?? inp.label ?? ''),
    connection: Boolean(inp.connection),
  }));
}

export interface BraviaPlayingContent {
  uri: string;
  title: string;
  source: string;
}

export async function getPlayingContent(host: string, psk: string): Promise<BraviaPlayingContent | null> {
  const result = await braviaRpc(host, psk, 'avContent', 'getPlayingContentInfo');
  if (!result || !result[0]) return null;
  const content = result[0] as Record<string, string>;
  return {
    uri: content.uri ?? '',
    title: content.title ?? '',
    source: content.source ?? '',
  };
}

export async function setPlayContent(host: string, psk: string, uri: string): Promise<boolean> {
  const result = await braviaRpc(host, psk, 'avContent', 'setPlayContent', [{ uri }]);
  return result != null;
}
