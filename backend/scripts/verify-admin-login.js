/**
 * One-off: verify admin row + bcrypt for a password.
 * Usage: node scripts/verify-admin-login.js [email] [password]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { query, getPool } = require('../db');

const email = (process.argv[2] || 'wasifjaved@gmail.com').trim().toLowerCase();
const password = process.argv[3] || 'wasifjaved@123!';

async function main() {
  if (!getPool()) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }
  const r = await query(
    'SELECT email, password_hash, is_active FROM admin_users WHERE email = $1',
    [email]
  );
  const u = r.rows[0];
  if (!u) {
    console.log(JSON.stringify({ ok: false, reason: 'no_user_row', email }, null, 2));
    process.exit(1);
  }
  const passwordMatches = await bcrypt.compare(password, u.password_hash);
  console.log(
    JSON.stringify(
      {
        ok: passwordMatches && u.is_active,
        email: u.email,
        is_active: u.is_active,
        passwordMatches,
      },
      null,
      2
    )
  );
  process.exit(passwordMatches && u.is_active ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
