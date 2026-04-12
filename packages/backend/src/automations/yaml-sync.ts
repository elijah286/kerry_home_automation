// ---------------------------------------------------------------------------
// YAML export/sync — writes automation definitions to disk for git tracking
// ---------------------------------------------------------------------------

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { Automation, AutomationDefinition } from '@ha/shared';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

const BASE_DIR = process.env.AUTOMATIONS_DIR ?? 'data/automations';

function toYamlDoc(a: Automation): string {
  const doc: Record<string, unknown> = {
    id: a.id,
    name: a.name,
  };
  if (a.group) doc.group = a.group;
  if (a.description) doc.description = a.description;
  doc.enabled = a.enabled;
  doc.mode = a.mode;
  doc.triggers = a.triggers;
  if (a.conditions.length > 0) doc.conditions = a.conditions;
  doc.actions = a.actions;
  return yaml.dump(doc, { lineWidth: 120, noRefs: true, sortKeys: false });
}

function groupDir(group?: string): string {
  return join(BASE_DIR, group ?? 'ungrouped');
}

export async function exportOne(automation: Automation): Promise<string> {
  const dir = groupDir(automation.group);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${automation.id}.yaml`);
  await writeFile(filePath, toYamlDoc(automation), 'utf-8');
  return filePath;
}

export async function exportAll(): Promise<void> {
  const { rows } = await query<{
    id: string; name: string; group_name: string | null; description: string | null;
    enabled: boolean; mode: string; definition: unknown;
    last_triggered: Date | null; created_at: Date; updated_at: Date;
  }>('SELECT * FROM automations ORDER BY group_name, name');

  for (const row of rows) {
    const def = row.definition as { triggers: []; conditions: []; actions: [] };
    const automation: Automation = {
      id: row.id,
      name: row.name,
      group: row.group_name ?? undefined,
      description: row.description ?? undefined,
      enabled: row.enabled,
      mode: (row.mode as Automation['mode']) ?? 'single',
      triggers: def.triggers ?? [],
      conditions: def.conditions ?? [],
      actions: def.actions ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      lastTriggered: row.last_triggered?.toISOString() ?? null,
    };
    await exportOne(automation);
  }

  logger.info({ count: rows.length, dir: BASE_DIR }, 'Exported automations to YAML');
}

export async function deleteYaml(id: string, group?: string): Promise<void> {
  const filePath = join(groupDir(group), `${id}.yaml`);
  try {
    await rm(filePath);
  } catch {
    // File may not exist
  }
}
