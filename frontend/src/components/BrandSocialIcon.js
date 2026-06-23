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

const WhatsAppGlyph = ({ className = '', style }) => (
  // Official WhatsApp chat-bubble glyph (Meta brand guidelines 2023).
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
    <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.86 9.86 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91a9.86 9.86 0 0 0-2.91-7.01zM12.04 20.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.17.25-.64.8-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23a7.6 7.6 0 0 1-1.4-1.74c-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42l-.48-.01c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.57.12.17 1.75 2.67 4.23 3.74.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.67-1.18.21-.58.21-1.08.14-1.18-.06-.1-.23-.16-.48-.28z"/>
  </svg>
);

const GoogleGlyph = ({ className = '', style, monochrome = false }) => {
  // Official Google "G" logo (4-colour brand mark). Monochrome variant for
  // when the caller provides its own chip background.
  if (monochrome) {
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
        <path fill="currentColor" d="M12.24 10.4v3.32h4.7a4.66 4.66 0 0 1-1.97 2.99v2.5h3.18c1.86-1.72 2.93-4.25 2.93-7.26 0-.65-.06-1.27-.16-1.86h-8.68z"/>
        <path fill="currentColor" d="M12.24 21.5c2.66 0 4.89-.88 6.52-2.39l-3.18-2.5c-.88.6-2.02.96-3.34.96-2.57 0-4.75-1.74-5.53-4.07H3.43v2.56A9.5 9.5 0 0 0 12.24 21.5z"/>
        <path fill="currentColor" d="M6.7 13.5a5.7 5.7 0 0 1 0-3.64V7.3H3.43a9.5 9.5 0 0 0 0 8.76L6.7 13.5z"/>
        <path fill="currentColor" d="M12.24 5.79c1.45 0 2.74.5 3.77 1.48l2.81-2.81C17.13 2.87 14.9 2 12.24 2A9.5 9.5 0 0 0 3.43 7.3l3.27 2.56c.78-2.33 2.96-4.07 5.54-4.07z"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <path fill="#4285F4" d="M12.24 10.4v3.32h4.7a4.66 4.66 0 0 1-1.97 2.99v2.5h3.18c1.86-1.72 2.93-4.25 2.93-7.26 0-.65-.06-1.27-.16-1.86h-8.68z"/>
      <path fill="#34A853" d="M12.24 21.5c2.66 0 4.89-.88 6.52-2.39l-3.18-2.5c-.88.6-2.02.96-3.34.96-2.57 0-4.75-1.74-5.53-4.07H3.43v2.56A9.5 9.5 0 0 0 12.24 21.5z"/>
      <path fill="#FBBC05" d="M6.7 13.5a5.7 5.7 0 0 1 0-3.64V7.3H3.43a9.5 9.5 0 0 0 0 8.76L6.7 13.5z"/>
      <path fill="#EA4335" d="M12.24 5.79c1.45 0 2.74.5 3.77 1.48l2.81-2.81C17.13 2.87 14.9 2 12.24 2A9.5 9.5 0 0 0 3.43 7.3l3.27 2.56c.78-2.33 2.96-4.07 5.54-4.07z"/>
    </svg>
  );
};

const GoogleMapsGlyph = ({ className = '', style }) => (
  // Google Maps brand pin — red drop with white inner circle (2020 refresh).
  <svg viewBox="0 0 24 24" fill="none" className={className} style={style} aria-hidden="true">
    <path d="M12 2C7.86 2 4.5 5.36 4.5 9.5c0 5.62 7.5 12.5 7.5 12.5s7.5-6.88 7.5-12.5C19.5 5.36 16.14 2 12 2z" fill="#EA4335"/>
    <circle cx="12" cy="9.5" r="3.2" fill="#fff"/>
  </svg>
);

const ClockGlyph = ({ className = '', style }) => (
  // Premium clock glyph for "Orari di apertura" — not a brand, sits inside a
  // neutral dark slate chip to keep visual rhythm with the other chips.
  <svg viewBox="0 0 24 24" fill="none" className={className} style={style} aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
    <path d="M12 7.2v5.1l3.1 1.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

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
  whatsapp: {
    label: 'WhatsApp',
    // Official WhatsApp green gradient (Meta brand guidelines 2023).
    style: { background: 'linear-gradient(155deg, #25D366 0%, #128C7E 100%)' },
    shadow: 'shadow-[0_8px_24px_-8px_rgba(37,211,102,0.55)]',
    Glyph: WhatsAppGlyph,
    glyphClassName: 'text-white',
  },
  google: {
    label: 'Google',
    // White chip with brand-tinted ring → lets the 4-colour G logo shine.
    style: { background: '#fff' },
    shadow: 'shadow-[0_8px_24px_-8px_rgba(66,133,244,0.35)]',
    Glyph: GoogleGlyph,
    glyphClassName: '',  // colours baked into the glyph
  },
  googlemaps: {
    label: 'Google Maps',
    // White chip with a subtle red glow → the red pin stays the focal point.
    style: { background: '#fff' },
    shadow: 'shadow-[0_8px_24px_-8px_rgba(234,67,53,0.45)]',
    Glyph: GoogleMapsGlyph,
    glyphClassName: '',
  },
  hours: {
    label: 'Orari',
    // Premium dark slate chip — not a brand, but visually consistent with
    // the other chips. Subtle gradient + soft shadow keep the rhythm.
    style: { background: 'linear-gradient(155deg, #1f2937 0%, #0f172a 100%)' },
    shadow: 'shadow-[0_8px_24px_-8px_rgba(15,23,42,0.55)]',
    Glyph: ClockGlyph,
    glyphClassName: 'text-white',
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
    // TikTok + Google need `monochrome` to drop their multi-tone overlay so
    // the caller's colour (via currentColor / className) takes effect cleanly.
    const extraProps = (platform === 'tiktok' || platform === 'google')
      ? { monochrome: true }
      : {};
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
