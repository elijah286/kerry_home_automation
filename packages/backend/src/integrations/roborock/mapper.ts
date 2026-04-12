// ---------------------------------------------------------------------------
// Roborock status → VacuumState
// ---------------------------------------------------------------------------

import type { VacuumState, VacuumStatus } from '@ha/shared';
import type { RoborockStatus } from './miio-client.js';
import { stateCodeToStatus, fanPowerToLabel } from './miio-client.js';

const ERROR_CODES: Record<number, string> = {
  0: '', 1: 'Laser sensor fault', 2: 'Collision sensor fault',
  3: 'Wheel floating', 4: 'Cliff sensor fault', 5: 'Main brush jammed',
  6: 'Side brush jammed', 7: 'Wheel jammed', 8: 'Device stuck',
  9: 'Dustbin missing', 10: 'Filter blocked', 11: 'Magnetic field detected',
  12: 'Low battery', 13: 'Charging fault', 14: 'Battery fault',
  15: 'Wall sensor fault', 16: 'Uneven surface', 17: 'Side brush fault',
  18: 'Suction fan fault', 19: 'Unpowered charging station',
  21: 'Laser distance sensor blocked', 22: 'Charge sensor fault',
  23: 'Dock fault', 24: 'No-go zone detected',
};

export function mapVacuumState(
  entryId: string,
  name: string,
  status: RoborockStatus | null,
): VacuumState {
  const statusStr = status ? stateCodeToStatus(status.state) : 'idle';

  return {
    type: 'vacuum',
    id: `roborock.${entryId}.vacuum`,
    name,
    integration: 'roborock',
    areaId: null,
    available: status != null,
    lastChanged: Date.now(),
    lastUpdated: Date.now(),
    status: statusStr as VacuumStatus,
    battery: status?.battery ?? 0,
    fanSpeed: status ? fanPowerToLabel(status.fan_power) : 'unknown',
    areaCleaned: status ? Math.round(status.clean_area / 1_000_000) : null, // mm² → m²
    cleaningTime: status ? Math.round(status.clean_time / 60) : null, // s → min
    errorMessage: status?.error_code ? (ERROR_CODES[status.error_code] ?? `Error ${status.error_code}`) : null,
  };
}
