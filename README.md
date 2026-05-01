# master-watch

MisterWatch customer chat: React frontend (Vite), **admin panel** (Vite), and Express backend. The chatbot uses a **fixed system prompt** in `backend/server.js` plus **optional knowledge** from **PostgreSQL** (e.g. Neon), managed in the admin UI.

## Setup

### 1. Database (Neon / Postgres)

1. Create a project on [Neon](https://neon.tech) and copy the connection string (`DATABASE_URL`).
2. In the Neon SQL editor (or `psql`), run the schema:

   ```bash
   # from repo root
   psql "$DATABASE_URL" -f backend/schema.sql
   ```

### 2. Backend — from `backend/`

```bash
cd backend
npm install
```

Copy `backend/.env.example` to `backend/.env` and set:

| Variable | Purpose |
|---------|---------|
| `OPENAI_API_KEY` | OpenAI API key for `/chat` |
| `DATABASE_URL` | Postgres connection string (Neon) |
| `JWT_SECRET` | Long random secret for admin JWT (min ~16 chars) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Used once to create the admin user |
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

If the admin is served from another origin in production, set `VITE_API_BASE` when building, e.g.:

```bash
VITE_API_BASE=https://your-api.vercel.app npm run build
```

## How the chatbot uses knowledge

1. **Default:** The large `SYSTEM_PROMPT` constant in `backend/server.js` is always included (unchanged design).
2. **Database:** Active rows from `knowledge_entries` are loaded on each `/chat` request and appended after the prompt under `ERWEITERTES WISSEN AUS ADMIN-PANEL`.

If `DATABASE_URL` is unset, the app runs without KB features; `/chat` still works.

## Admin API (requires `Authorization: Bearer <jwt>`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/auth/login` | Body: `{ "email", "password" }` |
| GET | `/api/admin/auth/me` | Current admin |
| GET | `/api/admin/stats` | Dashboard charts data |
| GET | `/api/admin/knowledge` | List entries |
| GET | `/api/admin/knowledge/:id` | One entry |
| POST | `/api/admin/knowledge` | Create |
| PUT | `/api/admin/knowledge/:id` | Update |
| PATCH | `/api/admin/knowledge/:id/toggle` | Flip `is_active` |
| DELETE | `/api/admin/knowledge/:id` | Delete |

Optional: `chat_events` is appended when users call `/chat` (message length); dashboard “Chat-Nachrichten” line chart uses this.

## Run production (built chat + admin + API)

```bash
cd backend
npm start
```

Use `PORT` if needed (`PORT=3000`). Open `/` for the widget and **`/admin/`** for the dashboard.

## Run development (chat UI hot reload)

Terminal 1 — API:

```bash
cd backend
npm start   # or npm run dev with nodemon
```

Terminal 2 — Vite (proxies `/chat` and optionally add `/health`):

```bash
cd frontend
npm run dev
```

Open the URL Vite prints (e.g. `http://localhost:5173`).

## Repo layout

- `backend/server.js` — Express, `/chat`, admin routes, static `/` and `/admin`
- `backend/schema.sql` — Postgres schema for Neon
- `admin/` — React admin (login, dashboard charts, CRUD knowledge)
- `frontend/` — Customer chat UI
