import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * - Standalone admin on Vercel (Root Directory = admin): base must be /. Vercel sets VERCEL=1 at build;
 *   otherwise defaulting to /admin/ breaks asset URLs (browser requests /admin/assets/* but files are at /assets/*).
 * - Bundled under backend at /admin: set VITE_ADMIN_BASE=/admin/ in that project’s build (see backend/vercel.json).
 * - Local dev behind Express on /admin: omit VERCEL and VITE_ADMIN_BASE → /admin/.
 */
function adminBase() {
  // On Vercel: default to site root. Only use /admin/ when backend monolith build sets VITE_ADMIN_BASE (see backend vercel build).
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

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
  },
});
