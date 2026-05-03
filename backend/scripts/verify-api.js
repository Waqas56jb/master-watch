/**
 * Smoke-test HTTP endpoints (local or deployed).
 *
 * Usage:
 *   node scripts/verify-api.js
 *   node scripts/verify-api.js https://your-api.vercel.app
 *
 * Optional login + protected routes (recommended):
 *   set ADMIN_TEST_EMAIL   set ADMIN_TEST_PASSWORD
 *   PowerShell: $env:ADMIN_TEST_EMAIL="a@b.com"; $env:ADMIN_TEST_PASSWORD="..."; node scripts/verify-api.js https://...
 */
const baseRaw = process.argv[2] || process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const base = String(baseRaw).replace(/\/$/, '');

async function http(method, path, { jsonBody, token, headers: extra = {} } = {}) {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(extra);
  if (jsonBody != null) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(url, {
    method,
    headers,
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 800) };
}

function labelPass(name, r) {
  const bits = [r.status, r.ok ? 'OK' : 'FAIL'];
  if (r.json && typeof r.json === 'object') {
    if (r.json.openai) bits.push(`openai:${r.json.openai}`);
    if (r.json.database_ping) bits.push(`db:${r.json.database_ping}`);
    if (r.json.database_error) bits.push(String(r.json.database_error).slice(0, 100));
    if (r.json.error) bits.push(String(r.json.error).slice(0, 120));
  }
  return `${name} → ${bits.join(' | ')}`;
}

async function main() {
  console.error(`Base: ${base}\n`);

  let failed = false;
  const lines = [];

  let r = await http('GET', '/health');
  lines.push(labelPass('GET /health', r));
  if (!r.ok) failed = true;

  r = await http('GET', '/health/db');
  lines.push(labelPass('GET /health/db (Postgres ping)', r));
  if (!r.ok) failed = true;
  if (r.json && r.json.database_ping === 'error') failed = true;

  r = await http('GET', '/health?db=1');
  lines.push(labelPass('GET /health?db=1 (optional; may miss db on Vercel rewrite)', r));
  if (!r.ok) failed = true;

  r = await http('GET', '/api/public/chatbot-theme');
  lines.push(labelPass('GET /api/public/chatbot-theme', r));
  if (!r.ok) failed = true;

  r = await http('OPTIONS', '/api/admin/auth/login', {
    headers: {
      Origin: 'https://example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  lines.push(labelPass('OPTIONS /api/admin/auth/login (CORS preflight)', r));
  if (!(r.status === 204 || r.status === 200)) failed = true;

  r = await http('POST', '/api/admin/auth/login', {
    jsonBody: { email: '___smoke_nonexistent@test.local', password: 'nope' },
  });
  lines.push(labelPass('POST /api/admin/auth/login (expect 401)', r));
  if (r.status !== 401) failed = true;

  const email = process.env.ADMIN_TEST_EMAIL;
  const password = process.env.ADMIN_TEST_PASSWORD;
  let token = null;
  if (email && password) {
    r = await http('POST', '/api/admin/auth/login', { jsonBody: { email, password } });
    lines.push(labelPass('POST /api/admin/auth/login (real creds)', r));
    if (!r.ok || !r.json || !r.json.token) {
      failed = true;
    } else {
      token = r.json.token;
    }
  } else {
    lines.push('POST /api/admin/auth/login (real creds) → SKIP | set ADMIN_TEST_EMAIL + ADMIN_TEST_PASSWORD');
  }

  if (token) {
    r = await http('GET', '/api/admin/auth/me', { token });
    lines.push(labelPass('GET /api/admin/auth/me', r));
    if (!r.ok) failed = true;

    r = await http('GET', '/api/admin/stats', { token });
    lines.push(labelPass('GET /api/admin/stats', r));
    if (!r.ok) failed = true;
  }

  console.log(lines.join('\n'));
  if (failed) {
    console.log(
      `\nHint: If login is not 401/200, open GET ${base}/health/db (read database_error_code and database_hint).\n` +
        `Supabase direct db.*.supabase.co is often IPv6-only — on Vercel use the Transaction pooler DATABASE_URL (port 6543, ?pgbouncer=true) from Supabase → Connect.\n` +
        `  cd backend; npm run check-schema\n` +
        `  cd backend; npm run verify-admin you@email pass\n` +
        `Full admin smoke: set ADMIN_TEST_EMAIL + ADMIN_TEST_PASSWORD then re-run this script.`
    );
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
