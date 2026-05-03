const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getJwtSecret, JWT_EXPIRES_DEFAULT } = require('../lib/jwtSecret');
const { query, getPool, getDashboardStats, getChatbotTheme, setChatbotTheme, DEFAULT_CHATBOT_THEME, CHATBOT_THEME_LABELS } = require('../db');

const router = express.Router();

/** Admin session JWT (7d). Signing key: `JWT_SECRET` if set, else SHA-256 of `SUPABASE_SERVICE_ROLE_KEY`. */
function jwtSign(payload) {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('JWT: set JWT_SECRET (≥16 chars) or SUPABASE_SERVICE_ROLE_KEY');
  }
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_DEFAULT });
}

/** Pg / Node network errors may be on `err`, `err.cause`, or `AggregateError.errors[]`. */
function primaryDbError(err) {
  if (!err) return err;
  if (err.code) return err;
  if (err.cause && err.cause.code) return err.cause;
  if (Array.isArray(err.errors)) {
    for (const e of err.errors) {
      if (e && e.code) return e;
    }
  }
  return err;
}

function loginErrorFromDatabase(err) {
  const e = primaryDbError(err);
  const c = e && e.code;
  const msg = e && e.message;
  if (c === '42P01' || (typeof msg === 'string' && /relation .* does not exist/i.test(msg))) {
    return 'Datenbank-Schema fehlt (z. B. admin_users). Lokal: npm run db:apply';
  }
  if (c === '42703' || (typeof msg === 'string' && /column .* does not exist/i.test(msg))) {
    return 'Datenbank-Schema: Spalte fehlt (admin_users mit backend/schema.sql abgleichen).';
  }
  if (c === '28P01') {
    return 'Datenbank: Authentifizierung fehlgeschlagen (Passwort in DATABASE_URL prüfen).';
  }
  if (c === 'ENOTFOUND' || c === 'ECONNREFUSED' || c === 'ETIMEDOUT') {
    return 'Datenbank-Host nicht erreichbar (DATABASE_URL / Firewall prüfen).';
  }
  if (c === 'SELF_SIGNED_CERT_IN_CHAIN' || c === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    return 'Datenbank-TLS-Fehler (SSL-Parameter prüfen).';
  }
  if (typeof msg === 'string' && /Tenant or user not found/i.test(msg)) {
    return (
      'Supabase Pooler: falscher Host (aws-0 vs aws-1) oder Region — in Connect die Transaction-Pooler-URI kopieren, ' +
      'oder SUPABASE_POOLER_REGION + SUPABASE_POOLER_AWS_PREFIX=aws-1 setzen (z. B. ap-northeast-1).'
    );
  }
  if (typeof msg === 'string' && /prepared statement.*already exists/i.test(msg)) {
    return 'Pooler/Prepared Statements: Port 6543 mit ?pgbouncer=true oder direkten Port 5432 nutzen.';
  }
  if (typeof msg === 'string' && /SSL|TLS|certificate/i.test(msg) && c !== '28P01') {
    return 'Datenbank-TLS/SSL-Fehler (Supabase: direkte Verbindung, sslmode=require).';
  }
  if (
    typeof msg === 'string' &&
    (/timeout exceeded when trying to connect/i.test(msg) ||
      /Connection terminated due to connection timeout/i.test(msg))
  ) {
    return 'Datenbank: Verbindungs-Timeout (Host/Port/Firewall oder Supabase-URI prüfen).';
  }
  if (typeof msg === 'string' && /Client has encountered a connection error|Connection terminated unexpectedly/i.test(msg)) {
    return 'Datenbank-Verbindung abgebrochen (Pooler/Netzwerk — URI und Supabase-Status prüfen).';
  }
  return null;
}

