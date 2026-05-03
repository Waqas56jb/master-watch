/**
 * Prints DB schema via Supabase RPC `get_schema_info` (create that function in SQL first).
 * Uses only: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from backend/.env
 *
 *   cd backend && npm run supabase:schema
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getSupabaseAdmin } = require('../lib/supabase');

async function main() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env');
    process.exit(1);
  }

  console.log('🚀 Fetching structured schema (RPC get_schema_info)…\n');

  const { data, error } = await supabase.rpc('get_schema_info');

  if (error) {
    console.error('❌ ERROR:', error.message || error);
    process.exit(1);
  }

  if (!data || !Array.isArray(data)) {
    console.error('❌ Unexpected response (expected array from RPC)');
    process.exit(1);
  }

  const grouped = {};
  data.forEach(({ table_name, column_name, data_type }) => {
    if (!grouped[table_name]) grouped[table_name] = [];
    grouped[table_name].push({ column: column_name, type: data_type });
  });

  for (const table of Object.keys(grouped).sort()) {
    console.log(`📦 TABLE: ${table}`);
    grouped[table].forEach((col) => {
      console.log(`   - ${col.column} (${col.type})`);
    });
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
