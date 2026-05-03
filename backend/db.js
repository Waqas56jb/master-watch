const dns = require('dns');
const { Pool } = require('pg');

/** Set after successful `probeSupabasePoolerRegion()` so `DATABASE_URL` direct → pooler rewrite uses the right host. */
let resolvedPoolerRegion = null;
/** `aws-0` or `aws-1` — Supabase Connect shows `aws-1-REGION.pooler.supabase.com` for many projects; `aws-0` is still used elsewhere. */
let resolvedPoolerAwsPrefix = null;

// Supabase direct `db.*.supabase.co` often has **no IPv4 (A) record** — only AAAA. Forcing `ipv4first` makes
// `dns.lookup` / pg fail with ENOTFOUND on IPv4-only stacks. Default: verbatim order (IPv6 works when offered).
// Set DATABASE_IPV4_FIRST=true only if your DB host has A records and IPv6 causes timeouts.
try {
  if (process.env.DATABASE_IPV4_FIRST === 'true') {
    dns.setDefaultResultOrder('ipv4first');
  } else {
    dns.setDefaultResultOrder('verbatim');
  }
} catch (_) {
  /* Node < 17 or restricted env */
}

let pool = null;

/**
 * Vercel / dashboard pastes often add BOM, zero-width chars, or newlines inside DATABASE_URL,
 * which breaks DNS (ENOTFOUND) even though the variable is "set".
 */
function normalizeDatabaseUrl(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/[\uFEFF\u200B-\u200D\u202A-\u202E]/g, '');
  s = s.replace(/\r|\n/g, '');
  return s.trim();
}

let supabasePoolerRewriteLogged = false;

const DEFAULT_REGION_CANDIDATES = [
  'ap-northeast-1',
  'eu-central-1',
  'us-east-1',
  'ap-south-1',
  'eu-west-1',
  'us-west-1',
  'ap-southeast-1',
  'eu-west-2',
  'us-west-2',
  'ca-central-1',
  'sa-east-1',
  'ap-northeast-2',
  'eu-north-1',
];

/** Try `aws-1` first — matches current Supabase dashboard “Transaction pooler” strings. */
const DEFAULT_POOLER_AWS_PREFIXES = ['aws-1', 'aws-0'];

function normalizePoolerAwsPrefix(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'aws-0' || s === '0') return 'aws-0';
  if (s === 'aws-1' || s === '1') return 'aws-1';
  return null;
}

