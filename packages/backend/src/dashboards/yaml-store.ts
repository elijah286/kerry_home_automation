// ---------------------------------------------------------------------------
// YAML-backed persistence for dashboard documents.
//
// Storage: `data/dashboards/<path>.yaml`. One file per dashboard keeps diffs
// small and lets users copy-paste a dashboard between installs. Path is the
// URL slug (kebab-case) and is used as the primary key.
//
// JSONB migration: when/if we move to a DB, the in-memory shape stays
// identical (DashboardDoc), just with `loadAll`/`save` hitting Postgres
// instead of the filesystem. Keep this interface narrow for that reason.
// ---------------------------------------------------------------------------

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import {
  dashboardDocSchema,
  type DashboardDoc,
} from '@ha/shared';
import { logger } from '../logger.js';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'dashboards');

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function fileFor(docPath: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(docPath)) {
    throw new Error(`Invalid dashboard path: ${docPath}`);
  }
  return path.join(DATA_DIR, `${docPath}.yaml`);
}

export async function loadAll(): Promise<DashboardDoc[]> {
  try {
    await ensureDir();
    const entries = await fs.readdir(DATA_DIR);
    const docs: DashboardDoc[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.yaml')) continue;
      const raw = await fs.readFile(path.join(DATA_DIR, entry), 'utf-8');
      try {
        const parsed = yaml.load(raw);
        const doc = dashboardDocSchema.parse(parsed);
        docs.push(doc);
      } catch (err) {
        logger.warn({ err, file: entry }, 'Failed to parse dashboard YAML; skipping');
      }
    }
    return docs;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function load(docPath: string): Promise<DashboardDoc | null> {
  try {
    const raw = await fs.readFile(fileFor(docPath), 'utf-8');
    const parsed = yaml.load(raw);
    return dashboardDocSchema.parse(parsed);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function save(doc: DashboardDoc): Promise<DashboardDoc> {
  // Re-parse so defaults are applied and unknown fields stripped.
  const normalised = dashboardDocSchema.parse(doc);
  await ensureDir();
  const content = yaml.dump(normalised, { lineWidth: 120, noRefs: true, sortKeys: false });
  await fs.writeFile(fileFor(normalised.path), content, 'utf-8');
  return normalised;
}

export async function remove(docPath: string): Promise<void> {
  try {
    await fs.unlink(fileFor(docPath));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
