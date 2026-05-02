/**
 * Copies Vite builds into `backend/public/` so:
 * - Vercel (Root Directory = `backend`) serves them from the CDN (`public/**` is next to package.json).
 *   express.static() is ignored on Vercel — static files must live here.
 * - Local `npm start`: server uses `backend/public` in production or sibling `dist` folders (see server.js).
 */
const fs = require('fs');
const path = require('path');

const backendRoot = path.join(__dirname, '..');
const repoRoot = path.join(backendRoot, '..');
const adminSrc = path.join(repoRoot, 'admin', 'dist');
const frontendSrc = path.join(repoRoot, 'frontend', 'dist');
const publicRoot = path.join(backendRoot, 'public');
const adminDst = path.join(publicRoot, 'admin');

function requireBuild(from, label) {
  if (!fs.existsSync(from) || !fs.existsSync(path.join(from, 'index.html'))) {
    console.error(`sync-dist: Missing ${label} build with index.html at ${from}`);
    console.error(`  Run: cd ${label} && npm ci && npm run build`);
    process.exit(1);
  }
}

function wipeGeneratedPublicTargets() {
  fs.rmSync(adminDst, { recursive: true, force: true });
  fs.rmSync(path.join(publicRoot, 'index.html'), { force: true });
  fs.rmSync(path.join(publicRoot, 'assets'), { recursive: true, force: true });
}

requireBuild(adminSrc, 'admin');
requireBuild(frontendSrc, 'frontend');

fs.mkdirSync(publicRoot, { recursive: true });
wipeGeneratedPublicTargets();
fs.cpSync(frontendSrc, publicRoot, { recursive: true });
fs.mkdirSync(path.dirname(adminDst), { recursive: true });
fs.cpSync(adminSrc, adminDst, { recursive: true });
console.log(`sync-dist: frontend → ${publicRoot}`);
console.log(`sync-dist: admin → ${adminDst}`);
