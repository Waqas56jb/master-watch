import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * - Standalone admin on Vercel: set VITE_ADMIN_BASE=/ (see admin/vercel.json build.env).
 * - Bundled under the Node app at /admin: set VITE_ADMIN_BASE=/admin/ (backend/vercel.json build).
 * - Local dev behind Express on /admin: omit → defaults to /admin/.
 */
function adminBase() {
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