function parseSupabaseDirectDbUrl(connectionString) {
  if (!connectionString) return null;
  const normalized = connectionString.replace(/^postgres:\/\//i, 'postgresql://');
  let u;
  try {
    u = new URL(normalized);
  } catch {
    return null;
  }
  const m = /^db\.([^.]+)\.supabase\.co$/i.exec(u.hostname || '');
  if (!m) return null;
  if (String(u.port || '5432') !== '5432') return null;
  return { ref: m[1], password: u.password || '', pathname: u.pathname || '/postgres', userOriginal: u.username };
}

function buildPoolerConnectionString(ref, password, pathname, region, awsPrefix = 'aws-0') {
  const r = String(region).trim().replace(/[^a-z0-9-]/gi, '') || 'eu-central-1';
  const ap = awsPrefix === 'aws-1' ? 'aws-1' : 'aws-0';
  const u = new URL('postgresql://x:y@host:6543/postgres');
  u.hostname = `${ap}-${r}.pooler.supabase.com`;
  u.port = '6543';
  u.username = `postgres.${ref}`;
  u.password = password;
  u.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  u.search = '';
  u.searchParams.set('pgbouncer', 'true');
  return u.toString().replace(/^postgresql:/i, 'postgres:');
}

/**
 * Supabase direct `db.<ref>.supabase.co:5432` is often IPv6-only; rewrite to Transaction pooler unless disabled.
 * Host: `{aws-0|aws-1}-{region}.pooler.supabase.com` from probe / env (dashboard may use aws-1).
 */
function maybeRewriteSupabaseDirectToPooler(connectionString) {
  if (process.env.SUPABASE_AUTO_POOLER === 'false') return connectionString;
  if (!connectionString) return connectionString;
  const parsed = parseSupabaseDirectDbUrl(connectionString);
  if (!parsed) return connectionString;

  const regionRaw =
    resolvedPoolerRegion ||
    (process.env.SUPABASE_POOLER_REGION && String(process.env.SUPABASE_POOLER_REGION).trim()) ||
    'eu-central-1';
  const region = String(regionRaw).replace(/[^a-z0-9-]/gi, '') || 'eu-central-1';

  const awsPrefix =
    resolvedPoolerAwsPrefix ||
    normalizePoolerAwsPrefix(process.env.SUPABASE_POOLER_AWS_PREFIX) ||
    'aws-1';

  const out = buildPoolerConnectionString(parsed.ref, parsed.password, parsed.pathname, region, awsPrefix);
  if (!supabasePoolerRewriteLogged) {
    supabasePoolerRewriteLogged = true;
    console.warn(
      `[db] Supabase direct host rewritten to Transaction pooler (${awsPrefix}-${region}.pooler.supabase.com). ` +
        `Wrong host/region → "Tenant or user not found". Probe tries aws-1 and aws-0; or set SUPABASE_POOLER_REGION / ` +
        `SUPABASE_POOLER_AWS_PREFIX, or SUPABASE_AUTO_POOLER=false and paste the URI from Supabase → Connect.`
    );
  }
  return out;
}

let supabasePoolerProbeSingleton = null;

/**
 * When DATABASE_URL uses direct `db.*:5432`, try common pooler regions until `SELECT 1` succeeds.
 * Sets `resolvedPoolerRegion` for rewrite. Safe to await multiple times (one shared run per process).
 */
async function probeSupabasePoolerRegion() {
  if (supabasePoolerProbeSingleton) return supabasePoolerProbeSingleton;
  supabasePoolerProbeSingleton = (async () => {
    try {
      if (process.env.SUPABASE_AUTO_POOLER === 'false') return;
      const normalized = normalizeDatabaseUrl(process.env.DATABASE_URL || '');
      const parsed = parseSupabaseDirectDbUrl(normalized);
      if (!parsed) return;

      const envFirst = (process.env.SUPABASE_POOLER_REGION || '').trim().replace(/[^a-z0-9-]/gi, '');
      const candidates = [...(envFirst ? [envFirst] : []), ...DEFAULT_REGION_CANDIDATES].filter(
        (r, i, a) => r && a.indexOf(r) === i
      );

      const envAws = normalizePoolerAwsPrefix(process.env.SUPABASE_POOLER_AWS_PREFIX);
      const awsPrefixes = envAws ? [envAws] : DEFAULT_POOLER_AWS_PREFIXES;

      const isProdSsl =
        process.env.NODE_ENV === 'production' || process.env.DATABASE_SSL !== 'false';

      for (const region of candidates) {
        for (const awsp of awsPrefixes) {
          const cs = buildPoolerConnectionString(parsed.ref, parsed.password, parsed.pathname, region, awsp);
          const testPool = new Pool({
            connectionString: cs,
            ssl: isProdSsl ? { rejectUnauthorized: false } : false,
            max: 1,
            idleTimeoutMillis: 5000,
            connectionTimeoutMillis: 8000,
            prepareThreshold: 0,
          });
          try {
            await testPool.query('SELECT 1 AS ok');
            await testPool.end();
            resolvedPoolerRegion = region;
            resolvedPoolerAwsPrefix = awsp;
            console.warn(`[db] Using Supabase pooler: ${awsp}-${region}.pooler.supabase.com`);
            return;
          } catch (e) {
            await testPool.end().catch(() => {});
          }
        }
      }
      console.warn(
        '[db] Could not auto-detect pooler host. Set SUPABASE_POOLER_REGION and optional SUPABASE_POOLER_AWS_PREFIX=aws-1 ' +
          'from Supabase → Connect, or paste the full Transaction pooler URI into DATABASE_URL and set SUPABASE_AUTO_POOLER=false.'
      );
    } catch (e) {
      console.warn('[db] Pooler region probe failed:', e && e.message);
    }
  })();
  return supabasePoolerProbeSingleton;
}

function getResolvedConnectionString() {
  const normalized = normalizeDatabaseUrl(process.env.DATABASE_URL || '');
  if (!normalized) return '';
  return maybeRewriteSupabaseDirectToPooler(normalized);
}

/** Host only (for /health/db); never includes password. Returns null if URL cannot be parsed. */
function getDatabaseHostFromEnv() {
  const s = getResolvedConnectionString();
  if (!s) return null;
  try {
    const u = new URL(s.replace(/^postgres:\/\//i, 'postgresql://'));
    return u.hostname || null;
  } catch {
    return null;
  }
}

function getPool() {
  const connectionString = getResolvedConnectionString();
  if (!connectionString) return null;
  if (!pool) {
    const isProdSsl =
      process.env.NODE_ENV === 'production' || process.env.DATABASE_SSL !== 'false';
    const onVercel = Boolean(process.env.VERCEL);
    const usesSupabasePooler = /pooler\.supabase\.com/i.test(connectionString);
    pool = new Pool({
      connectionString,
      ssl: isProdSsl ? { rejectUnauthorized: false } : false,
      max: onVercel ? 1 : 10,
      idleTimeoutMillis: onVercel ? 10_000 : 30_000,
      // Cold start + DNS + TLS to Supabase can exceed 8s on serverless.
      connectionTimeoutMillis: onVercel ? 20000 : 8000,
      ...(onVercel || usesSupabasePooler ? { prepareThreshold: 0 } : {}),
    });
  }
  return pool;
}

async function query(text, params = []) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL not configured');
  return p.query(text, params);
}

async function fetchActiveKnowledgeForPrompt() {
  const p = getPool();
  if (!p) return '';
  const r = await p.query(
    `
    SELECT title, category, content, priority
    FROM knowledge_entries
    WHERE is_active = TRUE
    ORDER BY priority DESC NULLS LAST, updated_at DESC
    `
  );
  if (!r.rows.length) return '';
  const blocks = r.rows.map((row, i) => {
    const cat = row.category ? `[${row.category}] ` : '';
    return `### ${i + 1}. ${cat}${row.title}\n${row.content.trim()}`;
  });
  return (
    '\n\n== ERWEITERTES WISSEN AUS ADMIN-PANEL (Datenbank) — gültige Zusatzinfos ==\n' +
    'Die folgenden Punkte wurden vom Shop-Betreiber ergänzt. Kombiniere sie konsistent mit dem Haupt-Wissensblock oben.\n\n' +
    blocks.join('\n\n---\n\n')
  );
}

async function getDashboardStats() {
  const p = getPool();
  if (!p) return null;

  const [
    totalKb,
    activeKb,
    cats,
    timeline,
    chats,
    bookingsPending,
    bookingsTotal,
    inqOpen,
    inqResolved,
    inqTotal,
    feedbackAvg,
    feedbackTotal,
    submissionTimeline,
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM knowledge_entries`),
    query(`SELECT COUNT(*)::int AS n FROM knowledge_entries WHERE is_active = TRUE`),
    query(`
      SELECT category AS name, COUNT(*)::int AS count
      FROM knowledge_entries
      GROUP BY category
      ORDER BY count DESC
    `),
    query(`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM knowledge_entries
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `),
    query(`
      SELECT to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM chat_events
      WHERE occurred_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `),
    query(`SELECT COUNT(*)::int AS n FROM booking_requests WHERE status = 'pending'`),
    query(`SELECT COUNT(*)::int AS n FROM booking_requests`),
    query(`SELECT COUNT(*)::int AS n FROM inquiries WHERE status = 'open'`),
    query(`SELECT COUNT(*)::int AS n FROM inquiries WHERE status = 'resolved'`),
    query(`SELECT COUNT(*)::int AS n FROM inquiries`),
    query(`SELECT COALESCE(AVG(rating)::numeric(4,2), 0)::float AS avg FROM feedback_entries`),
    query(`SELECT COUNT(*)::int AS n FROM feedback_entries`),
    query(`
      SELECT day, SUM(c)::int AS count FROM (
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::numeric AS c
        FROM booking_requests WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY 1
        UNION ALL
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::numeric AS c
        FROM inquiries WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY 1
        UNION ALL
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::numeric AS c
        FROM feedback_entries WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY 1
      ) x GROUP BY day ORDER BY day ASC
    `),
  ]);

  return {
    knowledgeTotal: totalKb.rows[0]?.n ?? 0,
    knowledgeActive: activeKb.rows[0]?.n ?? 0,
    categories: cats.rows,
    knowledgeTimeline: timeline.rows,
    chatTimeline: chats.rows,
    bookingsPending: bookingsPending.rows[0]?.n ?? 0,
    bookingsTotal: bookingsTotal.rows[0]?.n ?? 0,
    inquiriesOpen: inqOpen.rows[0]?.n ?? 0,
    inquiriesResolved: inqResolved.rows[0]?.n ?? 0,
    inquiriesTotal: inqTotal.rows[0]?.n ?? 0,
    feedbackAvg: feedbackAvg.rows[0]?.avg ? Number(feedbackAvg.rows[0].avg) : null,
    feedbackTotal: feedbackTotal.rows[0]?.n ?? 0,
    submissionTimeline: submissionTimeline.rows,
  };
}

const DEFAULT_CHATBOT_THEME = {
  bg: '#0a0a0a',
  surface: '#111111',
  card: '#181818',
  border: '#2a2a2a',
  accent: '#22c55e',
  text: '#f5f5f5',
  textDim: '#888888',
  userBubble: '#22c55e',
  botBubble: '#1e1e1e',
};

const CHATBOT_THEME_LABELS = {
  bg: 'Seitenhintergrund (Bereich rund um das Widget)',
  surface: 'Chat-Karte / Widget',
  card: 'Header-Leiste',
  border: 'Rahmen & Linien',
  accent: 'Akzent (Logo-Tile, Status, Senden)',
  text: 'Haupttext',
  textDim: 'Sekundärtext / Zeitstempel',
  userBubble: 'Nutzer-Nachrichten',
  botBubble: 'Bot-Nachrichten',
};

async function ensureChatbotThemeRow() {
  if (!getPool()) return;
  await query(
    `INSERT INTO chatbot_theme (id, theme, updated_at) VALUES (1, $1::jsonb, NOW()) ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_CHATBOT_THEME)]
  );
}