function authMiddleware(req, res, next) {
  try {
    const h = req.headers.authorization;
    const token = h && h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nicht angemeldet' });
    const secret = getJwtSecret();
    if (!secret) {
      return res.status(500).json({ error: 'Server-Konfiguration: SUPABASE_SERVICE_ROLE_KEY oder JWT_SECRET setzen' });
    }
    const decoded = jwt.verify(token, secret);
    req.admin = { id: decoded.sub, email: decoded.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Session ungültig oder abgelaufen' });
  }
}

router.post('/auth/login', async (req, res) => {
  try {
    if (!getPool()) return res.status(503).json({ error: 'Datenbank nicht konfiguriert (DATABASE_URL)' });
    if (!getJwtSecret()) {
      return res.status(500).json({
        error: 'Server-Konfiguration: SUPABASE_SERVICE_ROLE_KEY (für Admin-Token) oder JWT_SECRET setzen',
      });
    }
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    if (emailNorm.length > 320) {
      return res.status(400).json({ error: 'E-Mail zu lang' });
    }
    const r = await query(
      `SELECT id, email, password_hash, display_name FROM admin_users WHERE email = $1 AND is_active = TRUE`,
      [emailNorm]
    );
    const user = r.rows[0];
    let passwordOk = false;
    if (user?.password_hash) {
      const stored = user.password_hash;
      const hashStr = Buffer.isBuffer(stored) ? stored.toString('utf8') : String(stored);
      try {
        passwordOk = await bcrypt.compare(String(password), hashStr);
      } catch {
        passwordOk = false;
      }
    }
    if (!passwordOk) {
      return res.status(401).json({ error: 'Ungültige Zugangsdaten' });
    }
    const token = jwtSign({ sub: String(user.id), email: user.email });
    return res.json({
      token,
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });
  } catch (e) {
    console.error('admin login', e);
    const fromDb = loginErrorFromDatabase(e);
    const debug = process.env.API_DEBUG === '1';
    return res.status(500).json({
      error: fromDb || 'Anmeldung fehlgeschlagen',
      ...(debug && e && { detail: e.message, code: e.code }),
    });
  }
});

router.get('/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: req.admin });
});

/** Logged-in: change password (know current password). */
router.put('/auth/password', authMiddleware, async (req, res) => {
  try {
    if (!getPool()) return res.status(503).json({ error: 'Datenbank nicht konfiguriert (DATABASE_URL)' });
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Aktuelles und neues Passwort erforderlich' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Neues Passwort: mindestens 8 Zeichen' });
    }
    const r = await query(
      `SELECT password_hash FROM admin_users WHERE id = $1::uuid AND is_active = TRUE`,
      [req.admin.id]
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    if (!(await bcrypt.compare(String(currentPassword), row.password_hash))) {
      return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
    }
    const hash = await bcrypt.hash(String(newPassword), 12);
    await query(`UPDATE admin_users SET password_hash = $2, updated_at = NOW() WHERE id = $1::uuid`, [
      req.admin.id,
      hash,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('admin password change', e);
    res.status(500).json({ error: 'Passwort konnte nicht geändert werden' });
  }
});

/** Step 1 of reset: confirm active admin email exists; return short-lived token for step 2. */
router.post('/auth/verify-reset-email', async (req, res) => {
  try {
    if (!getPool()) return res.status(503).json({ error: 'Datenbank nicht konfiguriert (DATABASE_URL)' });
    const { email } = req.body || {};
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'E-Mail erforderlich' });
    }
    const em = String(email).trim().toLowerCase();
    const r = await query(`SELECT id FROM admin_users WHERE email = $1 AND is_active = TRUE`, [em]);
    if (!r.rows[0]) {
      return res.status(404).json({ error: 'Kein Admin-Konto mit dieser E-Mail.' });
    }
    const secret = getJwtSecret();
    if (!secret) {
      return res.status(500).json({ error: 'Server-Konfiguration: SUPABASE_SERVICE_ROLE_KEY oder JWT_SECRET setzen' });
    }
    const resetToken = jwt.sign({ email: em, typ: 'admin_pwreset' }, secret, { expiresIn: '15m' });
    return res.json({ ok: true, email: em, resetToken });
  } catch (e) {
    console.error('admin verify-reset-email', e);
    res.status(500).json({ error: 'E-Mail konnte nicht geprüft werden' });
  }
});

/**
 * Step 2 of reset: new password; requires resetToken from verify-reset-email (same email, ≤15 min).
 */
