// ---------------------------------------------------------------------------
// Lutron integration: manages multiple Caseta Pro bridges via LEAP
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeviceCommand, DeviceState, IntegrationHealth, FanSpeed } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { appConfig } from '../../config.js';
import { logger } from '../../logger.js';
import { LeapClient, type LeapMessage } from './leap-client.js';
import {
  extractZoneId,
  leapDeviceTypeToType,
  makeLightState,
  makeSwitchState,
  makeCoverState,
  makeFanState,
  type LutronDeviceType,
} from './mapper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CERTS_DIR = resolve(__dirname, '../../../certs');

interface ZoneMeta {
  name: string;
  areaId: string | null;
  deviceType: LutronDeviceType;
}

const FAN_SPEED_LEAP: Record<FanSpeed, string> = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  'medium-high': 'MediumHigh',
  high: 'High',
};

export class LutronIntegration implements Integration {
  readonly id = 'lutron' as const;
  private clients: LeapClient[] = [];
  /** bridgeIndex:zoneId → zone metadata */
  private zones = new Map<string, ZoneMeta>();
  /** bridgeIndex:zoneId → discovered zone IDs per bridge */
  private discoveredZones = new Map<number, Set<string>>();
  /** Names from Caseta Pro JSON files (fallback) */
  private jsonNames = new Map<string, { name: string; area: string }>();

  constructor() {
    this.loadCasetaProJson();
  }

  async start(): Promise<void> {
    const hosts = appConfig.lutron.hosts;
    if (hosts.length === 0) {
      logger.warn('No Lutron hosts configured');
      return;
    }

    this.clients = hosts.map((host, idx) =>
      new LeapClient(
        host,
        idx,
        (msg) => this.handleMessage(idx, msg),
        () => this.onBridgeConnected(idx),
      ),
    );

    // Connect all bridges in parallel, isolated
    await Promise.allSettled(this.clients.map((c) => c.connect()));
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.clients.map((c) => c.disconnect()));
    this.clients = [];
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    const deviceId = cmd.deviceId;
    const parts = deviceId.split('.');
    if (parts[0] !== 'lutron' || parts.length < 4) {
      throw new Error(`Invalid Lutron device id: ${deviceId}`);
    }
    const bridgeIndex = parseInt(parts[1].replace(/^b/, ''), 10);
    const zoneId = parts[3];
    const client = this.clients[bridgeIndex];
    if (!client) throw new Error(`Lutron bridge ${bridgeIndex} not connected`);

    const zoneHref = `/zone/${zoneId}/commandprocessor`;

