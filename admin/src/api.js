/**
 * Standalone admin on Vercel has no Express — same-origin `/api/...` returns 404 and OPTIONS “CORS errors”.
 * In production, default to the deployed API host (override with VITE_API_BASE or VITE_PUBLIC_API_URL).
 */
const PRODUCTION_API_BASE = (
  String(import.meta.env.VITE_PUBLIC_API_URL || '').trim().replace(/\/$/, '') || 'https://master-watch-yv9c.vercel.app'
);

function apiBase() {
  let b = String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '');
  if (typeof window !== 'undefined' && b) {
    try {
      // Monolith: API and admin share one origin → use relative `/api/...`.
      if (new URL(b).origin === window.location.origin) {
        b = '';
      }
    } catch {
      /* ignore bad VITE_API_BASE */
    }
  }
  if (!b && import.meta.env.PROD) {
    b = PRODUCTION_API_BASE;
  }
  return b;
}

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${apiBase()}${p}`;
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = localStorage.getItem('mw_admin_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(apiUrl(path), { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