router.post('/auth/reset-password', async (req, res) => {
  try {
    if (!getPool()) return res.status(503).json({ error: 'Datenbank nicht konfiguriert (DATABASE_URL)' });
    const { email, newPassword, resetToken } = req.body || {};
    if (!email || !newPassword || !resetToken) {
      return res.status(400).json({ error: 'E-Mail, neues Passwort und Bestätigungstoken erforderlich' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Neues Passwort: mindestens 8 Zeichen' });
    }
    const secret = getJwtSecret();
    if (!secret) {
      return res.status(500).json({ error: 'Server-Konfiguration: SUPABASE_SERVICE_ROLE_KEY oder JWT_SECRET setzen' });
    }
    let payload;
    try {
      payload = jwt.verify(String(resetToken), secret);
    } catch {
      return res.status(401).json({
        error: 'Bestätigung abgelaufen oder ungültig. Bitte erneut mit Ihrer E-Mail beginnen.',
      });
    }
    const em = String(email).trim().toLowerCase();
    if (payload.typ !== 'admin_pwreset' || String(payload.email).toLowerCase() !== em) {
      return res.status(401).json({ error: 'Ungültiger Reset-Vorgang.' });
    }
    const hash = await bcrypt.hash(String(newPassword), 12);
    const up = await query(
      `UPDATE admin_users SET password_hash = $2, updated_at = NOW() WHERE email = $1 AND is_active = TRUE RETURNING id`,
      [em, hash]
    );
    if (!up.rows[0]) {
      return res.status(404).json({ error: 'Kein aktiver Benutzer mit dieser E-Mail' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('admin reset password', e);
    res.status(500).json({ error: 'Passwort-Reset fehlgeschlagen' });
  }
});

router.get('/stats', authMiddleware, async (_req, res) => {
  try {
    if (!getPool()) {
      return res.json({
        offline: true,
        knowledgeTotal: 0,
        knowledgeActive: 0,
        categories: [],
        knowledgeTimeline: [],
        chatTimeline: [],
        bookingsPending: 0,
        bookingsTotal: 0,
        inquiriesOpen: 0,
        inquiriesResolved: 0,
        inquiriesTotal: 0,
        feedbackAvg: null,
        feedbackTotal: 0,
        submissionTimeline: [],
      });
    }
    const stats = await getDashboardStats();
    res.json({ offline: false, ...stats });
  } catch (e) {
    console.error('admin stats', e);
    res.status(500).json({ error: 'Statistik nicht verfügbar' });
  }
});

router.get('/knowledge', authMiddleware, async (_req, res) => {
  try {
    const r = await query(
      `
      SELECT id, title, slug, category, priority, is_active, created_at, updated_at,
             LEFT(content, 200) AS excerpt
      FROM knowledge_entries
      ORDER BY priority DESC, updated_at DESC
      `
    );
    res.json({ items: r.rows });
  } catch (e) {
    console.error('knowledge list', e);
    res.status(500).json({ error: 'Liste nicht ladbar' });
  }
});

router.get('/knowledge/:id', authMiddleware, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM knowledge_entries WHERE id = $1`, [req.params.id]);
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(row);
  } catch (e) {
    console.error('knowledge get', e);
    res.status(500).json({ error: 'Nicht ladbar' });
  }
});

router.post('/knowledge', authMiddleware, async (req, res) => {
  try {
    const { title, content, category = 'general', slug = null, priority = 0, is_active = true } = req.body || {};
    if (!title || !content) return res.status(400).json({ error: 'title und content sind Pflicht' });
    const r = await query(
      `
      INSERT INTO knowledge_entries (title, slug, category, content, priority, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [String(title).trim(), slug ? String(slug).trim() : null, String(category).trim(), String(content).trim(), Number(priority) || 0, Boolean(is_active)]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error('knowledge create', e);
    res.status(500).json({ error: 'Speichern fehlgeschlagen' });
  }
});

router.put('/knowledge/:id', authMiddleware, async (req, res) => {
  try {
    const b = req.body || {};
    const cur = await query(`SELECT * FROM knowledge_entries WHERE id = $1`, [req.params.id]);
    const row = cur.rows[0];
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' });

    const title = b.title !== undefined ? String(b.title).trim() : row.title;
    const content = b.content !== undefined ? String(b.content).trim() : row.content;
    const category = b.category !== undefined ? String(b.category).trim() : row.category;
    const slug = b.slug !== undefined ? (b.slug ? String(b.slug).trim() : null) : row.slug;
    const priority = b.priority !== undefined ? Number(b.priority) || 0 : row.priority;
    const is_active = b.is_active !== undefined ? Boolean(b.is_active) : row.is_active;

    const r = await query(
      `
      UPDATE knowledge_entries SET
        title = $2, slug = $3, category = $4, content = $5, priority = $6, is_active = $7, updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [req.params.id, title, slug, category, content, priority, is_active]
    );
    res.json(r.rows[0]);
  } catch (e) {
    console.error('knowledge update', e);
    res.status(500).json({ error: 'Update fehlgeschlagen' });
  }
});

router.patch('/knowledge/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const r = await query(
      `UPDATE knowledge_entries SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('knowledge toggle', e);
    res.status(500).json({ error: 'Toggle fehlgeschlagen' });
  }
});

router.delete('/knowledge/:id', authMiddleware, async (req, res) => {
  try {
    const r = await query(`DELETE FROM knowledge_entries WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json({ ok: true });
  } catch (e) {
    console.error('knowledge delete', e);
    res.status(500).json({ error: 'Löschen fehlgeschlagen' });
  }
});

/* ── CRM: Inquiries ── */
router.get('/inquiries', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const status = (req.query.status || '').toString().trim();
    const inquiryType = (req.query.type || '').toString().trim();
    const params = [];
    let where = `WHERE 1=1`;
    if (status && ['open', 'resolved', 'archived'].includes(status)) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    if (inquiryType && ['general', 'support', 'lead'].includes(inquiryType)) {
      params.push(inquiryType);
      where += ` AND inquiry_type = $${params.length}`;
    }
    if (q) {
      const base = params.length;
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
      where += ` AND (
        COALESCE(subject,'') ILIKE $${base + 1} OR COALESCE(message,'') ILIKE $${base + 2} OR COALESCE(customer_name,'') ILIKE $${base + 3}
        OR COALESCE(email,'') ILIKE $${base + 4} OR COALESCE(phone,'') ILIKE $${base + 5}
      )`;
    }
    const r = await query(
      `
      SELECT * FROM inquiries
      ${where}
      ORDER BY created_at DESC
      LIMIT 500
      `,
      params
    );
    res.json({ items: r.rows });
  } catch (e) {
    console.error('inquiries list', e);
    res.status(500).json({ error: 'Liste nicht ladbar' });
  }
});

router.patch('/inquiries/:id', authMiddleware, async (req, res) => {
  try {
    const { status, admin_notes } = req.body || {};
    if (status && !['open', 'resolved', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'status ungültig' });
    }
    const r = await query(
      `
      UPDATE inquiries SET
        status = COALESCE($2::varchar, status),
        admin_notes = COALESCE($3::text, admin_notes),
        updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *
      `,
      [req.params.id, status ?? null, admin_notes !== undefined ? String(admin_notes) : null]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('inquiry patch', e);
    res.status(500).json({ error: 'Update fehlgeschlagen' });
  }
});

/* ── CRM: Bookings ── */
router.get('/bookings', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const status = (req.query.status || '').toString().trim();
    const params = [];
    let where = `WHERE 1=1`;
    if (status && ['pending', 'confirmed', 'cancelled', 'done'].includes(status)) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    if (q) {
      const base = params.length;
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
      where += ` AND (
        COALESCE(watch_model,'') ILIKE $${base + 1} OR COALESCE(customer_name,'') ILIKE $${base + 2}
        OR COALESCE(email,'') ILIKE $${base + 3} OR COALESCE(phone,'') ILIKE $${base + 4} OR COALESCE(notes,'') ILIKE $${base + 5}
      )`;
    }
    const r = await query(
      `
      SELECT * FROM booking_requests
      ${where}
      ORDER BY created_at DESC
      LIMIT 500
      `,
      params
    );
    res.json({ items: r.rows });
  } catch (e) {
    console.error('bookings list', e);
    res.status(500).json({ error: 'Liste nicht ladbar' });
  }
});

router.patch('/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const { status, notes } = req.body || {};
    if (status && !['pending', 'confirmed', 'cancelled', 'done'].includes(status)) {
      return res.status(400).json({ error: 'status ungültig' });
    }
    const r = await query(
      `
      UPDATE booking_requests SET
        status = COALESCE($2::varchar, status),
        notes = COALESCE($3::text, notes),
        updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *
      `,
      [req.params.id, status ?? null, notes !== undefined ? String(notes) : null]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('booking patch', e);
    res.status(500).json({ error: 'Update fehlgeschlagen' });
  }
});

/* ── CRM: Chat widget usage (chat_events — one row per /chat user message batch) ── */
router.get('/chat-events', authMiddleware, async (req, res) => {
  try {
    if (!getPool()) return res.status(503).json({ error: 'Datenbank nicht konfiguriert (DATABASE_URL)' });
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    const c = await query(`SELECT COUNT(*)::int AS n FROM chat_events`);
    const total = c.rows[0]?.n ?? 0;
    const r = await query(
      `SELECT id, occurred_at, user_message_chars FROM chat_events ORDER BY occurred_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ items: r.rows, total, limit, offset });
  } catch (e) {
    console.error('chat-events', e);
    res.status(500).json({ error: 'Chat-Aktivität nicht ladbar' });
  }
});

/* ── CRM: Feedback ── */
router.get('/feedback', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const rating = req.query.rating;
    const params = [];
    let where = `WHERE 1=1`;
    if (rating && String(rating).match(/^[1-5]$/)) {
      params.push(Number(rating));
      where += ` AND rating = $${params.length}`;
    }
    if (q) {
      const base = params.length;
      const like = `%${q}%`;
      params.push(like, like, like);
      where += ` AND (COALESCE(comment,'') ILIKE $${base + 1} OR COALESCE(suggestion,'') ILIKE $${base + 2} OR COALESCE(email,'') ILIKE $${base + 3})`;
    }
    const r = await query(
      `SELECT * FROM feedback_entries ${where} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    res.json({ items: r.rows });
  } catch (e) {
    console.error('feedback list', e);
    res.status(500).json({ error: 'Liste nicht ladbar' });
  }
});

router.delete('/feedback/:id', authMiddleware, async (req, res) => {
  try {
    const r = await query(`DELETE FROM feedback_entries WHERE id = $1::uuid RETURNING id`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json({ ok: true });
  } catch (e) {
    console.error('feedback delete', e);
    res.status(500).json({ error: 'Löschen fehlgeschlagen' });
  }
});

/* ── CRM: Contacts (aggregated emails) ── */
router.get('/contacts', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const params = [];
    let having = '';
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      having = `HAVING lower(trim(email)) LIKE $1`;
    }
    const sql = `
      SELECT lower(trim(email)) AS email,
             COUNT(*)::int AS touchpoints,
             MAX(last_at) AS last_seen
      FROM (
        SELECT email, created_at AS last_at FROM booking_requests WHERE email IS NOT NULL AND trim(email) <> ''
        UNION ALL
        SELECT email, created_at FROM inquiries WHERE email IS NOT NULL AND trim(email) <> ''
        UNION ALL
        SELECT email, created_at FROM feedback_entries WHERE email IS NOT NULL AND trim(email) <> ''
      ) AS u(email, last_at)
      GROUP BY 1 ${having}
      ORDER BY touchpoints DESC, last_seen DESC
      LIMIT 400
    `;
    const r = await query(sql, params);
    res.json({ items: r.rows });
  } catch (e) {
    console.error('contacts', e);
    res.status(500).json({ error: 'Kontakte nicht ladbar' });
  }
});

/* ── Chatbot Theme (admin) ── */
router.get('/theme', authMiddleware, async (_req, res) => {
  try {
    const theme = getPool() ? await getChatbotTheme() : { ...DEFAULT_CHATBOT_THEME };
    res.json({
      theme,
      labels: CHATBOT_THEME_LABELS,
      components: CHATBOT_THEME_LABELS,
      presets: [
        { name: 'Klassisch Dunkel · Grün', theme: { ...DEFAULT_CHATBOT_THEME } },
        {
          name: 'Midnight Indigo',
          theme: {
            ...DEFAULT_CHATBOT_THEME,
            accent: '#818cf8',
            userBubble: '#818cf8',
            surface: '#0e1020',
            card: '#14182d',
          },
        },
        {
          name: 'Mono Light',
          theme: {
            bg: '#f4f6fb',
            surface: '#ffffff',
            card: '#eef1f8',
            border: '#dfe3ea',
            accent: '#0f172a',
            text: '#0f172a',
            textDim: '#475569',
            userBubble: '#0f172a',
            botBubble: '#e9eef7',
          },
        },
        {
          name: 'Lux Gold',
          theme: {
            ...DEFAULT_CHATBOT_THEME,
            accent: '#f59e0b',
            userBubble: '#d97706',
            border: '#3f3a2f',
          },
        },
      ],
    });
  } catch (e) {
    console.error('theme admin get', e);
    res.status(500).json({ error: 'Theme nicht ladbar' });
  }
});

router.put('/theme', authMiddleware, async (req, res) => {
  try {
    if (!getPool()) return res.status(503).json({ error: 'Datenbank erforderlich' });
    const body = req.body?.theme || req.body || {};
    const merged = await setChatbotTheme(body);
    res.json({
      theme: merged,
      labels: CHATBOT_THEME_LABELS,
      components: CHATBOT_THEME_LABELS,
    });
  } catch (e) {
    console.error('theme admin put', e);
    res.status(500).json({ error: 'Theme nicht gespeichert' });
  }
});

module.exports = { router, authMiddleware };
