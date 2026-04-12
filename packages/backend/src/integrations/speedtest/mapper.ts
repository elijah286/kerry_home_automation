// ---------------------------------------------------------------------------
// Speedtest result → SpeedtestState mapper
// ---------------------------------------------------------------------------

import type { SpeedtestState } from '@ha/shared';
import type { SpeedtestResult } from './speedtest-client.js';

export function mapSpeedtest(
  entryId: string,
  result: SpeedtestResult,
  lastRun: number,
): SpeedtestState {
  return {
    type: 'speedtest',
    id: `speedtest.${entryId}.result`,
    name: 'Speedtest',
    integration: 'speedtest',
    areaId: null,
    available: true,
    lastChanged: lastRun,
    lastUpdated: lastRun,
    downloadMbps: result.downloadMbps,
    uploadMbps: result.uploadMbps,
    pingMs: result.pingMs,
    server: result.server,
    lastRun,
  };
}
