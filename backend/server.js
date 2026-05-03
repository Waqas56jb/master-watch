require('dotenv').config();
const fs = require('fs');
const express = require('express');
const path = require('path');
const cors = require('cors');
const OpenAI = require('openai');
const { query, getPool, getDatabaseHostFromEnv, probeSupabasePoolerRegion } = require('./db');
const { router: adminRouter } = require('./routes/admin');
const { router: publicRouter } = require('./routes/publicApi');
const { runAssistantChat } = require('./lib/chatAssistant');
const { buildFullSystemPrompt, fetchCrmToolsInstructions } = require('./lib/chatbotPrompt');

/** Safe hints for /health/db when Postgres ping fails (no secrets). */
function dbPingHint(err, dbHost) {
  const code = err && err.code;
  if (code === 'ENOTFOUND') {
    const h = typeof dbHost === 'string' ? dbHost : '';
    const supabaseDirect =
      h.startsWith('db.') && h.endsWith('.supabase.co') && !h.includes('pooler');
    if (supabaseDirect) {
      return (
        'Supabase direct host db.*.supabase.co is often IPv6-only (no public IPv4). Vercel/serverless frequently ' +
        'returns ENOTFOUND for it. Fix: in Supabase Dashboard use Connect → Transaction pooler, copy the Postgres URI ' +
        '(host like aws-0-REGION.pooler.supabase.com or aws-1-REGION.pooler.supabase.com, port 6543, user postgres.PROJECTREF, append ?pgbouncer=true), ' +
        'set that as DATABASE_URL on Vercel, redeploy.'
      );
    }
    return (
      'DNS: hostname in DATABASE_URL does not resolve. Re-copy from Supabase. Remove stray spaces/newlines; ' +
      'URL-encode special characters in the password. On Vercel + Supabase, use the Transaction pooler URI (port 6543).'
    );
  }
  if (code === 'ECONNREFUSED') {
    return 'Connection refused (wrong port or host). Direct DB is often :5432; pooler uses :6543 with ?pgbouncer=true.';
  }
  if (code === 'ETIMEDOUT') {
    return 'Timed out reaching the database (network, region, or paused Supabase project).';
  }
  if (code === '28P01') {
    return 'Database rejected user/password (check DATABASE_URL credentials and URL-encoding of the password).';
  }
  return null;
}

const app = express();
const PORT = process.env.PORT || 3000;

// Vercel rewrites hit `api/index.js` as `/api?__v_path=<captured path>` so the real URL is not lost.
// Restore `req.url` before routes/CORS so `/api/admin/…`, `/chat`, etc. match.
// Run whenever `__v_path` is present (not only when VERCEL is set) so misconfigured env still routes correctly.
app.use((req, _res, next) => {
  try {
    const i = req.url.indexOf('?');
    if (i === -1) return next();
    const pathname = req.url.slice(0, i);
    // Vercel sends the captured path as `/api?__v_path=...` only (pathname is exactly `/api`).
    if (pathname !== '/api') return next();
    const qs = new URLSearchParams(req.url.slice(i + 1));
    const vp = qs.get('__v_path');
    if (vp === null) return next();
    qs.delete('__v_path');
    const tail = qs.toString();
    const pathOnly = vp === '' ? '' : vp.replace(/^\/+/, '');
    req.url = `/${pathOnly}${tail ? `?${tail}` : ''}`;
  } catch {
    /* ignore */
  }
  next();
});

// ── OpenAI client (lazy — missing key must not break health/admin when only DB is tested)
let openaiClient = null;
function getOpenAI() {
  const k = process.env.OPENAI_API_KEY;
  const key = typeof k === 'string' ? k.trim() : '';
  if (!key) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: key });
  return openaiClient;
}

// ── CORS: allow browser calls from any origin (admin/chatbot on other hosts).
// Uses dynamic reflection (origin: true) — works with Authorization header without credentials: 'include'.
// To restrict later, replace with a function or whitelist in env (not applied by default).
const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: [],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

// ── Middleware ──
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Direct `db.*:5432` → pooler rewrite needs the correct AWS region. Local `node server.js` also awaits
// before listen; when this file is only `require`d (e.g. Vercel `api/index.js`), the first request runs it once.
app.use(async (_req, _res, next) => {
  try {
    await probeSupabasePoolerRegion();
  } catch (e) {
    console.warn('[db] Pooler region probe:', e && e.message);
  }
  next();
});

// Resolve backend folder (server.js lives next to package.json; cwd may differ on Vercel).
const backendRoot = fs.existsSync(path.join(__dirname, 'package.json'))
  ? __dirname
  : process.cwd();

/** Prefer sibling dist locally; prefer `backend/public/` after sync-dist (required paths for Vercel CDN + sendFile fallbacks). */
function resolvedDist(siblingPath, bundledPath) {
  const siblingIdx = path.join(siblingPath, 'index.html');
  const bundledIdx = path.join(bundledPath, 'index.html');
  const hasS = fs.existsSync(siblingIdx);
  const hasB = fs.existsSync(bundledIdx);
  if (process.env.NODE_ENV === 'production' && hasB) return bundledPath;
  if (hasS) return siblingPath;
  if (hasB) return bundledPath;
  return siblingPath;
}

const siblingFrontend = path.join(backendRoot, '..', 'frontend', 'dist');
const siblingAdmin = path.join(backendRoot, '..', 'admin', 'dist');
const bundledFrontend = path.join(backendRoot, 'public');
const bundledAdmin = path.join(backendRoot, 'public', 'admin');
const frontendDist = resolvedDist(siblingFrontend, bundledFrontend);
const adminDist = resolvedDist(siblingAdmin, bundledAdmin);

