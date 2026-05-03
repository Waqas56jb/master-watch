/**
 * API origin for admin fetch() calls.
 *
 * Local `npm run dev` (Vite): leave VITE_API_BASE / VITE_PUBLIC_API_URL unset → relative `/api/...`
 * is proxied to http://localhost:3000 (see admin/vite.config.js).
 *
 * Local `vite preview` / prod build opened at localhost: no env → http://127.0.0.1:3000.
 *
 * Production monolith (API + admin same host): leave unset → relative `/api/...`.
 *
 * Standalone admin (different host): set VITE_API_BASE or VITE_PUBLIC_API_URL at build time (no trailing slash).
 */
const DEFAULT_LOCAL_API = 'http://127.0.0.1:3000';

function isLoopbackHostname(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/** On loopback, ignore env pointing at a remote host so Vite proxy / same-origin is used. */
function stripRemoteWhenLocalhost(origin) {
  if (typeof window === 'undefined') return origin;
  if (!isLoopbackHostname(window.location.hostname)) return origin;
  const o = String(origin || '').trim();
  if (!o) return o;
  try {
    const u = new URL(o);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return origin;
    return '';
  } catch {
    return origin;
  }
}

function resolveApiOrigin() {
  if (import.meta.env.DEV) {
    let b = String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '');
    if (!b) b = String(import.meta.env.VITE_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
    if (typeof window !== 'undefined' && b) {
      try {
        if (new URL(b).origin === window.location.origin) b = '';
      } catch {
        b = '';
      }
    }
    return stripRemoteWhenLocalhost(b);
  }

  // Production bundle: never use baked remote URL on loopback (::1, 127.0.0.1, localhost).
  if (typeof window !== 'undefined' && isLoopbackHostname(window.location.hostname)) {
    const port = String(window.location.port || '');
    if (port === '3000') return '';
    return DEFAULT_LOCAL_API;
  }

  let b = String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '');
  if (!b) b = String(import.meta.env.VITE_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  if (typeof window !== 'undefined' && b) {
    try {
      if (new URL(b).origin === window.location.origin) b = '';
    } catch {
      b = '';
    }
  }
  return b;
}

export function apiUrl(path) {
  const base = resolveApiOrigin();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
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
