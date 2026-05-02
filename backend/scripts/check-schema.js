/**
 * Verify Postgres reachability and admin_users (no HTTP server).
 * Usage from repo root or backend/:  node scripts/check-schema.js
 * Requires DATABASE_URL in backend/.env or env.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query, getPool } = require('../db');

async function main() {
  if (!getPool()) {
    console.error('FAIL: DATABASE_URL not set');
    process.exit(1);
  }
  try {
    await query('SELECT 1 AS ok');
    console.log('OK: SELECT 1');
  } catch (e) {
    console.error('FAIL: cannot run SELECT 1 —', e.code || '', e.message);
    process.exit(1);
  }
  try {
    const r = await query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'admin_users'
      ) AS exists`
    );
    const exists = r.rows[0]?.exists;
    if (!exists) {
      console.error('FAIL: table public.admin_users missing — run: npm run db:apply (see schema.sql)');
      process.exit(1);
    }
    console.log('OK: table admin_users exists');
  } catch (e) {
    console.error('FAIL: information_schema check —', e.code || '', e.message);
    process.exit(1);
  }
  try {
    const c = await query('SELECT COUNT(*)::int AS n FROM admin_users');
    const n = c.rows[0]?.n ?? 0;
    console.log(`OK: admin_users row count = ${n}`);
    if (n === 0) {
      console.error('WARN: no admin rows — run: npm run seed-admin');
      process.exit(2);
    }
  } catch (e) {
    console.error('FAIL: COUNT admin_users —', e.code || '', e.message);
    process.exit(1);
  }
  console.log('Schema check passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
