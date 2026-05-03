import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Backend for `npm run dev` proxy (override if API is not on :3000). */
const apiTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/chat': { target: apiTarget, changeOrigin: true },
      '/api': { target: apiTarget, changeOrigin: true },
      '/health': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
  },
});
