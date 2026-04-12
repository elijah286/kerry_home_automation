// ---------------------------------------------------------------------------
// Automation CRUD + execution routes
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import type { Automation, AutomationCreate, AutomationUpdate, AutomationExecutionLog, AutomationActionLog } from '@ha/shared';
import yaml from 'js-yaml';
import { query } from '../db/pool.js';
import { automationEngine } from '../automations/engine.js';
import { exportOne, deleteYaml, exportAll } from '../automations/yaml-sync.js';
import { logger } from '../logger.js';

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

interface ExecutionRow {
  id: string;
  automation_id: string;
  triggered_at: Date;
  trigger_type: string;
  trigger_detail: Record<string, unknown> | null;
  conditions_passed: boolean;
  actions_executed: AutomationActionLog[];
  status: string;
  error: string | null;
  completed_at: Date | null;
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

function rowToExecution(r: ExecutionRow): AutomationExecutionLog {
  return {
    id: r.id,
    automationId: r.automation_id,
    triggeredAt: r.triggered_at.toISOString(),
    triggerType: r.trigger_type,
    triggerDetail: r.trigger_detail ?? undefined,
    conditionsPassed: r.conditions_passed,
    actionsExecuted: r.actions_executed,
    status: r.status as AutomationExecutionLog['status'],
    error: r.error ?? undefined,
    completedAt: r.completed_at?.toISOString() ?? undefined,
  };
}

export function registerAutomationRoutes(app: FastifyInstance): void {
  // List all
  app.get('/api/automations', async () => {
    const { rows } = await query<AutomationRow>(
      'SELECT * FROM automations ORDER BY group_name NULLS LAST, name',
    );
    return { automations: rows.map(rowToAutomation) };
  });

  // Get single
  app.get<{ Params: { id: string } }>('/api/automations/:id', async (req, reply) => {
    const { rows } = await query<AutomationRow>(
      'SELECT * FROM automations WHERE id = $1',
      [req.params.id],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Automation not found' });
    return { automation: rowToAutomation(rows[0]) };
  });

  // Create
  app.post<{ Body: AutomationCreate }>('/api/automations', async (req, reply) => {
    const { id, name, group, description, enabled, mode, triggers, conditions, actions } = req.body;

    if (!id || !name || !triggers || !actions) {
      return reply.code(400).send({ error: 'id, name, triggers, and actions are required' });
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

    logger.info({ automationId: id }, 'Automation created');
    return { automation };
  });

  // Update
  app.put<{ Params: { id: string }; Body: AutomationUpdate }>(
    '/api/automations/:id',
    async (req, reply) => {
      // Load existing first
      const { rows: existing } = await query<AutomationRow>(
        'SELECT * FROM automations WHERE id = $1',
        [req.params.id],
      );
      if (existing.length === 0) return reply.code(404).send({ error: 'Automation not found' });

      const old = existing[0];
      const oldGroup = old.group_name;
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;

      if (req.body.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(req.body.name); }
      if (req.body.group !== undefined) { sets.push(`group_name = $${idx++}`); vals.push(req.body.group); }
      if (req.body.description !== undefined) { sets.push(`description = $${idx++}`); vals.push(req.body.description); }
      if (req.body.enabled !== undefined) { sets.push(`enabled = $${idx++}`); vals.push(req.body.enabled); }
      if (req.body.mode !== undefined) { sets.push(`mode = $${idx++}`); vals.push(req.body.mode); }

      // Rebuild definition if any trigger/condition/action fields changed
      if (req.body.triggers !== undefined || req.body.conditions !== undefined || req.body.actions !== undefined) {
        const def = {
          triggers: req.body.triggers ?? old.definition.triggers,
          conditions: req.body.conditions ?? old.definition.conditions,
          actions: req.body.actions ?? old.definition.actions,
        };
        sets.push(`definition = $${idx++}`);
        vals.push(JSON.stringify(def));
      }

      if (sets.length === 0) return reply.code(400).send({ error: 'No fields to update' });

      sets.push(`updated_at = NOW()`);
      vals.push(req.params.id);

      const { rows } = await query<AutomationRow>(
        `UPDATE automations SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        vals,
      );

      const automation = rowToAutomation(rows[0]);
      await automationEngine.reload(req.params.id);

      // If group changed, delete old YAML file
      if (oldGroup !== rows[0].group_name) {
        void deleteYaml(req.params.id, oldGroup ?? undefined).catch(() => {});
      }
      void exportOne(automation).catch(() => {});

      return { automation };
    },
  );

  // Delete
  app.delete<{ Params: { id: string } }>('/api/automations/:id', async (req, reply) => {
    const { rows } = await query<AutomationRow>(
      'SELECT group_name FROM automations WHERE id = $1',
      [req.params.id],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Automation not found' });

    await query('DELETE FROM automations WHERE id = $1', [req.params.id]);
    await automationEngine.reload(req.params.id);
    void deleteYaml(req.params.id, rows[0].group_name ?? undefined).catch(() => {});

    logger.info({ automationId: req.params.id }, 'Automation deleted');
    return { ok: true };
  });

  // Manual trigger
  app.post<{ Params: { id: string } }>('/api/automations/:id/trigger', async (req, reply) => {
    const { rows } = await query('SELECT id FROM automations WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return reply.code(404).send({ error: 'Automation not found' });

    void automationEngine.trigger(req.params.id);
    return { ok: true, message: 'Automation triggered' };
  });

  // Toggle enabled
  app.put<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/api/automations/:id/enable',
    async (req, reply) => {
      const { rows } = await query<AutomationRow>(
        `UPDATE automations SET enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [req.body.enabled, req.params.id],
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'Automation not found' });
      await automationEngine.reload(req.params.id);
      return { automation: rowToAutomation(rows[0]) };
    },
  );

  // Execution history for one automation
  app.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    '/api/automations/:id/history',
    async (req) => {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const { rows } = await query<ExecutionRow>(
        `SELECT * FROM automation_execution_log
         WHERE automation_id = $1
         ORDER BY triggered_at DESC
         LIMIT $2 OFFSET $3`,
        [req.params.id, limit, offset],
      );
      return { executions: rows.map(rowToExecution) };
    },
  );

  // Global execution history
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/api/automations/history',
    async (req) => {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const { rows } = await query<ExecutionRow>(
        `SELECT * FROM automation_execution_log
         ORDER BY triggered_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      return { executions: rows.map(rowToExecution) };
    },
  );

  // Distinct group names
  app.get('/api/automations/groups', async () => {
    const { rows } = await query<{ group_name: string }>(
      `SELECT DISTINCT group_name FROM automations WHERE group_name IS NOT NULL ORDER BY group_name`,
    );
    return { groups: rows.map(r => r.group_name) };
  });

  // Export single as YAML
  app.post<{ Params: { id: string } }>('/api/automations/:id/yaml', async (req, reply) => {
    const { rows } = await query<AutomationRow>(
      'SELECT * FROM automations WHERE id = $1',
      [req.params.id],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Automation not found' });

    const automation = rowToAutomation(rows[0]);
    const filePath = await exportOne(automation);
    return { ok: true, filePath };
  });

  // Export all as YAML
  app.post('/api/automations/export-all', async () => {
    await exportAll();
    return { ok: true };
  });

  // Duplicate
  app.post<{ Params: { id: string } }>('/api/automations/:id/duplicate', async (req, reply) => {
    const { rows: existing } = await query<AutomationRow>(
      'SELECT * FROM automations WHERE id = $1',
      [req.params.id],
    );
    if (existing.length === 0) return reply.code(404).send({ error: 'Automation not found' });

    const src = existing[0];
    const newId = `${src.id}-copy-${Date.now().toString(36)}`;
    const { rows } = await query<AutomationRow>(
      `INSERT INTO automations (id, name, group_name, description, enabled, mode, definition)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [newId, `${src.name} (copy)`, src.group_name, src.description, false, src.mode, JSON.stringify(src.definition)],
    );

    const automation = rowToAutomation(rows[0]);
    void exportOne(automation).catch(() => {});
    return { automation };
  });