// System- und CRM-Prompts: Datenbank + backend/lib/chatbotPrompt.js (kein großer Prompt mehr in dieser Datei).

// ── Admin API ──
app.use('/api/admin', adminRouter);
app.use('/api/public', publicRouter);

// ── Chat Endpoint ──
app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Ungültiges Nachrichtenformat.' });
    }

    // Keep last 20 messages for context (10 exchanges)
    const recentMessages = messages.slice(-20);
    const oa = getOpenAI();
    if (!oa) {
      return res.status(503).json({ error: 'Chat ist derzeit nicht konfiguriert (OPENAI_API_KEY fehlt).' });
    }

    const systemContent = await buildFullSystemPrompt();
    const crmToolsInstructions = await fetchCrmToolsInstructions();

    const reply = await runAssistantChat(oa, {
      baseSystemPrompt: systemContent,
      crmToolsInstructions,
      recentMessages,
    });

    res.json({ reply });

    if (getPool()) {
      try {
        const lastUser = [...recentMessages].reverse().find((m) => m.role === 'user');
        const len = typeof lastUser?.content === 'string' ? lastUser.content.length : 0;
        await query('INSERT INTO chat_events (user_message_chars) VALUES ($1)', [len]);
      } catch (_) {
        /* optional analytics */
      }
    }
  } catch (error) {
    console.error('OpenAI Error:', error?.message || error);

    if (error?.status === 401) {
      return res.status(401).json({ error: 'Ungültiger API-Schlüssel' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ error: 'Anfragelimit erreicht, bitte warte kurz' });
    }

    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// ── Health Check ──
app.get('/health', async (req, res) => {
  const payload = {
    status: 'ok',
    service: 'MisterWatch Chatbot',
    database: getPool() ? 'configured' : 'off',
    openai: process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim() ? 'configured' : 'off',
    timestamp: new Date().toISOString(),
  };
  // Note: some catch-all rewrites replace the query string, so `?db=1` may not arrive; use GET /health/db.
  if (req.query.db === '1') {
    if (!getPool()) {
      payload.database_ping = 'skipped_no_db_url';
    } else {
      try {
        await query('SELECT 1 AS ok');
        payload.database_ping = 'ok';
      } catch (e) {
        payload.database_ping = 'error';
        if (e && e.code) payload.database_error_code = String(e.code);
        payload.database_error =
          process.env.API_DEBUG === '1' && e ? `${e.code || ''} ${e.message}`.trim() : 'set API_DEBUG=1 for detail';
        payload.database_host = getDatabaseHostFromEnv();
        payload.database_hint = dbPingHint(e, payload.database_host);
      }
    }
  }
  res.json(payload);
});

/** Path-based DB ping (avoids relying on `?db=1` if rewrites drop the query string). */
app.get('/health/db', async (req, res) => {
  const payload = {
    status: 'ok',
    service: 'MisterWatch Chatbot',
    database: getPool() ? 'configured' : 'off',
    timestamp: new Date().toISOString(),
  };
  if (!getPool()) {
    payload.database_ping = 'skipped_no_db_url';
    return res.json(payload);
  }
  try {
    await query('SELECT 1 AS ok');
    payload.database_ping = 'ok';
  } catch (e) {
    payload.database_ping = 'error';
    if (e && e.code) payload.database_error_code = String(e.code);
    payload.database_error =
      process.env.API_DEBUG === '1' && e ? `${e.code || ''} ${e.message}`.trim() : 'set API_DEBUG=1 for detail';
    payload.database_host = getDatabaseHostFromEnv();
    payload.database_hint = dbPingHint(e, payload.database_host);
  }
  res.json(payload);
});

const noStoreHtml = (res, filePath) => {
  if (path.basename(filePath) === 'index.html') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
};

// Admin SPA — on Vercel, CDN serves `public/admin/**`; keep static + fallback for local dev and client-side routes that miss the CDN.
app.use('/admin', express.static(adminDist, { setHeaders: noStoreHtml }));
app.use('/admin', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(adminDist, 'index.html'));
});

// Public React app — on Vercel, CDN serves `public/**` from `backend/public`; static middleware is for local dev.
app.use(express.static(frontendDist, { setHeaders: noStoreHtml }));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const p = typeof req.path === 'string' ? req.path : '';
  if (p.startsWith('/api') || p.startsWith('/health')) {
    return next();
  }
  if (p.startsWith('/admin')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.sendFile(path.join(adminDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next(err);
  });
});

module.exports = app;

// ── Start Server (skipped when imported e.g. by Vercel api/index.js) ──
if (require.main === module) {
  void (async () => {
    try {
      await probeSupabasePoolerRegion();
    } catch (e) {
      console.warn('[db] Pooler region probe:', e && e.message);
    }

    const server = app.listen(PORT, () => {
      console.log(`
  ┌─────────────────────────────────────┐
  │   ⌚ MisterWatch Chatbot Server     │
  │   Running on http://localhost:${PORT}   │
  │   Status: Online & Ready            │
  └─────────────────────────────────────┘
  `);
    });
    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.error(
          `\n[server] Port ${PORT} is already in use (another node server or app).\n` +
            `  Fix: stop the other process, or run on another port:\n` +
            `    PowerShell:  $env:PORT=3001; node server.js\n` +
            `  If using Vite admin/frontend dev proxy, set the same port:\n` +
            `    $env:VITE_DEV_PROXY_TARGET=\"http://127.0.0.1:3001\"; npm run dev\n`
        );
        process.exit(1);
      }
      throw err;
    });
  })();
}
