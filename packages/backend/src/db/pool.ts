// ---------------------------------------------------------------------------
// PostgreSQL connection pool singleton
// ---------------------------------------------------------------------------

import pg from 'pg';
import { appConfig } from '../config.js';
import { logger } from '../logger.js';

const pool = new pg.Pool({
  connectionString: appConfig.postgres.connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function connectDb(): Promise<void> {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT NOW()');
    logger.info({ time: res.rows[0].now }, 'PostgreSQL connected');
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

export { pool };
