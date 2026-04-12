// ---------------------------------------------------------------------------
// YAML-based storage for helper definitions
// ---------------------------------------------------------------------------

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { HelperDefinition } from '@ha/shared';
import { logger } from '../logger.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const HELPERS_FILE = path.join(DATA_DIR, 'helpers.yaml');

interface HelpersYamlDoc {
  helpers: HelperDefinition[];
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadHelpers(): Promise<HelperDefinition[]> {
  try {
    const raw = await fs.readFile(HELPERS_FILE, 'utf-8');
    const doc = yaml.load(raw) as HelpersYamlDoc | null;
    return doc?.helpers ?? [];
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    logger.error({ err }, 'Failed to read helpers YAML');
    return [];
  }
}

export async function saveHelpers(defs: HelperDefinition[]): Promise<void> {
  await ensureDir();
  const doc: HelpersYamlDoc = { helpers: defs };
  const content = yaml.dump(doc, { lineWidth: 120, noRefs: true, sortKeys: false });
  await fs.writeFile(HELPERS_FILE, content, 'utf-8');
}

export async function addHelper(def: HelperDefinition): Promise<void> {
  const all = await loadHelpers();
  if (all.some((h) => h.id === def.id)) {
    throw new Error(`Helper with id '${def.id}' already exists`);
  }
  all.push(def);
  await saveHelpers(all);
}

export async function updateHelper(id: string, partial: Partial<HelperDefinition>): Promise<HelperDefinition> {
  const all = await loadHelpers();
  const idx = all.findIndex((h) => h.id === id);
  if (idx === -1) throw new Error(`Helper '${id}' not found`);
  all[idx] = { ...all[idx], ...partial } as HelperDefinition;
  await saveHelpers(all);
  return all[idx];
}

export async function removeHelper(id: string): Promise<void> {
  const all = await loadHelpers();
  const filtered = all.filter((h) => h.id !== id);
  if (filtered.length === all.length) throw new Error(`Helper '${id}' not found`);
  await saveHelpers(filtered);
}

export async function getRawYaml(): Promise<string> {
  try {
    return await fs.readFile(HELPERS_FILE, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') return 'helpers: []\n';
    throw err;
  }
}

export async function saveRawYaml(content: string): Promise<HelperDefinition[]> {
  await ensureDir();
  // Validate that it parses
  const doc = yaml.load(content) as HelpersYamlDoc | null;
  const defs = doc?.helpers ?? [];
  // Write validated content
  await fs.writeFile(HELPERS_FILE, content, 'utf-8');
  return defs;
}
