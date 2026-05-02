const crypto = require('crypto');

const JWT_EXPIRES_DEFAULT = '7d';

/**
 * Admin API uses HS256 JWTs. If `JWT_SECRET` is not set (e.g. only 5 env vars on Vercel),
 * derive a stable 64-char hex secret from `SUPABASE_SERVICE_ROLE_KEY` (SHA-256).
 * Rotating the service role invalidates existing admin tokens.
 */
function getJwtSecret() {
  const explicit = process.env.JWT_SECRET;
  if (typeof explicit === 'string' && explicit.trim().length >= 16) {
    return explicit.trim();
  }
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof sr === 'string' && sr.trim().length >= 32) {
    return crypto.createHash('sha256').update(sr.trim(), 'utf8').digest('hex');
  }
  return null;
}

module.exports = {
  getJwtSecret,
  JWT_EXPIRES_DEFAULT,
};