async function getChatbotTheme() {
  if (!getPool()) return DEFAULT_CHATBOT_THEME;
  await ensureChatbotThemeRow();
  const r = await query(`SELECT theme FROM chatbot_theme WHERE id = 1`);
  const t = r.rows[0]?.theme;
  return { ...DEFAULT_CHATBOT_THEME, ...(typeof t === 'object' && t ? t : {}) };
}

async function setChatbotTheme(themeObj) {
  const merged = { ...DEFAULT_CHATBOT_THEME, ...(themeObj || {}) };
  await ensureChatbotThemeRow();
  await query(`UPDATE chatbot_theme SET theme = $1::jsonb, updated_at = NOW() WHERE id = 1`, [
    JSON.stringify(merged),
  ]);
  return merged;
}

async function insertBooking(opts) {
  const r = await query(
    `
    INSERT INTO booking_requests (
      watch_model, quality_tier, quantity, customer_name, email, phone,
      shipping_address, city, postal_code, country, notes, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending')
    RETURNING id
    `,
    [
      opts.watch_model || '–',
      opts.quality_tier || null,
      Math.min(99, Math.max(1, Number(opts.quantity) || 1)),
      opts.customer_name || null,
      opts.email || null,
      opts.phone || null,
      opts.shipping_address || null,
      opts.city || null,
      opts.postal_code || null,
      opts.country || null,
      opts.notes || null,
    ]
  );
  return r.rows[0].id;
}

