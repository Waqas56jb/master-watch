# master-watch

MisterWatch customer chat: React frontend (Vite) and Express backend.

## Setup

1. **Backend** — from `backend/`:

   ```bash
   cd backend
   npm install
   ```

   Add `OPENAI_API_KEY` (and optional `PORT`) in `backend/.env`.

2. **Frontend** — from `frontend/`:

   ```bash
   cd frontend
   npm install
   npm run build
   ```

## Run production (built UI + API)

```bash
cd backend
npm start
```

Open `http://localhost:3000` (or your `PORT`).

## Run development (hot reload UI)

Terminal 1 — API:

```bash
cd backend
npm start
```

Terminal 2 — Vite (proxies `/chat` to port 3000):

```bash
cd frontend
npm run dev
```

Open the URL Vite prints (e.g. `http://localhost:5173`).
