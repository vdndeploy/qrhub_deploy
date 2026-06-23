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

// Each entry returns either a back-layer (drawn BEHIND the head, e.g. long
// flowing hair) or a front-layer (drawn ON TOP of the head, e.g. a short
// cap). The component renders the back layer before the head and the front
// layer after — so the forehead stays uncovered for the female variant.
const HAIR_PATHS = {
  // Short, soft cap — gender-neutral baseline. Sits as a front layer.
  m: {
    back: () => null,
    front: ({ brandDark }) => (
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
  },
  // Long flowing hair — drawn entirely as a BACK layer so the head ellipse
  // covers any portion that would otherwise sit on the forehead. The user
  // sees a clean face + long strands falling past the ears down past the
  // shoulders.
  f: {
    back: ({ brandDark }) => (
      <g fill={brandDark}>
        {/* Hair halo — sized to clearly stick out around the head ellipse
            (head rx=42 ry=46) so the hair is unambiguous at small sizes
            (~32px). The head ellipse will mask the centre, leaving a clean
            forehead while still showing hair on top and sides. */}
        <ellipse cx="110" cy="102" rx="58" ry="62" />
        {/* Long left strand — falls past the ear down to mid-torso. */}
        <path d="M52 100
                 C 48 122, 46 154, 52 178
                 L 76 176
                 C 74 152, 74 122, 80 102
                 Z" />
        {/* Long right strand — mirror */}
        <path d="M168 100
                 C 172 122, 174 154, 168 178
                 L 144 176
                 C 146 152, 146 122, 140 102
                 Z" />
      </g>
    ),
    front: () => null,
  },
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
  const hair = HAIR_PATHS[gender] || HAIR_PATHS.neutral;
  const HairBack = hair.back;
  const HairFront = hair.front;

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

      {/* Back hair layer — drawn BEHIND the head so long-hair variants don't
          spill onto the forehead. The head ellipse below masks them naturally. */}
      <HairBack brandDark={brandDark} />

      {/* Neck */}
      <path
        d="M99 138 L 99 156 C 99 162, 104 165, 110 165 C 116 165, 121 162, 121 156 L 121 138 Z"
        fill="#F5C9A6"
      />

      {/* Head */}
      <ellipse cx="110" cy="100" rx="42" ry="46" fill="#FBD2B1" />

      {/* Front hair layer — sits on TOP of the head, used by the short-cap
          masculine/neutral variants. */}
      <HairFront brandDark={brandDark} />
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
