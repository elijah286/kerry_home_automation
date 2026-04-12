// ---------------------------------------------------------------------------
// Xbox status → MediaPlayerState
// ---------------------------------------------------------------------------

import type { MediaPlayerState } from '@ha/shared';
import type { XboxStatus } from './smartglass-client.js';

export function mapXboxState(
  entryId: string,
  host: string,
  status: XboxStatus | null,
): MediaPlayerState {
  const focusedApp = status?.active_titles?.find((t) => t.has_focus);
  const isOn = status?.connection_state === 'Connected';

  return {
    type: 'media_player',
    id: `xbox.${entryId}.console`,
    name: status?.console_name ?? 'Xbox',
    integration: 'xbox',
    areaId: null,
    available: status != null,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    power: isOn ? 'on' : 'standby',
    volume: 0,
    muted: false,
    source: focusedApp?.name ?? '',
    sourceList: status?.active_titles?.map((t) => t.name) ?? [],
    soundProgram: '',
    soundProgramList: [],
    zone: 'main',
    model: status?.console_type ?? 'Xbox',
    host,
  };
}
