/* eslint-disable react/prop-types */
/**
 * ConsultantAvatar — vector mascot used as a default avatar for consultants
 * who haven't uploaded a profile picture. Friendly, unisex, and brand-aware:
 * the t-shirt picks up the org's `brandColor` so each tenant feels unique.
 *
 * The character is intentionally NOT a Will clone — different hair shape,
 * different face proportions, signature headset detail (consultant vibe),
 * and a "speech bubble + QR" emblem on the tee that nods to the product.
 *
 * Usage:
 *   <ConsultantAvatar brandColor="#F96815" size={120} />
 *   // Inside a hero ring:
 *   <ConsultantAvatar brandColor={org.primary_color} className="w-full h-full" />
 */
import React from 'react';

export const ConsultantAvatar = ({
  brandColor = '#F96815',
  size,
  className = '',
  testId = 'consultant-avatar-default',
}) => {
  // Derived brand-tinted secondary used for hair highlight + tee shadow,
  // so the whole illustration shifts with the org colour palette.
  const brandDark = shadeHex(brandColor, -0.28);
  const brandLight = shadeHex(brandColor, 0.22);

  const sizeProps = size ? { width: size, height: size } : {};

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
      {/* Tee inner shadow on shoulders for depth */}
      <path
        d="M28 218 C 40 168, 70 152, 110 152 C 150 152, 180 168, 192 218 L 192 220 L 28 220 Z"
        fill={brandDark}
        opacity="0.18"
      />
      {/* Tee neckline notch */}
      <path
        d="M93 152 C 100 162, 120 162, 127 152 L 127 159 C 120 169, 100 169, 93 159 Z"
        fill={brandDark}
        opacity="0.35"
      />

      {/* ── Speech-bubble + QR emblem on tee (our signature, replaces "WILL") */}
      <g transform="translate(73 178)">
        <rect x="0" y="0" width="38" height="22" rx="6" fill="#FFFFFF" />
        <path d="M9 22 L 14 28 L 18 22 Z" fill="#FFFFFF" />
        {/* Mini QR — 3×3 grid of dots */}
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
      {/* Neck shadow */}
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
      {/* Face highlight (left cheek) */}
      <ellipse cx="86" cy="105" rx="9" ry="11" fill="#FFFFFF" opacity="0.18" />

      {/* Ears */}
      <ellipse cx="70" cy="100" rx="5" ry="8" fill="#F5C9A6" />
      <ellipse cx="150" cy="100" rx="5" ry="8" fill="#F5C9A6" />

      {/* ── Hair — soft wavy crop (unisex, mid-length on top, neat sides).
            Brand-tinted so each tenant gets a slightly different look. */}
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
      {/* Hair side-volume + parting highlight */}
      <path
        d="M88 70 C 98 60, 120 60, 132 72 C 124 66, 110 64, 100 68 Z"
        fill={brandLight}
        opacity="0.55"
      />

      {/* ── Eyebrows */}
      <path d="M89 95 Q 95 91, 101 95" stroke="#3F2A1E" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M119 95 Q 125 91, 131 95" stroke="#3F2A1E" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* ── Eyes — friendly closed-arc smile-eyes for warmth */}
      <ellipse cx="95" cy="104" rx="3.2" ry="4" fill="#2A1B12" />
      <ellipse cx="125" cy="104" rx="3.2" ry="4" fill="#2A1B12" />
      {/* Eye highlights */}
      <circle cx="96" cy="102" r="1" fill="#FFFFFF" />
      <circle cx="126" cy="102" r="1" fill="#FFFFFF" />

      {/* Cheeks blush — subtle */}
      <ellipse cx="84" cy="118" rx="6" ry="3" fill="#FFB3A0" opacity="0.55" />
      <ellipse cx="136" cy="118" rx="6" ry="3" fill="#FFB3A0" opacity="0.55" />

      {/* Nose — minimal dot for stylised look */}
      <path d="M108 115 Q 110 120, 112 115" stroke="#C7906A" strokeWidth="1.4" fill="none" strokeLinecap="round" />

      {/* ── Mouth — warm open smile */}
      <path
        d="M99 125 Q 110 134, 121 125"
        stroke="#3F2A1E"
        strokeWidth="2.2"
        fill="#7A3F2D"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Teeth highlight */}
      <path
        d="M101 126 Q 110 131, 119 126 L 119 127 Q 110 132, 101 127 Z"
        fill="#FFFFFF"
        opacity="0.9"
      />

      {/* ── Headset (consultant signature) — earpiece arm */}
      <path
        d="M152 92 Q 162 78, 152 64"
        stroke={brandDark}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="152" cy="92" r="4" fill={brandDark} />
      {/* Mic boom */}
      <path
        d="M152 96 Q 148 110, 138 116"
        stroke={brandDark}
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="138" cy="116" r="2.4" fill={brandColor} />

      {/* ── Crossed-arms hint — small forearm strokes coming up from the
            bottom so the pose reads "confident consultant" without occluding
            the QR emblem (which is the actual brand-tie). */}
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
