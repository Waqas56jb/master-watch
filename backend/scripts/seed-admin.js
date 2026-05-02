/**
 * One-time CLI bootstrap: insert/update admin_users from env.
 * Not used by the API or login at runtime — only this script reads ADMIN_EMAIL / ADMIN_PASSWORD.
 * Usage (from backend folder):
 *   ADMIN_EMAIL=you@mail.com ADMIN_PASSWORD='secret' node scripts/seed-admin.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { query, getPool } = require('../db');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!getPool()) {
    console.error('DATABASE_URL fehlt in .env');
    process.exit(1);
  }
  if (!email || !password) {
    console.error('Setze ADMIN_EMAIL und ADMIN_PASSWORD in .env oder als Umgebungsvariablen.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const r = await query(
    `
    INSERT INTO admin_users (email, password_hash, display_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
    RETURNING id, email
    `,
    [email, hash, 'Admin']
  );
  console.log('Admin OK:', r.rows[0]);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
