/**
 * Apply backend/schema.sql to the database pointed at by DATABASE_URL.
 * Usage (from backend folder): npm run db:apply
 *
 * Prefer this or Supabase SQL Editor over partial manual runs —
 * login and seed-admin need tables like admin_users.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { probeSupabasePoolerRegion, getResolvedConnectionString } = require('../db');

async function main() {
  if (!process.env.DATABASE_URL || !String(process.env.DATABASE_URL).trim()) {
    console.error('DATABASE_URL fehlt in .env');
    process.exit(1);
  }

  await probeSupabasePoolerRegion();
  const url = getResolvedConnectionString();
  if (!url) {
    console.error('DATABASE_URL fehlt oder ungültig');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const ssl =
    process.env.NODE_ENV === 'production' || process.env.DATABASE_SSL !== 'false'
      ? { rejectUnauthorized: false }
      : url.includes('supabase.co') || url.includes('neon.tech')
        ? { rejectUnauthorized: false }
        : false;

  const usesPooler = /pooler\.supabase\.com/i.test(url);
  const client = new Client({
    connectionString: url,
    ssl,
    connectionTimeoutMillis: 20000,
    ...(usesPooler ? { prepareThreshold: 0 } : {}),
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log('Schema OK:', schemaPath);
  } finally {
    await client.end();
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  console.error('\nTips: Enable extension pgcrypto in Supabase → Database → Extensions if needed.');
  console.error('Or paste schema.sql manually in SQL Editor.');
  if (e && e.code === 'ENOTFOUND') {
    console.error(
      '\nENOTFOUND auf db.*.supabase.co: Dieses Skript nutzt jetzt dieselbe Pooler-Umschreibung wie der Server. ' +
        'Wenn es weiter fehlt: In Supabase → Connect die **Transaction pooler**-URI (Port 6543, ?pgbouncer=true) in DATABASE_URL eintragen ' +
        'oder SUPABASE_POOLER_REGION + SUPABASE_POOLER_AWS_PREFIX=aws-1 setzen.'
    );
  }
  process.exit(1);
});
