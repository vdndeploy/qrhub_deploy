/* eslint-disable react/prop-types */
/**
 * BrandSocialIcon — drop-in social chip with brand-accurate gradient
 * background + official glyph. Inline SVG only (no deps).
 *
 * Why a component:
 *   We need the same Instagram/Facebook/TikTok pill on multiple surfaces
 *   (Store landing footer, Vendor landing footer, marketing site, etc.).
 *   Duplicated inline SVGs were drifting visually — one component =
 *   single source of truth for brand fidelity.
 *
 * Usage:
 *   <BrandSocialIcon platform="instagram" href={url} onClick={track} />
 *   <BrandSocialIcon platform="facebook"  size={56} />     // ↑ size variant
 *   <BrandSocialIcon platform="tiktok"    glyphOnly        // ← raw glyph
 *                                         className="text-white h-7 w-7" />
 *
 * Props:
 *   - platform: 'instagram' | 'facebook' | 'tiktok'  (required)
 *   - href:     optional URL — renders as <a>, omit → renders as <span>
 *   - onClick:  optional click handler (analytics)
 *   - size:     px size of the chip square. Default 48.
 *   - glyphOnly: render only the inline glyph (no brand chip background).
 *                Used by callers that already provide their own disc
 *                (e.g. Vendor landing cards). `className` controls colour.
 *   - className: extra classes for the wrapper.
 *   - testId:   data-testid for the wrapper.
 */
import React from 'react';

const InstagramGlyph = ({ className = '', style }) => (
  // Wrapped in <g> so `.card-icon svg > rect:first-of-type{display:none}`
  // (a legacy CSS rule in VendorLanding.css that hides outer-frame rects on
  // the OLD icon set) does NOT strip the camera body — its rect is now a
  // grandchild of <svg>, not a direct child.
  <svg viewBox="0 0 24 24" fill="none" className={className} style={style} aria-hidden="true">
    <g>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" />
    </g>
  </svg>
);

const FacebookGlyph = ({ className = '', style }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
    <path d="M22 12.07C22 6.51 17.52 2 12 2S2 6.51 2 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.02H7.9v-2.91h2.54V9.84c0-2.52 1.49-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.77l-.44 2.91h-2.33V22c4.78-.75 8.43-4.91 8.43-9.93z" />
  </svg>
);

const TikTokGlyph = ({ className = '', style, monochrome = false }) => {
  // Single-path glyph used either with the official triple-tone overlay
  // (chip variant, vibrant) or in a single colour via currentColor
  // (glyphOnly variant, lets the caller pick the colour).
  const path = 'M16.5 5.4c.95 1.1 2.27 1.78 3.75 1.86v3.16c-1.5-.04-2.93-.46-4.22-1.16v6.62c0 3.2-2.6 5.78-5.78 5.78a5.78 5.78 0 0 1-5.78-5.78c0-3.2 2.6-5.78 5.78-5.78.32 0 .63.03.94.08v3.27c-.3-.1-.61-.16-.94-.16a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 2.6-2.6V3h2.85c.13.85.43 1.66.8 2.4z';
  if (monochrome) {
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
        <path d={path} fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <path d={path} fill="#25F4EE" transform="translate(-1.2,1)" />
      <path d={path} fill="#FE2C55" transform="translate(1.2,-1)" />
      <path d={path} fill="#fff" />
    </svg>
  );
};

// ── Per-platform chip presentation (background, shadow, glyph colour)
const CHIPS = {
  instagram: {
    label: 'Instagram',
    // Official corner-burst gradient (Pantone-aligned)
    style: {
      background:
        'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
    },
    shadow: 'shadow-[0_8px_24px_-8px_rgba(220,39,67,0.55)]',
    Glyph: InstagramGlyph,
    glyphClassName: 'text-white',
  },
  facebook: {
    label: 'Facebook',
    style: { background: 'linear-gradient(155deg, #1877F2 0%, #0a5fd1 100%)' },
    shadow: 'shadow-[0_8px_24px_-8px_rgba(24,119,242,0.55)]',
    Glyph: FacebookGlyph,
    glyphClassName: 'text-white',
  },
  tiktok: {
    label: 'TikTok',
    style: { background: '#000' },
    shadow: 'shadow-[0_8px_24px_-8px_rgba(0,0,0,0.55)]',
    Glyph: TikTokGlyph,
    glyphClassName: '',  // colours baked into the glyph
  },
};

export const BrandSocialIcon = ({
  platform,
  href,
  onClick,
  size = 48,
  glyphOnly = false,
  className = '',
  testId,
  ariaLabel,
}) => {
  const cfg = CHIPS[platform];
  if (!cfg) return null;
  const { Glyph, glyphClassName, shadow, style, label } = cfg;
  // Glyph size: ~46% of chip, matches the optical weight of Apple's app icons.
  const glyphPx = Math.round(size * 0.46);

  if (glyphOnly) {
    // TikTok needs `monochrome` to drop its triple-tone overlay so the
    // caller's colour (via currentColor / className) takes effect cleanly.
    const extraProps = platform === 'tiktok' ? { monochrome: true } : {};
    return (
      <Glyph
        className={className || `h-[${glyphPx}px] w-[${glyphPx}px]`}
        {...extraProps}
      />
    );
  }

  const Tag = href ? 'a' : 'span';
  const linkProps = href
    ? { href, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <Tag
      {...linkProps}
      onClick={onClick}
      aria-label={ariaLabel || label}
      data-testid={testId}
      className={`group relative inline-flex items-center justify-center rounded-2xl ring-1 ring-black/5 transition-all duration-200 hover:scale-[1.06] active:scale-95 ${shadow} ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      <Glyph className={`${glyphClassName}`} style={{ width: glyphPx, height: glyphPx }} />
    </Tag>
  );
};

export default BrandSocialIcon;
