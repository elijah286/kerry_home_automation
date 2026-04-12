// ---------------------------------------------------------------------------
// Samsung TV state → MediaPlayerState
// ---------------------------------------------------------------------------

import type { MediaPlayerState } from '@ha/shared';
import type { SamsungDeviceInfo } from './samsung-client.js';

export function mapSamsungState(
  entryId: string,
  host: string,
  deviceInfo: SamsungDeviceInfo | null,
  powerOn: boolean,
): MediaPlayerState {
  return {
    type: 'media_player',
    id: `samsung.${entryId}.tv`,
    name: deviceInfo?.name ?? 'Samsung TV',
    integration: 'samsung',
    areaId: null,
    available: powerOn,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    power: powerOn ? 'on' : 'standby',
    volume: 0,
    muted: false,
    source: 'unknown',
    sourceList: ['HDMI 1', 'HDMI 2', 'HDMI 3', 'HDMI 4', 'TV'],
    soundProgram: '',
    soundProgramList: [],
    zone: 'main',
    model: deviceInfo?.modelName ?? 'Samsung TV',
    host,
  };
}
