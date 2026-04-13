/**
 * Set the password for user `admin` (local/dev recovery).
 * Usage:
 *   ADMIN_PASSWORD='your-secret' npx tsx scripts/reset-admin-password.ts
 *   npx tsx scripts/reset-admin-password.ts 'your-secret'
 */
import { config as loadDotenv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, '../.env') });

const SALT_ROUNDS = 12;

async function main(): Promise<void> {
  const fromArg = process.argv[2];
  const password = fromArg ?? process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error('Set ADMIN_PASSWORD or pass the new password as the first argument.');
    process.exit(1);
  }

  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://ha_user:ha_dev_password@localhost:5432/home_automation';

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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
