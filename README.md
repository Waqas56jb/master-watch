# master-watch

MisterWatch customer chat: React frontend (Vite), **admin panel** (Vite), and Express backend. The chatbot system text lives in **Postgres** (plus optional `knowledge_entries`), edited in the admin UI; Express assembles prompts at `/chat`.

## Setup

### 1. Database (Postgres — Supabase, Neon, etc.)

1. Create a project and copy **`DATABASE_URL`**. The backend **auto-rewrites** Supabase direct `db.*:5432` URLs to the **Transaction pooler** (IPv4) unless `SUPABASE_AUTO_POOLER=false`. Set **`SUPABASE_POOLER_REGION`** (e.g. `eu-central-1`, `us-east-1`) from **Supabase → Connect** if the default region does not match your project.
2. In the SQL editor (or `psql`), run the schema:

   ```bash
   # from repo root
   psql "$DATABASE_URL" -f backend/schema.sql
   ```

### 2. Backend — from `backend/`

```bash
cd backend
npm install
```

Optional — print schema via Supabase RPC `get_schema_info` (same pattern as `@supabase/supabase-js` in your script; requires that RPC in Postgres):

```bash
cd backend
npm run supabase:schema
```

The HTTP app still uses **`pg` + `DATABASE_URL`** for admin SQL, bcrypt login, and dashboards; the Supabase JS client is for **REST/RPC** helpers (see `lib/supabase.js`).

Copy `backend/.env.example` to `backend/.env` and set:

| Variable | Purpose |
|---------|---------|
| `OPENAI_API_KEY` | OpenAI API key for `/chat` |
| `DATABASE_URL` | Postgres connection string (Supabase / Neon) |
| `SUPABASE_URL` | Supabase project URL (optional for REST; required with service role below if `JWT_SECRET` unset) |
| `SUPABASE_ANON_KEY` | Supabase anon key (optional unless you add client-side Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; used to **derive** admin JWT signing key when `JWT_SECRET` is unset; also `lib/supabase.js` (`createClient`) |
| `JWT_SECRET` | Optional: fixed admin JWT secret (≥16 chars); overrides derivation from service role |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Used once to create the admin user (`npm run seed-admin`) |
| `ALLOWED_ORIGINS` | Optional comma-separated CORS origins for production |

Create the admin user:

```bash
npm run seed-admin
```

Remove or rotate `ADMIN_PASSWORD` from `.env` after seeding if you prefer.

Start the API:

```bash
npm start
```

- Public chat UI: `http://localhost:3000/`
- **Admin UI:** `http://localhost:3000/admin/` (after building admin — see below)

### 3. Chat frontend — from `frontend/`

```bash
cd frontend
npm install
npm run build
```

### 4. Admin panel — from `admin/`

```bash
cd admin
npm install
npm run build
```

For local admin development with hot reload (proxies `/api` to port 3000):

```bash
cd admin
npm run dev
```

Open `http://localhost:5174/admin/` (Vite dev server; `basename` is `/admin`).

**Local API URL:** With no env vars, `/api` is proxied to **`http://127.0.0.1:3000`**. If your backend uses another port, set `VITE_DEV_PROXY_TARGET` (see `admin/.env.example` and `admin/vite.config.js`).

If the admin is served from another origin in production, set `VITE_API_BASE` (or `VITE_PUBLIC_API_URL`) when building:

```bash
VITE_API_BASE=https://your-api.vercel.app npm run build
```

## How the chatbot uses knowledge

1. **System & CRM (Postgres):** Row `chatbot_prompt_config` holds `global_instructions` and `crm_tools_instructions` (edited in Admin under **Chatbot – System & CRM**). Optional per-page blocks live in `chatbot_prompt_pages` (**Chatbot – Seiten-Wissen**).
2. **Assembly order on each `/chat`:** global instructions → active non-empty page blocks (by `sort_order`) → active `knowledge_entries` under `ERWEITERTES WISSEN AUS ADMIN-PANEL` → CRM/tools block when the DB pool is active.
3. **Initial copy of legacy prompts:** After `npm run db:apply`, run `npm run seed-chatbot-prompts` once (from `backend/`) to load `backend/seed/default-*.txt` into the config row. Use `--force` to overwrite.

If `DATABASE_URL` is unset, the app runs without KB / CRM DB features. `/chat` still works when `OPENAI_API_KEY` is set; without it, `/chat` returns **503** with a clear message.

## Admin API (requires `Authorization: Bearer <jwt>`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/auth/login` | Body: `{ "email", "password" }` |
| GET | `/api/admin/auth/me` | Current admin |
| GET | `/api/admin/stats` | Dashboard charts data |
| GET | `/api/admin/chat-events` | Paginated `chat_events` (limit, offset query params) |
| GET | `/api/admin/knowledge` | List entries |
| GET | `/api/admin/knowledge/:id` | One entry |
| POST | `/api/admin/knowledge` | Create |
| PUT | `/api/admin/knowledge/:id` | Update |
| PATCH | `/api/admin/knowledge/:id/toggle` | Flip `is_active` |
| DELETE | `/api/admin/knowledge/:id` | Delete |
| GET / PUT | `/api/admin/chatbot-prompt` | Global + CRM prompt text (`id` is always `1`) |
| GET / POST | `/api/admin/chatbot-prompt/pages` | List / create per-page prompt blocks |
| GET / PUT / DELETE | `/api/admin/chatbot-prompt/pages/:id` | One page block |
| PATCH | `/api/admin/chatbot-prompt/pages/:id/toggle` | Flip `is_active` |

Optional: `chat_events` is appended when users call `/chat` (message length); dashboard “Chat-Nachrichten” line chart uses this.

## Run production (built chat + admin + API)

```bash
cd backend
npm start
```

Use `PORT` if needed (`PORT=3000`). Open `/` for the widget and **`/admin/`** for the dashboard.

### Vercel: separate `admin/` or `frontend/` project (refresh / deep links)

If the **Root Directory** is `admin/` or `frontend/` (not the monolithic `backend/`), keep the included **`vercel.json`** in that folder. It rewrites unknown paths to `index.html` so **browser refresh** on routes like `/dashboard` or `/chatbot-prompt` does not return **404 NOT_FOUND**. Redeploy after pulling.

## Run development (chat UI hot reload)

Terminal 1 — API:

```bash
cd backend
npm start   # or npm run dev with nodemon
```

Terminal 2 — Vite (proxies `/chat`, `/api`, `/health` → `http://127.0.0.1:3000` by default):

```bash
cd frontend
npm run dev
```

Override proxy target if needed: `VITE_DEV_PROXY_TARGET=http://127.0.0.1:4000 npm run dev` (see `frontend/vite.config.js`).

Open the URL Vite prints (e.g. `http://localhost:5173`).

## Repo layout

- `backend/server.js` — Express, `/chat`, admin routes, static `/` and `/admin`
- `backend/schema.sql` — Postgres schema (Supabase / Neon / any Postgres)
- `admin/` — React admin (login, dashboard charts, CRUD knowledge)
- `frontend/` — Customer chat UI