async function insertInquiry(opts) {
  const r = await query(
    `
    INSERT INTO inquiries (
      inquiry_type, subject, message, customer_name, email, phone,
      address_line, city, postal_code, country, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open')
    RETURNING id
    `,
    [
      opts.inquiry_type === 'support' ? 'support' : opts.inquiry_type === 'lead' ? 'lead' : 'general',
      opts.subject || null,
      opts.message || '–',
      opts.customer_name || null,
      opts.email || null,
      opts.phone || null,
      opts.address_line || null,
      opts.city || null,
      opts.postal_code || null,
      opts.country || null,
    ]
  );
  return r.rows[0].id;
}

async function insertFeedback(opts) {
  const rating = Number(opts.rating);
  const r = await query(
    `INSERT INTO feedback_entries (rating, comment, suggestion, email) VALUES ($1,$2,$3,$4) RETURNING id`,
    [Math.min(5, Math.max(1, rating)), opts.comment || null, opts.suggestion || null, opts.email || null]
  );
  return r.rows[0].id;
}

module.exports = {
  getPool,
  getDatabaseHostFromEnv,
  probeSupabasePoolerRegion,
  query,
  fetchActiveKnowledgeForPrompt,
  getDashboardStats,
  getChatbotTheme,
  setChatbotTheme,
  DEFAULT_CHATBOT_THEME,
  CHATBOT_THEME_LABELS,
  insertBooking,
  insertInquiry,
  insertFeedback,
};
