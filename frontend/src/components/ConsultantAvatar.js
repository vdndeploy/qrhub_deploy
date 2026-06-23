/* eslint-disable react/prop-types */
/**
 * ConsultantAvatar — vector mascot used as a default avatar for consultants
 * who haven't uploaded a profile picture. Friendly, brand-tinted, with
 * gender variants so orgs can match their roster:
 *
 *   <ConsultantAvatar brandColor="#F96815" gender="neutral" />   // default
 *   <ConsultantAvatar brandColor="#F96815" gender="m" />          // short crop
 *   <ConsultantAvatar brandColor="#F96815" gender="f" />          // long wavy hair
 *
 * The character is intentionally NOT a Will clone — different hair shape,
 * different face proportions, signature headset detail (consultant vibe),
 * and a "speech bubble + QR" emblem on the tee that nods to the product.
 */
import React from 'react';

// ── Hair paths per gender. All draw within the same head bounding box
// (cx≈110, top≈44, bottom≈86) so they swap cleanly without affecting the
// rest of the illustration. Brand-tinted via `fill` props from the caller.
const HAIR_PATHS = {
  // Neutral / masculine crop — short, wavy on top, neat sides.
  m: ({ brandDark, brandLight }) => (
    <>
      <path
        d="M70 86
           C 70 60, 88 44, 110 44
           C 134 44, 154 58, 152 88
           C 148 80, 140 76, 132 78
           C 128 70, 118 66, 110 70
           C 100 64, 88 66, 82 76
           C 76 78, 72 80, 70 86 Z"
        fill={brandDark}
      />
      <path
        d="M88 70 C 98 60, 120 60, 132 72 C 124 66, 110 64, 100 68 Z"
        fill={brandLight}
        opacity="0.55"
      />
    </>
  ),
  // Feminine — longer wavy hair falling past the shoulders, soft volume on top,
  // visible parting. Frame stays brand-coloured so org colour reads cleanly.
  f: ({ brandDark, brandLight }) => (
    <>
      {/* Back / outer hair silhouette — drapes onto shoulders */}
      <path
        d="M64 92
           C 60 70, 72 46, 96 42
           C 116 38, 142 44, 154 64
           C 162 78, 162 100, 160 116
           C 162 130, 158 150, 154 162
           L 144 160
           C 148 142, 148 122, 146 108
           C 138 110, 124 108, 116 104
           L 114 70
           C 104 70, 86 72, 78 84
           C 74 100, 72 122, 76 142
           L 66 144
           C 60 124, 58 110, 64 92 Z"
        fill={brandDark}
      />
      {/* Top crown — controls how the head reads from the front */}
      <path
        d="M76 80
           C 80 60, 96 50, 112 50
           C 132 50, 148 62, 152 82
           C 144 76, 134 74, 124 76
           C 120 70, 114 68, 110 70
           C 102 66, 90 70, 82 78
           C 80 78, 78 79, 76 80 Z"
        fill={brandDark}
      />
      {/* Parting highlight + side wave detail */}
      <path
        d="M92 66 Q 110 56, 132 70 Q 120 64, 108 66 Q 100 64, 92 66 Z"
        fill={brandLight}
        opacity="0.55"
      />
      <path
        d="M148 108 Q 156 124, 152 148 Q 150 130, 146 116 Z"
        fill={brandLight}
        opacity="0.32"
      />
    </>
  ),
};
HAIR_PATHS.neutral = HAIR_PATHS.m; // alias: default look ships the short crop