  // ---- Bulk YAML editor endpoints ----

  // Get all automations as a single YAML document
  app.get('/api/automations/yaml', async () => {
    const { rows } = await query<AutomationRow>(
      'SELECT * FROM automations ORDER BY group_name NULLS LAST, name',
    );
    const docs = rows.map(r => {
      const a = rowToAutomation(r);
      const doc: Record<string, unknown> = { id: a.id, name: a.name };
      if (a.group) doc.group = a.group;
      if (a.description) doc.description = a.description;
      doc.enabled = a.enabled;
      doc.mode = a.mode;
      doc.triggers = a.triggers;
      if (a.conditions.length > 0) doc.conditions = a.conditions;
      doc.actions = a.actions;
      return doc;
    });
    const content = docs.map(d => yaml.dump(d, { lineWidth: 120, noRefs: true, sortKeys: false })).join('---\n');
    return { yaml: content };
  });

  // Save all automations from a single YAML document (multi-doc)
  app.put<{ Body: { yaml: string } }>('/api/automations/yaml', async (req, reply) => {
    const raw = req.body.yaml;
    if (!raw || typeof raw !== 'string') {
      return reply.code(400).send({ error: 'yaml field is required' });
    }

    let parsed: unknown[];
    try {
      parsed = yaml.loadAll(raw) as unknown[];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Invalid YAML';
      return reply.code(400).send({ error: `YAML parse error: ${msg}` });
    }

    // Validate each doc has at minimum id, name, triggers, actions
    const docs = parsed.filter(Boolean) as Record<string, unknown>[];
    for (const doc of docs) {
      if (!doc.id || !doc.name || !doc.triggers || !doc.actions) {
        return reply.code(400).send({ error: `Automation "${doc.id ?? doc.name ?? '?'}" missing required fields (id, name, triggers, actions)` });
      }
    }

    // Get current automation IDs
    const { rows: currentRows } = await query<{ id: string; group_name: string | null }>(
      'SELECT id, group_name FROM automations',
    );
    const currentIds = new Set(currentRows.map(r => r.id));
    const incomingIds = new Set(docs.map(d => d.id as string));

    // Delete automations not in the incoming set
    for (const row of currentRows) {
      if (!incomingIds.has(row.id)) {
        await query('DELETE FROM automations WHERE id = $1', [row.id]);
        void deleteYaml(row.id, row.group_name ?? undefined).catch(() => {});
        logger.info({ automationId: row.id }, 'Automation deleted via YAML editor');
      }
    }

    // Upsert each automation
    const results: Automation[] = [];
    for (const doc of docs) {
      const id = doc.id as string;
      const name = doc.name as string;
      const group = (doc.group as string) ?? null;
      const description = (doc.description as string) ?? null;
      const enabled = doc.enabled !== false;
      const mode = (doc.mode as string) ?? 'single';
      const definition = JSON.stringify({
        triggers: doc.triggers,
        conditions: doc.conditions ?? [],
        actions: doc.actions,
      });

      let rows: AutomationRow[];
      if (currentIds.has(id)) {
        ({ rows } = await query<AutomationRow>(
          `UPDATE automations SET name=$1, group_name=$2, description=$3, enabled=$4, mode=$5, definition=$6, updated_at=NOW()
           WHERE id=$7 RETURNING *`,
          [name, group, description, enabled, mode, definition, id],
        ));
      } else {
        ({ rows } = await query<AutomationRow>(
          `INSERT INTO automations (id, name, group_name, description, enabled, mode, definition)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [id, name, group, description, enabled, mode, definition],
        ));
      }

      const automation = rowToAutomation(rows[0]);
      results.push(automation);
      await automationEngine.reload(id);
      void exportOne(automation).catch(() => {});
    }

    // Reload deleted ones
    for (const row of currentRows) {
      if (!incomingIds.has(row.id)) {
        await automationEngine.reload(row.id);
      }
    }

    logger.info({ count: results.length }, 'Automations updated via YAML editor');
    return { ok: true, count: results.length };
  });
}
