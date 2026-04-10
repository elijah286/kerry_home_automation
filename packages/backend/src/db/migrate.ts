// ---------------------------------------------------------------------------
// SQL migration runner
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, './migrations');

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get already-applied migrations
    const { rows: applied } = await client.query<{ name: string }>(
      'SELECT name FROM _migrations ORDER BY name',
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    // Read migration files
    let files: string[];
    try {
      files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    } catch {
      logger.warn('No migrations directory found — skipping');
      return;
    }

    // Run pending migrations
    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
      logger.info({ migration: file }, 'Running migration');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err, migration: file }, 'Migration failed');
        throw err;
      }
    }

    if (count > 0) {
      logger.info({ count }, 'Migrations applied');
    } else {
      logger.info('Database schema up to date');
    }
  } finally {
    client.release();
  }
}
