/**
 * Seed chatbot_prompt_config from backend/seed/*.txt (migrated defaults).
 * Usage: npm run seed-chatbot-prompts
 * Overwrite existing: npm run seed-chatbot-prompts -- --force
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { probeSupabasePoolerRegion, getResolvedConnectionString } = require('../db');

async function main() {
  const force = process.argv.includes('--force');
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

  const seedDir = path.join(__dirname, '..', 'seed');
  const globalPath = path.join(seedDir, 'default-global-instructions.txt');
  const crmPath = path.join(seedDir, 'default-crm-tools-instructions.txt');
  if (!fs.existsSync(globalPath) || !fs.existsSync(crmPath)) {
    console.error('Seed-Texte fehlen (im Repo: backend/seed/default-*.txt).');
    console.error('Erwartet:', globalPath, crmPath);
    process.exit(1);
  }
  const globalInstructions = fs.readFileSync(globalPath, 'utf8');
  const crmToolsInstructions = fs.readFileSync(crmPath, 'utf8');

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
    await client.query(`
      INSERT INTO chatbot_prompt_config (id, global_instructions, crm_tools_instructions)
      VALUES (1, '', '')
      ON CONFLICT (id) DO NOTHING
    `);

    if (!force) {
      const cur = await client.query(
        `SELECT length(trim(coalesce(global_instructions,''))) AS gl, length(trim(coalesce(crm_tools_instructions,''))) AS cl FROM chatbot_prompt_config WHERE id = 1`
      );
      const gl = Number(cur.rows[0]?.gl || 0);
      const cl = Number(cur.rows[0]?.cl || 0);
      if (gl > 200 && cl > 200) {
        console.log('Prompt-Config wirkt bereits befüllt. Zum Überschreiben: npm run seed-chatbot-prompts -- --force');
        return;
      }
    }

    await client.query(
      `UPDATE chatbot_prompt_config SET global_instructions = $1, crm_tools_instructions = $2, updated_at = NOW() WHERE id = 1`,
      [globalInstructions, crmToolsInstructions]
    );
    console.log('OK: chatbot_prompt_config aktualisiert (global', globalInstructions.length, 'Zeichen, CRM', crmToolsInstructions.length, ').');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  if (e && e.code === 'ENOTFOUND') {
    console.error(
      'Hinweis: Transaction-Pooler-URI in DATABASE_URL (Supabase → Connect) oder Region/AWS-Prefix in .env setzen.'
    );
  }
  process.exit(1);
});
