/* eslint-disable react/prop-types */
/**
 * ConsultantAvatar — minimal vector avatar used as the default when a vendor
 * hasn't uploaded a profile photo. Deliberately plain (no facial features,
 * no headset, no emblem) so it reads as a tasteful placeholder rather than
 * a mascot. Gender hint only changes hair shape; everything else is shared.
 *
 *   <ConsultantAvatar brandColor="#F96815" gender="neutral" />   // short cap
 *   <ConsultantAvatar brandColor="#F96815" gender="m" />          // short cap
 *   <ConsultantAvatar brandColor="#F96815" gender="f" />          // shoulder-length hair
 */
import React from 'react';

// Each entry returns the hair <path>(s) for that gender. Same fill colour
// (`brandDark`) so org colour drives the whole illustration.
const HAIR_PATHS = {
  // Short, soft cap — gender-neutral baseline.
  m: ({ brandDark }) => (
    <path
      d="M68 90
         C 68 64, 86 50, 110 50
         C 134 50, 152 64, 152 90
         C 152 92, 150 94, 148 94
         C 144 80, 130 72, 110 72
         C 90 72, 76 80, 72 94
         C 70 94, 68 92, 68 90 Z"
      fill={brandDark}
    />
  ),
  // Longer hair flowing past the shoulders. Tries to read clearly even at
  // ~32px so we avoid fine strands and use one continuous silhouette.
  f: ({ brandDark }) => (
    <path
      d="M64 92
         C 60 70, 76 48, 110 48
         C 144 48, 160 70, 156 96
         C 158 116, 156 144, 152 162
         L 144 160
         C 148 142, 148 122, 146 108
         C 138 110, 124 108, 116 104
         L 114 72
         C 102 72, 84 78, 78 92
         C 74 110, 72 138, 76 160
         L 66 158
         C 60 138, 58 110, 64 92 Z"
      fill={brandDark}
    />
  ),
};
HAIR_PATHS.neutral = HAIR_PATHS.m; // alias

export const ConsultantAvatar = ({
  brandColor = '#F96815',
  gender = 'neutral',
  size,
  className = '',
  testId = 'consultant-avatar-default',
}) => {
  const brandDark = shadeHex(brandColor, -0.22);
  const sizeProps = size ? { width: size, height: size } : {};
  const HairPaint = HAIR_PATHS[gender] || HAIR_PATHS.neutral;

  return (
    <svg
      viewBox="0 0 220 220"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...sizeProps}
      role="img"
      aria-label="Avatar"
      data-testid={testId}
    >
      {/* Soft circular backdrop */}
      <circle cx="110" cy="110" r="110" fill="#F4F4F5" />

      {/* Shoulders / torso — brand-coloured */}
      <path
        d="M28 220 C 38 172, 70 154, 110 154 C 150 154, 182 172, 192 220 Z"
        fill={brandColor}
      />

      {/* Neck */}
      <path
        d="M99 138 L 99 156 C 99 162, 104 165, 110 165 C 116 165, 121 162, 121 156 L 121 138 Z"
        fill="#F5C9A6"
      />

      {/* Head */}
      <ellipse cx="110" cy="100" rx="42" ry="46" fill="#FBD2B1" />

      {/* Hair (gender-aware) */}
      <HairPaint brandDark={brandDark} />
    </svg>
  );
};

// Lighten/darken a hex colour by `pct` (-1..1). Safe-fallback to input on parse fail.
function shadeHex(hex, pct) {
  if (!hex || typeof hex !== 'string') return '#000000';
  const m = hex.replace('#', '').match(/^([a-f\d]{6})$/i);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const k = pct < 0 ? 0 : 255;
  const t = Math.abs(pct);
  r = Math.round(r + (k - r) * t);
  g = Math.round(g + (k - g) * t);
  b = Math.round(b + (k - b) * t);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export default ConsultantAvatar;
