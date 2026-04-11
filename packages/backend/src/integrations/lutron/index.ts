// ---------------------------------------------------------------------------
// Lutron integration: manages multiple Caseta Pro bridges via LEAP
// Each integration entry = one bridge
// ---------------------------------------------------------------------------

import type { DeviceCommand, DeviceState, IntegrationHealth, FanSpeed } from '@ha/shared';
import type { Integration } from '../registry.js';
import { stateStore } from '../../state/store.js';
import { appConfig } from '../../config.js';
import { logger } from '../../logger.js';
import { LeapClient, type LeapMessage } from './leap-client.js';
import * as entryStore from '../../db/integration-entry-store.js';
import {
  extractZoneId,
  leapDeviceTypeToType,
  makeLightState,
  makeSwitchState,
  makeCoverState,
  makeFanState,
  type LutronDeviceType,
} from './mapper.js';

interface ZoneMeta {
  name: string;
  areaId: string | null;
  deviceType: LutronDeviceType;
}

interface BridgeContext {
  entryId: string;
  host: string;
  client: LeapClient;
  zones: Map<string, ZoneMeta>;
  /** LEAP area href → area name */
  areas: Map<string, string>;
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
  private bridges = new Map<string, BridgeContext>();

  async start(): Promise<void> {
    const entries = await entryStore.getEntries('lutron');
    if (entries.length === 0) {
      logger.warn('No Lutron entries configured');
      return;
    }

    const results = await Promise.allSettled(
      entries.filter((e) => e.enabled).map((entry) => {
        const host = entry.config.host;
        if (!host) {
          logger.warn({ entryId: entry.id }, 'Lutron entry missing host');
          return Promise.resolve();
        }
        const port = entry.config.port ? parseInt(entry.config.port, 10) : appConfig.lutron.defaultPort;

        const ctx: BridgeContext = {
          entryId: entry.id,
          host,
          client: new LeapClient(
            host,
            0, // bridgeIndex param still needed by LeapClient for logging
            (msg) => this.handleMessage(entry.id, msg),
            () => this.onBridgeConnected(entry.id),
            port,
          ),
          zones: new Map(),
          areas: new Map(),
        };
        this.bridges.set(entry.id, ctx);
        return ctx.client.connect();
      }),
    );

    for (const [idx, result] of results.entries()) {
      if (result.status === 'rejected') {
        const entry = entries.filter((e) => e.enabled)[idx];
        logger.error({ entryId: entry?.id, err: result.reason }, 'Lutron bridge failed to connect');
      }
    }
  }

  async stop(): Promise<void> {
    await Promise.allSettled(
      [...this.bridges.values()].map((ctx) => ctx.client.disconnect()),
    );
    this.bridges.clear();
  }

  async handleCommand(cmd: DeviceCommand): Promise<void> {
    const deviceId = cmd.deviceId;
    const parts = deviceId.split('.');
    if (parts[0] !== 'lutron' || parts.length < 4) {
      throw new Error(`Invalid Lutron device id: ${deviceId}`);
    }
    const entryId = parts[1];
    const zoneId = parts[3];
    const ctx = this.bridges.get(entryId);
    if (!ctx) throw new Error(`Lutron bridge ${entryId} not connected`);

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

        ctx.client.write({
          CommuniqueType: 'CreateRequest',
          Header: { Url: zoneHref, ClientTag: `cmd-${Date.now()}` },
          Body: { Command: commandBody },
        });
        break;
      }

