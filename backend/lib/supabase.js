const { createClient } = require('@supabase/supabase-js');

let _admin = null;

/**
 * Same pattern as your standalone script: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`.
 * Service role bypasses RLS — server only, never expose to browsers.
 *
 * The Express app still uses `pg` + `DATABASE_URL` for SQL (admin routes, stats, bcrypt login, etc.)
 * because PostgREST cannot run arbitrary SQL. Use this client for REST/RPC (e.g. `get_schema_info`).
 */
function getSupabaseAdmin() {
  const url = typeof process.env.SUPABASE_URL === 'string' ? process.env.SUPABASE_URL.trim() : '';
  const key =
    typeof process.env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? process.env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  if (!url || !key) return null;
  if (!_admin) {
    _admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

module.exports = { getSupabaseAdmin };
