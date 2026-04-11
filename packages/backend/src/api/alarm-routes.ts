// ---------------------------------------------------------------------------
// Alarm CRUD routes
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import type { Alarm, AlarmCreate, AlarmUpdate } from '@ha/shared';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

interface AlarmRow {
  id: string;
  name: string;
  time: string;
  days_of_week: number[];
  enabled: boolean;
  devices: Alarm['devices'];
  created_at: Date;
  updated_at: Date;
}

function rowToAlarm(r: AlarmRow): Alarm {
  // time comes as "HH:MM:SS", trim seconds
  const t = typeof r.time === 'string' ? r.time.slice(0, 5) : r.time;
  return {
    id: r.id,
    name: r.name,
    time: t,
    daysOfWeek: r.days_of_week,
    enabled: r.enabled,
    devices: r.devices,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export function registerAlarmRoutes(app: FastifyInstance): void {
  // List all
  app.get('/api/alarms', async () => {
    const { rows } = await query<AlarmRow>(
      'SELECT * FROM alarms ORDER BY time ASC, name ASC',
    );
    return { alarms: rows.map(rowToAlarm) };
  });

  // Create
  app.post<{ Body: AlarmCreate }>('/api/alarms', async (req) => {
    const { name, time, daysOfWeek, enabled, devices } = req.body;
    const { rows } = await query<AlarmRow>(
      `INSERT INTO alarms (name, time, days_of_week, enabled, devices)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, time, daysOfWeek ?? [], enabled ?? true, JSON.stringify(devices ?? [])],
    );
    logger.info({ alarmId: rows[0].id }, 'Alarm created');
    return { alarm: rowToAlarm(rows[0]) };
  });

  // Update
  app.put<{ Params: { id: string }; Body: AlarmUpdate }>(
    '/api/alarms/:id',
    async (req, reply) => {
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;

      if (req.body.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(req.body.name); }
      if (req.body.time !== undefined) { sets.push(`time = $${idx++}`); vals.push(req.body.time); }
      if (req.body.daysOfWeek !== undefined) { sets.push(`days_of_week = $${idx++}`); vals.push(req.body.daysOfWeek); }
      if (req.body.enabled !== undefined) { sets.push(`enabled = $${idx++}`); vals.push(req.body.enabled); }
      if (req.body.devices !== undefined) { sets.push(`devices = $${idx++}`); vals.push(JSON.stringify(req.body.devices)); }

      if (sets.length === 0) return reply.code(400).send({ error: 'No fields to update' });

      sets.push(`updated_at = NOW()`);
      vals.push(req.params.id);

      const { rows } = await query<AlarmRow>(
        `UPDATE alarms SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        vals,
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'Alarm not found' });
      return { alarm: rowToAlarm(rows[0]) };
    },
  );

  // Delete
  app.delete<{ Params: { id: string } }>('/api/alarms/:id', async (req, reply) => {
    const { rowCount } = await query('DELETE FROM alarms WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return reply.code(404).send({ error: 'Alarm not found' });
    return { ok: true };
  });

  // Duplicate
  app.post<{ Params: { id: string } }>('/api/alarms/:id/duplicate', async (req, reply) => {
    const { rows: existing } = await query<AlarmRow>(
      'SELECT * FROM alarms WHERE id = $1',
      [req.params.id],
    );
    if (existing.length === 0) return reply.code(404).send({ error: 'Alarm not found' });
    const src = existing[0];
    const { rows } = await query<AlarmRow>(
      `INSERT INTO alarms (name, time, days_of_week, enabled, devices)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [`${src.name} (copy)`, src.time, src.days_of_week, src.enabled, JSON.stringify(src.devices)],
    );
    return { alarm: rowToAlarm(rows[0]) };
  });

  // Disable all
  app.post('/api/alarms/disable-all', async () => {
    await query('UPDATE alarms SET enabled = false, updated_at = NOW()');
    return { ok: true };
  });

  // Enable all
  app.post('/api/alarms/enable-all', async () => {
    await query('UPDATE alarms SET enabled = true, updated_at = NOW()');
    return { ok: true };
  });
}