export const ConsultantAvatar = ({
  brandColor = '#F96815',
  gender = 'neutral',
  size,
  className = '',
  testId = 'consultant-avatar-default',
}) => {
  // Derived brand-tinted secondary used for hair highlight + tee shadow,
  // so the whole illustration shifts with the org colour palette.
  const brandDark = shadeHex(brandColor, -0.28);
  const brandLight = shadeHex(brandColor, 0.22);

  const sizeProps = size ? { width: size, height: size } : {};
  const HairPaint = HAIR_PATHS[gender] || HAIR_PATHS.neutral;

  return (
    <svg
      viewBox="0 0 220 220"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...sizeProps}
      role="img"
      aria-label="Consulente"
      data-testid={testId}
    >
      {/* Soft circular backdrop — neutral so brand colours read cleanly */}
      <circle cx="110" cy="110" r="110" fill="#F4F4F5" />
      <circle cx="110" cy="110" r="108" fill="#FAFAFA" />

      {/* Shoulders / torso — brand-coloured tee */}
      <path
        d="M28 218 C 40 168, 70 152, 110 152 C 150 152, 180 168, 192 218 Z"
        fill={brandColor}
      />
      <path
        d="M28 218 C 40 168, 70 152, 110 152 C 150 152, 180 168, 192 218 L 192 220 L 28 220 Z"
        fill={brandDark}
        opacity="0.18"
      />
      <path
        d="M93 152 C 100 162, 120 162, 127 152 L 127 159 C 120 169, 100 169, 93 159 Z"
        fill={brandDark}
        opacity="0.35"
      />

      {/* ── Speech-bubble + QR emblem on tee (our signature, replaces "WILL") */}
      <g transform="translate(73 178)">
        <rect x="0" y="0" width="38" height="22" rx="6" fill="#FFFFFF" />
        <path d="M9 22 L 14 28 L 18 22 Z" fill="#FFFFFF" />
        <g fill={brandDark}>
          <rect x="5" y="5" width="4" height="4" rx="0.6" />
          <rect x="12" y="5" width="4" height="4" rx="0.6" />
          <rect x="29" y="5" width="4" height="4" rx="0.6" />
          <rect x="5" y="13" width="4" height="4" rx="0.6" />
          <rect x="19" y="9" width="4" height="4" rx="0.6" />
          <rect x="29" y="13" width="4" height="4" rx="0.6" />
        </g>
      </g>

      {/* Neck */}
      <path
        d="M97 138 L 97 158 C 97 162, 103 165, 110 165 C 117 165, 123 162, 123 158 L 123 138 Z"
        fill="#F5C9A6"
      />
      <path
        d="M97 138 L 97 148 C 102 152, 118 152, 123 148 L 123 138 Z"
        fill="#E8B690"
        opacity="0.7"
      />

      {/* ── Head (rounder than Will's, slightly tapered jaw) */}
      <path
        d="M68 90
           C 68 64, 86 50, 110 50
           C 134 50, 152 64, 152 90
           C 152 100, 150 110, 146 118
           C 142 130, 132 142, 110 142
           C 88 142, 78 130, 74 118
           C 70 110, 68 100, 68 90 Z"
        fill="#FBD2B1"
      />
      <ellipse cx="86" cy="105" rx="9" ry="11" fill="#FFFFFF" opacity="0.18" />

      {/* Ears */}
      <ellipse cx="70" cy="100" rx="5" ry="8" fill="#F5C9A6" />
      <ellipse cx="150" cy="100" rx="5" ry="8" fill="#F5C9A6" />

      {/* ── Hair (gender-aware) */}
      <HairPaint brandDark={brandDark} brandLight={brandLight} />

      {/* ── Eyebrows */}
      <path d="M89 95 Q 95 91, 101 95" stroke="#3F2A1E" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M119 95 Q 125 91, 131 95" stroke="#3F2A1E" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* ── Eyes — friendly */}
      <ellipse cx="95" cy="104" rx="3.2" ry="4" fill="#2A1B12" />
      <ellipse cx="125" cy="104" rx="3.2" ry="4" fill="#2A1B12" />
      <circle cx="96" cy="102" r="1" fill="#FFFFFF" />
      <circle cx="126" cy="102" r="1" fill="#FFFFFF" />

      {/* Cheeks blush */}
      <ellipse cx="84" cy="118" rx="6" ry="3" fill="#FFB3A0" opacity="0.55" />
      <ellipse cx="136" cy="118" rx="6" ry="3" fill="#FFB3A0" opacity="0.55" />

      {/* Nose */}
      <path d="M108 115 Q 110 120, 112 115" stroke="#C7906A" strokeWidth="1.4" fill="none" strokeLinecap="round" />

      {/* ── Mouth */}
      <path
        d="M99 125 Q 110 134, 121 125"
        stroke="#3F2A1E"
        strokeWidth="2.2"
        fill="#7A3F2D"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M101 126 Q 110 131, 119 126 L 119 127 Q 110 132, 101 127 Z"
        fill="#FFFFFF"
        opacity="0.9"
      />

      {/* ── Headset — signature consultant detail */}
      <path
        d="M152 92 Q 162 78, 152 64"
        stroke={brandDark}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="152" cy="92" r="4" fill={brandDark} />
      <path
        d="M152 96 Q 148 110, 138 116"
        stroke={brandDark}
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="138" cy="116" r="2.4" fill={brandColor} />

      {/* Crossed-arms hint */}
      <path
        d="M55 215 C 70 195, 90 195, 105 210"
        stroke={brandDark}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M115 210 C 130 195, 150 195, 165 215"
        stroke={brandDark}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.55"
      />
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
