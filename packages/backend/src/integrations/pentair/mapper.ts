// ---------------------------------------------------------------------------
// IntelliCenter response → DeviceState mappers
//
// IntelliCenter returns objects with:
//   objnam: unique ID (e.g. "B1101", "C0005")
//   params: { SNAME, STATUS, TEMP, LOTMP, HITMP, ... }
// ---------------------------------------------------------------------------

import type {
  PoolBodyState,
  PoolPumpState,
  PoolCircuitState,
  PoolChemistryState,
  PoolBodyKind,
} from '@ha/shared';

const now = () => Date.now();

interface ICObject {
  objnam?: string;
  params?: Record<string, string>;
  [key: string]: unknown;
}

export function mapBody(raw: ICObject, entryId?: string): PoolBodyState {
  const objnam = raw.objnam ?? '';
  const p = raw.params ?? {};
  const name = p.SNAME ?? objnam;
  const kind: PoolBodyKind = /spa/i.test(name) ? 'spa' : 'pool';
  const prefix = entryId ? `pentair.${entryId}` : 'pentair';
  const isOn = p.STATUS === 'ON';

  return {
    type: 'pool_body',
    id: `${prefix}.body.${objnam}`,
    name,
    integration: 'pentair',
    areaId: null,
    available: true,
    lastChanged: now(),
    lastUpdated: now(),
    kind,
    on: isOn,
    currentTemp: toNumOrNull(p.TEMP ?? p.LSTTMP),
    setPoint: toNumOrNull(p.LOTMP ?? p.HITMP),
    heaterOn: p.HTMODE != null && p.HTMODE !== '0' && p.HTMODE !== 'OFF',
  };
}

export function mapPump(raw: ICObject, entryId?: string): PoolPumpState {
  const objnam = raw.objnam ?? '';
  const p = raw.params ?? {};
  const name = p.SNAME ?? `Pump ${objnam}`;
  const prefix = entryId ? `pentair.${entryId}` : 'pentair';

  return {
    type: 'pool_pump',
    id: `${prefix}.pump.${objnam}`,
    name,
    integration: 'pentair',
    areaId: null,
    available: true,
    lastChanged: now(),
    lastUpdated: now(),
    on: p.STATUS === 'ON',
    rpm: toNumOrNull(p.RPM),
    watts: toNumOrNull(p.PWR),
  };
}

export function mapCircuit(raw: ICObject, entryId?: string): PoolCircuitState {
  const objnam = raw.objnam ?? '';
  const p = raw.params ?? {};
  const name = p.SNAME ?? `Circuit ${objnam}`;
  const fn = p.SUBTYP ?? p.USAGE ?? 'generic';
  const prefix = entryId ? `pentair.${entryId}` : 'pentair';

  return {
    type: 'pool_circuit',
    id: `${prefix}.circuit.${objnam}`,
    name,
    integration: 'pentair',
    areaId: null,
    available: true,
    lastChanged: now(),
    lastUpdated: now(),
    on: p.STATUS === 'ON',
    circuitFunction: fn,
  };
}

export function mapChemistry(raw: ICObject, entryId?: string): PoolChemistryState {
  const objnam = raw.objnam ?? '';
  const p = raw.params ?? {};
  const prefix = entryId ? `pentair.${entryId}` : 'pentair';

  return {
    type: 'pool_chemistry',
    id: `${prefix}.chemistry.${objnam}`,
    name: p.SNAME ?? 'Pool Chemistry',
    integration: 'pentair',
    areaId: null,
    available: true,
    lastChanged: now(),
    lastUpdated: now(),
    ph: toNumOrNull(p.PHVAL),
    orp: toNumOrNull(p.ORPVAL),
    saltPpm: toNumOrNull(p.SALT),
    saturationIndex: null,
    waterTemp: null,
  };
}

function toNumOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
