/**
 * Single source of truth for the backend origin (chat, theme, voice session).
 *
 * WordPress / third-party embed: the page origin is NOT your API. You must either
 * - bake `VITE_API_URL` into the production build, or
 * - set `window.__MW_CHAT_API_ROOT__ = 'https://your-api.vercel.app'` in a script tag
 *   BEFORE the widget bundle loads (no trailing slash).
 *
 * Iframe embed: add `allow="microphone"` (and often `allow="autoplay"`) so voice works.
 * WordPress CSP: allow `connect-src` to your API + `https://api.openai.com` + `wss://api.openai.com`.
 */

const DEFAULT_LOCAL_API = 'http://127.0.0.1:3000';

function isLoopbackHostname(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

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

function injectedApiRoot() {
  if (typeof window === 'undefined') return '';
  const w = window.__MW_CHAT_API_ROOT__;
  if (w == null || w === '') return '';
  return String(w).trim().replace(/\/$/, '');
}

export function getApiRoot() {
  const env = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  const injected = injectedApiRoot();

  if (import.meta.env.DEV) {
    return stripRemoteWhenLocalhost(env || injected);
  }

  if (typeof window !== 'undefined' && isLoopbackHostname(window.location.hostname)) {
    const port = String(window.location.port || '');
    if (port === '3000') return '';
    return DEFAULT_LOCAL_API;
  }

  if (env) return env;
  if (injected) return injected;
  return '';
}

/** Absolute or same-origin path for API routes (e.g. `/api/voice/session`). */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const root = getApiRoot();
  return root ? `${root.replace(/\/$/, '')}${p}` : p;
}