      case 'switch': {
        const level = cmd.action === 'turn_on' ? 100 : 0;
        ctx.client.write({
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
        ctx.client.write({
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
        ctx.client.write({
          CommuniqueType: 'CreateRequest',
          Header: { Url: zoneHref, ClientTag: `cmd-${Date.now()}` },
          Body: { Command: { CommandType: 'GoToFanSpeed', FanSpeedParameters: { FanSpeed: FAN_SPEED_LEAP[speed] } } },
        });
        break;
      }
    }
  }

  getHealth(): IntegrationHealth {
    if (this.bridges.size === 0) {
      return { state: 'disconnected', lastConnected: null, lastError: null, failureCount: 0 };
    }
    const anyConnected = [...this.bridges.values()].some((ctx) => ctx.client.state === 'connected');
    const anyReconnecting = [...this.bridges.values()].some((ctx) => ctx.client.state === 'reconnecting');
    return {
      state: anyConnected ? 'connected' : anyReconnecting ? 'reconnecting' : 'disconnected',
      lastConnected: null,
      lastError: null,
      failureCount: 0,
    };
  }

  // -- Bridge event handlers -----------------------------------------------

  private onBridgeConnected(entryId: string): void {
    const ctx = this.bridges.get(entryId);
    if (!ctx) return;

    // Request area list first for area-prefixed device names
    ctx.client.write({
      CommuniqueType: 'ReadRequest',
      Header: { Url: '/area', ClientTag: `area-${entryId}-${Date.now()}` },
    });

    ctx.client.write({
      CommuniqueType: 'ReadRequest',
      Header: { Url: '/device', ClientTag: `dev-${entryId}-${Date.now()}` },
    });

    ctx.client.write({
      CommuniqueType: 'SubscribeRequest',
      Header: { Url: '/zone/status', ClientTag: `sub-${entryId}-${Date.now()}` },
    });

    ctx.client.write({
      CommuniqueType: 'ReadRequest',
      Header: { Url: '/zone/status', ClientTag: `bulk-${entryId}-${Date.now()}` },
    });
  }

  private handleMessage(entryId: string, msg: LeapMessage): void {
    const body = msg.Body;
    if (!body) return;

    // Area list response
    if (Array.isArray(body.Areas)) {
      this.ingestAreas(entryId, body.Areas as Record<string, unknown>[]);
      return;
    }

    if (Array.isArray(body.Devices)) {
      this.ingestDevices(entryId, body.Devices as Record<string, unknown>[]);
      return;
    }

    if (Array.isArray(body.ZoneStatuses)) {
      for (const raw of body.ZoneStatuses as Record<string, unknown>[]) {
        this.applyZoneStatus(entryId, raw);
      }
      return;
    }

    if (body.ZoneStatus && typeof body.ZoneStatus === 'object') {
      this.applyZoneStatus(entryId, body as Record<string, unknown>);
      return;
    }

    const url = msg.Header?.Url as string | undefined;
    if (url) {
      const zoneId = extractZoneId(url);
      if (zoneId && body) {
        this.applyZoneStatus(entryId, body, zoneId);
      }
    }
  }

  private ingestAreas(entryId: string, areas: Record<string, unknown>[]): void {
    const ctx = this.bridges.get(entryId);
    if (!ctx) return;

    for (const a of areas) {
      const href = a.href as string | undefined;
      const name = a.Name as string | undefined;
      if (href && name) {
        ctx.areas.set(href, name);
      }
    }
    logger.info({ entryId, areas: ctx.areas.size }, 'Lutron areas discovered');
  }

  private ingestDevices(entryId: string, devices: Record<string, unknown>[]): void {
    const ctx = this.bridges.get(entryId);
    if (!ctx) return;

    let count = 0;
    for (const d of devices) {
      const localZones = d.LocalZones as unknown;
      if (!Array.isArray(localZones) || localZones.length === 0) continue;

      const first = localZones[0] as Record<string, unknown>;
      const href = first?.href;
      if (!href) continue;

      const zoneId = extractZoneId(String(href));
      if (!zoneId) continue;

      count++;
      const deviceName = d.Name as string | undefined;
      const deviceType = d.DeviceType as string | undefined;
      const resolvedType = deviceType ? leapDeviceTypeToType(deviceType) : 'light';

      // Resolve area from LEAP AssociatedArea href or direct Name
      let leapArea: string | null = null;
      const assocArea = d.AssociatedArea as Record<string, unknown> | undefined;
      if (assocArea?.href) {
        leapArea = ctx.areas.get(assocArea.href as string) ?? (assocArea.Name as string | undefined) ?? null;
      } else if (assocArea?.Name) {
        leapArea = assocArea.Name as string;
      }

      // Build full name: "Area Name" prefix + device name for disambiguation
      const baseName = deviceName ?? `Zone ${zoneId}`;
      const fullName = leapArea ? `${leapArea} ${baseName}` : baseName;

      ctx.zones.set(zoneId, {
        name: fullName,
        areaId: leapArea,
        deviceType: resolvedType,
      });
    }

    logger.info({ entryId, zones: count }, 'Lutron zone discovery complete');
  }

  private applyZoneStatus(entryId: string, fragment: Record<string, unknown>, hintZoneId?: string): void {
    const ctx = this.bridges.get(entryId);
    if (!ctx) return;

    const inner = fragment.ZoneStatus && typeof fragment.ZoneStatus === 'object'
      ? fragment.ZoneStatus as Record<string, unknown>
      : fragment;

    const zoneId = hintZoneId ?? (() => {
      const href = readNested(inner, ['Zone', 'href']);
      return href ? extractZoneId(String(href)) : null;
    })();

    if (!zoneId) return;

    const meta = ctx.zones.get(zoneId);
    const zoneMeta = {
      entryId,
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

}

function readNested(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
