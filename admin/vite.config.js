import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * - Admin allein auf Vercel (Stammverzeichnis = admin): Basis muss / sein. Vercel setzt VERCEL=1 beim Build;
 *   sonst würde /admin/ die Asset-URLs brechen.
 * - Im Backend unter /admin gebündelt: VITE_ADMIN_BASE=/admin/ im Build setzen.
 * - Lokal hinter Express unter /admin: VERCEL und VITE_ADMIN_BASE weglassen → /admin/.
 */
function adminBase() {
  // Auf Vercel: Standard ist Seitenstamm. Nur /admin/, wenn der Monolith-Build VITE_ADMIN_BASE setzt.
  if (process.env.VERCEL) {
    const v = (process.env.VITE_ADMIN_BASE || '').trim().replace(/\/$/, '');
    if (v === '/admin' || v === 'admin') return '/admin/';
    return '/';
  }
  const raw = process.env.VITE_ADMIN_BASE;
  if (raw === '/') return '/';
  if (raw != null && String(raw).trim() !== '') {
    const s = String(raw).trim();
    return s.endsWith('/') ? s : `${s}/`;
  }
  return '/admin/';
}

const base = adminBase();

/** Wie beim Frontend: Proxy zum lokalen Express bei `npm run dev`. */
const apiTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 5174,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/health': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
  },
});
