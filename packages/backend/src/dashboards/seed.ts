// ---------------------------------------------------------------------------
// Dashboard seeding — copies read-only seed dashboards into the live data
// directory on startup, but only when the corresponding file is missing.
//
// Rationale: the Docker image bakes seeds under `seeds/dashboards/` so that
// a fresh install (empty persistent volume) comes up with a working Home
// dashboard. Existing installs that already have the file keep their user
// edits untouched — this runs every boot but is a no-op after first seed.
//
// Layout:
//   seeds/dashboards/*.yaml   — read-only templates (image-baked)
//   data/dashboards/*.yaml    — live, user-editable YAML (persistent volume)
// ---------------------------------------------------------------------------

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { logger } from '../logger.js';

const SEEDS_DIR = path.resolve(process.cwd(), 'seeds', 'dashboards');
const DATA_DIR = path.resolve(process.cwd(), 'data', 'dashboards');

export async function seedDashboardsIfMissing(): Promise<void> {
  let seeds: string[];
  try {
    seeds = await fs.readdir(SEEDS_DIR);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug('No seeds/dashboards directory — skipping dashboard seed');
      return;
    }
    throw err;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });

  let copied = 0;
  for (const entry of seeds) {
    if (!entry.endsWith('.yaml')) continue;
    const dest = path.join(DATA_DIR, entry);
    try {
      await fs.access(dest);
      // Already present — preserve user edits.
      continue;
    } catch {
      // Missing — copy from seeds.
    }
    const src = path.join(SEEDS_DIR, entry);
    await fs.copyFile(src, dest);
    copied += 1;
    logger.info({ file: entry }, 'Seeded dashboard from image template');
  }

  if (copied === 0) logger.debug('Dashboard seeds already present — nothing to copy');
}
