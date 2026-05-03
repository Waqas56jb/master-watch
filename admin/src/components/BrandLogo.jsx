import { watchLogoUrl } from '../brand.js';

/** Logo (Uhr) per CDN. Ohne alt-Text neben dem Markennamen rein dekorativ. */
export default function BrandLogo({ variant = 'sidebar', className = '', alt = '', ...rest }) {
  const isAuth = variant === 'auth';
  const display = isAuth ? 48 : 40;
  const srcPx = isAuth ? 128 : 112;
  const bg = isAuth ? '0a0a0a' : '141414';
  const base = isAuth ? 'logo-ring logo-ring--remote lg' : 'logo-mark logo-mark--remote';
  return (
    <img
      src={watchLogoUrl({ size: srcPx, bg, shape: 'rounded' })}
      alt={alt}
      width={display}
      height={display}
      className={`${base} ${className}`.trim()}
      decoding="async"
      loading="eager"
      fetchPriority="high"
      {...rest}
    />
  );
}
