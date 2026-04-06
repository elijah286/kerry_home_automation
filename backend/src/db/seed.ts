import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query, initDb } from './pool.js';
import { logger } from '../logger.js';
import { hashPassword } from '../auth/passwords.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HA_EXPORT = resolve(__dirname, '../../../ha_export/config/.storage');

interface HAAreaEntry { id: string; name: string; floor_id: string | null; icon: string | null; aliases: string[] }
interface HAFloorEntry { floor_id: string; name: string; level: number | null }
interface HADeviceEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  manufacturer: string | null;
  model: string | null;
  area_id: string | null;
  disabled_by: string | null;
  config_entries: string[];
  identifiers: Array<[string, string]>;
}
interface HAEntityEntry {
  entity_id: string;
  device_id: string | null;
  platform: string;
  name: string | null;
  original_name: string | null;
  area_id: string | null;
  disabled_by: string | null;
  icon: string | null;
  unique_id: string;
}
interface HAConfigEntry {
  entry_id: string;
  domain: string;
  title: string;
}

function loadJson<T>(filename: string, key?: string): T {
  const raw = readFileSync(resolve(HA_EXPORT, filename), 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const data = parsed.data as Record<string, unknown> | undefined;
  if (!data) return parsed as T;
  if (key && data[key] !== undefined) return data[key] as T;
  return (data.items ?? data.entries ?? data) as T;
}

function domainToProtocol(platform: string): string {
  const map: Record<string, string> = {
    zwave_js: 'zwave',
    lutron_caseta: 'lutron',
    mqtt: 'mqtt',
    esphome: 'esphome',
    unifi: 'api',
    unifiprotect: 'api',
    frigate: 'mqtt',
  };
  return map[platform] ?? 'api';
}

async function seed(): Promise<void> {
  await initDb();

  let haFloors: Array<{ floor_id: string; name: string; level: number | null }> = [];
  try {
    haFloors = loadJson('core.floor_registry', 'floors');
  } catch { /* optional */ }

  logger.info({ count: haFloors.length }, 'Seeding floors...');
  for (const f of haFloors) {
    await query(
      `INSERT INTO floors (id, name, level) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = $2, level = $3`,
      [f.floor_id, f.name, f.level],
    );
  }

  let haAreas: HAAreaEntry[] = [];
  try {
    haAreas = loadJson('core.area_registry', 'areas');
  } catch { /* optional */ }

  logger.info({ count: haAreas.length }, 'Seeding areas...');
  for (const a of haAreas) {
    await query(
      `INSERT INTO areas (id, name, floor_id, icon) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = $2, floor_id = $3, icon = $4`,
      [a.id, a.name, a.floor_id, a.icon],
    );
  }

  let configEntries: HAConfigEntry[] = [];
  try {
    configEntries = loadJson<HAConfigEntry[]>('core.config_entries', 'entries');
  } catch { /* optional */ }

  const platformToDomain = new Map<string, string>();
  for (const ce of configEntries) {
    platformToDomain.set(ce.entry_id, ce.domain);
  }

  let haDevices: HADeviceEntry[] = [];
  try {
    haDevices = loadJson<HADeviceEntry[]>('core.device_registry', 'devices');
  } catch { /* optional */ }

  logger.info({ count: haDevices.length }, 'Seeding devices...');
  const seededDeviceIds = new Set<string>();
  let deviceCount = 0;
  for (const d of haDevices) {
    if (d.disabled_by) continue;
    const name = d.name_by_user ?? d.name ?? 'Unknown';
    const platform = d.config_entries[0] ? (platformToDomain.get(d.config_entries[0]) ?? 'unknown') : 'unknown';
    const protocol = domainToProtocol(platform);
    await query(
      `INSERT INTO devices (id, name, manufacturer, model, area_id, protocol, connection, disabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET name = $2, manufacturer = $3, model = $4, area_id = $5, protocol = $6`,
      [d.id, name, d.manufacturer, d.model, d.area_id, protocol, JSON.stringify({ identifiers: d.identifiers }), false],
    );
    seededDeviceIds.add(d.id);
    deviceCount++;
  }

  let haEntities: HAEntityEntry[] = [];
  try {
    haEntities = loadJson<HAEntityEntry[]>('core.entity_registry', 'entities');
  } catch { /* optional */ }

  logger.info({ count: haEntities.length }, 'Seeding entities...');
  let entityCount = 0;
  for (const e of haEntities) {
    if (e.disabled_by) continue;
    const domain = e.entity_id.split('.')[0] ?? 'unknown';
    const deviceId = e.device_id && seededDeviceIds.has(e.device_id) ? e.device_id : null;
    await query(
      `INSERT INTO entities (entity_id, device_id, domain, platform, name, area_id, disabled, icon)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (entity_id) DO UPDATE SET device_id = $2, domain = $3, platform = $4, name = $5, area_id = $6, icon = $8`,
      [e.entity_id, deviceId, domain, e.platform, e.name ?? e.original_name, e.area_id, false, e.icon],
    );
    entityCount++;
  }

  // Seed default admin user if none exists
  const { rows: existingUsers } = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM users WHERE role = 'admin'",
  );
  if (parseInt(existingUsers[0]?.c ?? '0', 10) === 0) {
    const hash = await hashPassword('admin');
    await query(
      `INSERT INTO users (username, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      ['admin', 'Admin', hash, 'admin'],
    );
    logger.warn('Created default admin user (username: admin, password: admin) — change this password!');
  }

  logger.info({ devices: deviceCount, entities: entityCount }, 'Seed complete');
  await pool.end();
}

seed().catch((err) => {
  logger.fatal({ err }, 'Seed failed');
  process.exit(1);
});
