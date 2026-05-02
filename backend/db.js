const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    const isProdSsl =
      process.env.NODE_ENV === 'production' || process.env.DATABASE_SSL !== 'false';
    const onVercel = Boolean(process.env.VERCEL);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isProdSsl ? { rejectUnauthorized: false } : false,
      max: onVercel ? 1 : 10,
      idleTimeoutMillis: onVercel ? 10_000 : 30_000,
      connectionTimeoutMillis: 8000,
      ...(onVercel ? { prepareThreshold: 0 } : {}),
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
