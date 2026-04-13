#!/usr/bin/env node
/**
 * Set password for user `admin` (production / recovery). Uses same bcrypt rounds as the app.
 *
 *   docker compose -f docker-compose.prod.yml exec backend \
 *     node scripts/reset-admin-password.mjs 'your-new-password'
 *
 * Requires DATABASE_URL (set automatically when using compose exec against the backend service).
 */
import bcrypt from 'bcrypt';
import pg from 'pg';

const SALT_ROUNDS = 12;

const password = process.argv[2]?.trim() || process.env.ADMIN_PASSWORD?.trim();
if (!password) {
  console.error('Usage: node scripts/reset-admin-password.mjs <new-password>');
  console.error('   or: ADMIN_PASSWORD=... node scripts/reset-admin-password.mjs');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const hash = await bcrypt.hash(password, SALT_ROUNDS);
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const r = await client.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE username = 'admin' RETURNING username`,
    [hash],
  );
  if (r.rowCount === 0) {
    console.error('No user with username "admin" found.');
    process.exit(1);
  }
  console.log('Password updated for user: admin');
} finally {
  await client.end();
}
