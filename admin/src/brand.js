/** Live CDN: watch (⌚) as SVG — EmojiFavicons (Cloudflare). Used for favicon + in-app logo. */
const WATCH_LOGO_PATH = 'https://emojifavicons.com/watch';

/**
 * @param {{ size?: number; bg?: string; shape?: string }} [opts]
 * @returns {string}
 */
export function watchLogoUrl(opts = {}) {
  const { size = 96, bg = '141414', shape = 'rounded' } = opts;
  const u = new URL(WATCH_LOGO_PATH);
  u.searchParams.set('size', String(size));
  if (bg) u.searchParams.set('bg', String(bg).replace(/^#/, ''));
  if (shape) u.searchParams.set('shape', shape);
  return u.href;
}

/** Tab / bookmark icon (matches `--bg` theme). */
export const WATCH_FAVICON_URL = watchLogoUrl({ size: 32, bg: '0d0d0d', shape: 'rounded' });