    switch (cmd.type) {
      case 'light': {
        let level = 0;
        if (cmd.action === 'turn_on') level = cmd.brightness ?? 100;
        else if (cmd.action === 'turn_off') level = 0;
        else if (cmd.action === 'set_brightness') level = cmd.brightness ?? 100;
        level = Math.max(0, Math.min(100, level));

        const useDim = cmd.action === 'set_brightness' || (cmd.action === 'turn_on' && cmd.brightness !== undefined);
        const commandBody = useDim
          ? { CommandType: 'GoToDimmedLevel', DimmedLevelParameters: { Level: level } }
          : { CommandType: 'GoToLevel', Parameter: [{ Type: 'Level', Value: level }] };

        client.write({
          CommuniqueType: 'CreateRequest',
          Header: { Url: zoneHref, ClientTag: `cmd-${Date.now()}` },
          Body: { Command: commandBody },
        });
        break;
      }

      case 'switch': {
        const level = cmd.action === 'turn_on' ? 100 : 0;
        client.write({
          CommuniqueType: 'CreateRequest',
          Header: { Url: zoneHref, ClientTag: `cmd-${Date.now()}` },
          Body: { Command: { CommandType: 'GoToLevel', Parameter: [{ Type: 'Level', Value: level }] } },
        });
        break;
      }

      case 'cover': {
        let level = 0;
        if (cmd.action === 'open') level = 100;
        else if (cmd.action === 'close') level = 0;
        else if (cmd.action === 'set_position') level = cmd.position ?? 0;
        client.write({
          CommuniqueType: 'CreateRequest',
          Header: { Url: zoneHref, ClientTag: `cmd-${Date.now()}` },
          Body: { Command: { CommandType: 'GoToLevel', Parameter: [{ Type: 'Level', Value: level }] } },
        });
        break;
      }

      case 'fan': {
        let speed: FanSpeed = 'off';
        if (cmd.action === 'turn_on') speed = cmd.speed ?? 'medium';
        else if (cmd.action === 'turn_off') speed = 'off';
        else if (cmd.action === 'set_speed') speed = cmd.speed ?? 'medium';
        client.write({
          CommuniqueType: 'CreateRequest',
          Header: { Url: zoneHref, ClientTag: `cmd-${Date.now()}` },
          Body: { Command: { CommandType: 'GoToFanSpeed', FanSpeedParameters: { FanSpeed: FAN_SPEED_LEAP[speed] } } },
        });
        break;
      }
    }
  }

  getHealth(): IntegrationHealth {
    if (this.clients.length === 0) {
      return { state: 'disconnected', lastConnected: null, lastError: null, failureCount: 0 };
    }
    const anyConnected = this.clients.some((c) => c.state === 'connected');
    const anyReconnecting = this.clients.some((c) => c.state === 'reconnecting');
    return {
      state: anyConnected ? 'connected' : anyReconnecting ? 'reconnecting' : 'disconnected',
      lastConnected: null,
      lastError: null,
      failureCount: 0,
    };
  }

  // -- Bridge event handlers -----------------------------------------------

  private onBridgeConnected(bridgeIndex: number): void {
    // Request device list for zone discovery
    const client = this.clients[bridgeIndex];
    client.write({
      CommuniqueType: 'ReadRequest',
      Header: { Url: '/device', ClientTag: `dev-${bridgeIndex}-${Date.now()}` },
    });

    // Subscribe to zone status updates
    client.write({
      CommuniqueType: 'SubscribeRequest',
      Header: { Url: '/zone/status', ClientTag: `sub-${bridgeIndex}-${Date.now()}` },
    });

    // Request current status of all zones
    client.write({
      CommuniqueType: 'ReadRequest',
      Header: { Url: '/zone/status', ClientTag: `bulk-${bridgeIndex}-${Date.now()}` },
    });
  }

  private handleMessage(bridgeIndex: number, msg: LeapMessage): void {
    const body = msg.Body;
    if (!body) return;

    // Device list response → zone discovery
    if (Array.isArray(body.Devices)) {
      this.ingestDevices(bridgeIndex, body.Devices as Record<string, unknown>[]);
      return;
    }

    // Multi-zone status response
    if (Array.isArray(body.ZoneStatuses)) {
      for (const raw of body.ZoneStatuses as Record<string, unknown>[]) {
        this.applyZoneStatus(bridgeIndex, raw);
      }
      return;
    }

    // Single zone status (subscription update or individual poll)
    if (body.ZoneStatus && typeof body.ZoneStatus === 'object') {
      this.applyZoneStatus(bridgeIndex, body as Record<string, unknown>);
      return;
    }

    // Check if Header.Url has a zone reference
    const url = msg.Header?.Url as string | undefined;
    if (url) {
      const zoneId = extractZoneId(url);
      if (zoneId && body) {
        this.applyZoneStatus(bridgeIndex, body, zoneId);
      }
    }
  }

  private ingestDevices(bridgeIndex: number, devices: Record<string, unknown>[]): void {
    const zoneIds = new Set<string>();

    for (const d of devices) {
      const localZones = d.LocalZones as unknown;
      if (!Array.isArray(localZones) || localZones.length === 0) continue;

      const first = localZones[0] as Record<string, unknown>;
      const href = first?.href;
      if (!href) continue;

      const zoneId = extractZoneId(String(href));
      if (!zoneId) continue;

      zoneIds.add(zoneId);

      const deviceName = d.Name as string | undefined;
      const deviceType = d.DeviceType as string | undefined;
      const key = `${bridgeIndex}:${zoneId}`;
      const jsonInfo = this.jsonNames.get(key);

      // Prefer Caseta Pro JSON name (includes area prefix like "Movie Room Ceiling Fan")
      // over bare LEAP name ("Ceiling Fan") for better identification
      this.zones.set(key, {
        name: jsonInfo?.name ?? deviceName ?? `Zone ${zoneId}`,
        areaId: jsonInfo?.area ?? null,
        deviceType: deviceType ? leapDeviceTypeToType(deviceType) : 'light',
      });
    }

    this.discoveredZones.set(bridgeIndex, zoneIds);
    logger.info({ bridgeIndex, zones: zoneIds.size }, 'Lutron zone discovery complete');
  }

  private applyZoneStatus(bridgeIndex: number, fragment: Record<string, unknown>, hintZoneId?: string): void {
    const inner = fragment.ZoneStatus && typeof fragment.ZoneStatus === 'object'
      ? fragment.ZoneStatus as Record<string, unknown>
      : fragment;

    const zoneId = hintZoneId ?? (() => {
      const href = readNested(inner, ['Zone', 'href']);
      return href ? extractZoneId(String(href)) : null;
    })();

    if (!zoneId) return;

    const key = `${bridgeIndex}:${zoneId}`;
    const meta = this.zones.get(key);
    const zoneMeta = {
      bridgeIndex,
      zoneId,
      name: meta?.name ?? `Zone ${zoneId}`,
      areaId: meta?.areaId ?? null,
      deviceType: meta?.deviceType ?? 'light',
    };

    const rawLevel = readNested(inner, ['Level']) ?? inner.Level ?? fragment.Level;
    const rawFanSpeed = readNested(inner, ['FanSpeed']) ?? inner.FanSpeed;

    if (rawLevel !== undefined && rawLevel !== null) {
      const level = Number(rawLevel);
      let state: DeviceState;
      switch (zoneMeta.deviceType) {
        case 'cover':
          state = makeCoverState(zoneMeta, level);
          break;
        case 'switch':
          state = makeSwitchState(zoneMeta, level);
          break;
        case 'light':
        default:
          state = makeLightState(zoneMeta, level);
          break;
      }
      stateStore.update(state);
    } else if (rawFanSpeed !== undefined && rawFanSpeed !== null) {
      stateStore.update(makeFanState(zoneMeta, String(rawFanSpeed)));
    }
  }

  // -- Caseta Pro JSON loading (name hints) --------------------------------

  private loadCasetaProJson(): void {
    if (!existsSync(CERTS_DIR)) return;
    try {
      const files = readdirSync(CERTS_DIR).filter(
        (f) => f.startsWith('lutron_caseta_pro_') && f.endsWith('.json'),
      );

      for (const file of files) {
        const hostMatch = /lutron_caseta_pro_(.+)\.json/.exec(file);
        if (!hostMatch) continue;
        const host = hostMatch[1];
        const idx = appConfig.lutron.hosts.indexOf(host);
        const bridgeIndex = idx >= 0 ? idx : 0;

        try {
          const raw = readFileSync(resolve(CERTS_DIR, file), 'utf8');
          const data = JSON.parse(raw) as {
            LIPIdList?: {
              Zones?: Array<{ ID: number; Name: string; Area?: { Name: string } }>;
            };
          };

          for (const z of data.LIPIdList?.Zones ?? []) {
            this.jsonNames.set(`${bridgeIndex}:${z.ID}`, {
              name: z.Area ? `${z.Area.Name} ${z.Name}` : z.Name,
              area: z.Area?.Name ?? '',
            });
          }

          logger.info({ file, bridgeIndex, zones: (data.LIPIdList?.Zones ?? []).length },
            'Loaded Caseta Pro JSON name hints');
        } catch (err) {
          logger.warn({ err, file }, 'Failed to parse Caseta Pro JSON');
        }
      }
    } catch {
      // certs dir may not exist
    }
  }
}

function readNested(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
