/** Logo per CDN: Uhr (⌚) als SVG von EmojiFavicons (Cloudflare) — für Symbol und Kopfzeile. */
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

/** Symbol für Browser-Tab und Verknüpfungen (Farbe an Hintergrund angepasst). */
export const WATCH_FAVICON_URL = watchLogoUrl({ size: 32, bg: '0d0d0d', shape: 'rounded' });
