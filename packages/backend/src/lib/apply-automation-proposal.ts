// ---------------------------------------------------------------------------
// Apply prepared automation ops (shared logic with automation-routes CRUD)
// ---------------------------------------------------------------------------

import type { Automation, AutomationCreate, AutomationUpdate } from '@ha/shared';
import { query } from '../db/pool.js';
import { automationEngine } from '../automations/engine.js';
import { exportOne, deleteYaml } from '../automations/yaml-sync.js';
import { logger } from '../logger.js';
import type { PendingAutomationOp } from './chat-automation-proposals.js';

interface AutomationRow {
  id: string;
  name: string;
  group_name: string | null;
  description: string | null;
  enabled: boolean;
  mode: string;
  definition: { triggers: []; conditions: []; actions: [] };
  last_triggered: Date | null;
  created_at: Date;
  updated_at: Date;
}

function rowToAutomation(r: AutomationRow): Automation {
  return {
    id: r.id,
    name: r.name,
    group: r.group_name ?? undefined,
    description: r.description ?? undefined,
    enabled: r.enabled,
    mode: (r.mode as Automation['mode']) ?? 'single',
    triggers: r.definition.triggers ?? [],
    conditions: r.definition.conditions ?? [],
    actions: r.definition.actions ?? [],
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    lastTriggered: r.last_triggered?.toISOString() ?? null,
  };
}

export async function applyAutomationProposal(op: PendingAutomationOp): Promise<{ automation?: Automation; deleted?: boolean }> {
  switch (op.action) {
    case 'create': {
      const { id, name, group, description, enabled, mode, triggers, conditions, actions } = op.body;
      if (!id || !name || !triggers?.length || !actions?.length) {
        throw new Error('Create requires id, name, non-empty triggers, and non-empty actions');
      }
      const definition = { triggers, conditions: conditions ?? [], actions };
      const { rows } = await query<AutomationRow>(
        `INSERT INTO automations (id, name, group_name, description, enabled, mode, definition)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, name, group ?? null, description ?? null, enabled ?? true, mode ?? 'single', JSON.stringify(definition)],
      );
      const automation = rowToAutomation(rows[0]);
      await automationEngine.reload(id);
      void exportOne(automation).catch(() => {});
      logger.info({ automationId: id }, 'Automation created via chat commit');
      return { automation };
    }
    case 'update': {
      const { rows: existing } = await query<AutomationRow>('SELECT * FROM automations WHERE id = $1', [op.id]);
      if (existing.length === 0) throw new Error('Automation not found');
      const old = existing[0];
      const oldGroup = old.group_name;
      const body = op.body;
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;

      if (body.name !== undefined) {
        sets.push(`name = $${idx++}`);
        vals.push(body.name);
      }
      if (body.group !== undefined) {
        sets.push(`group_name = $${idx++}`);
        vals.push(body.group);
      }
      if (body.description !== undefined) {
        sets.push(`description = $${idx++}`);
        vals.push(body.description);
      }
      if (body.enabled !== undefined) {
        sets.push(`enabled = $${idx++}`);
        vals.push(body.enabled);
      }
      if (body.mode !== undefined) {
        sets.push(`mode = $${idx++}`);
        vals.push(body.mode);
      }
      if (body.triggers !== undefined || body.conditions !== undefined || body.actions !== undefined) {
        const def = {
          triggers: body.triggers ?? old.definition.triggers,
          conditions: body.conditions ?? old.definition.conditions,
          actions: body.actions ?? old.definition.actions,
        };
        sets.push(`definition = $${idx++}`);
        vals.push(JSON.stringify(def));
      }

      if (sets.length === 0) throw new Error('No fields to update');

      sets.push(`updated_at = NOW()`);
      vals.push(op.id);

      const { rows } = await query<AutomationRow>(
        `UPDATE automations SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        vals,
      );
      const automation = rowToAutomation(rows[0]);
      await automationEngine.reload(op.id);
      if (oldGroup !== rows[0].group_name) {
        void deleteYaml(op.id, oldGroup ?? undefined).catch(() => {});
      }
      void exportOne(automation).catch(() => {});
      logger.info({ automationId: op.id }, 'Automation updated via chat commit');
      return { automation };
    }
    case 'delete': {
      const { rows } = await query<AutomationRow>('SELECT group_name FROM automations WHERE id = $1', [op.id]);
      if (rows.length === 0) throw new Error('Automation not found');
      await query('DELETE FROM automations WHERE id = $1', [op.id]);
      await automationEngine.reload(op.id);
      void deleteYaml(op.id, rows[0].group_name ?? undefined).catch(() => {});
      logger.info({ automationId: op.id }, 'Automation deleted via chat commit');
      return { deleted: true };
    }
  }
}
