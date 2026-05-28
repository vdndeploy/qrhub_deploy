// Helpers to normalize raw user input into canonical social URLs.
// Allows org-admins to type just the phone number or the @handle instead of
// the full https://wa.me/… or https://instagram.com/… URL.
//
// Each function is idempotent: passing an already-canonical URL returns it
// unchanged. Empty/whitespace inputs return '' (so the field is treated as
// "not set" on the backend).

const trim = (s) => (s == null ? '' : String(s).trim());

const stripUrlPrefix = (s) =>
  trim(s).replace(/^https?:\/\//i, '').replace(/^\/+/, '');

/**
 * WhatsApp:  "+39 333 12 34 567" | "00393331234567" | "393331234567"
 *           | "wa.me/393331234567" | "https://wa.me/393331234567"
 *  →  https://wa.me/393331234567
 *
 * If the value is empty or can't extract any digits, returns '' so the field
 * is cleared. Default country prefix is Italy (39) when the number starts
 * with 3 and has 9-10 digits (typical Italian mobile).
 */
export const normalizeWhatsapp = (input) => {
  const raw = trim(input);
  if (!raw) return '';
  // Already a wa.me url
  const wamMatch = raw.match(/wa\.me\/\+?(\d{6,15})/i);
  if (wamMatch) return `https://wa.me/${wamMatch[1]}`;
  // Already an api.whatsapp.com url (older format)
  const apiMatch = raw.match(/(?:api\.whatsapp\.com|web\.whatsapp\.com)\/send.*?phone=\+?(\d{6,15})/i);
  if (apiMatch) return `https://wa.me/${apiMatch[1]}`;
  // Strip everything non-digit (spaces, dashes, parentheses, plus)
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  // Drop leading 00 (international prefix)
  if (digits.startsWith('00')) digits = digits.slice(2);
  // Italian mobile fallback: 9-10 digits starting with 3 → prepend 39
  if (/^3\d{8,9}$/.test(digits)) digits = `39${digits}`;
  if (digits.length < 6 || digits.length > 15) return ''; // E.164 bounds
  return `https://wa.me/${digits}`;
};

const _socialNormalizer = (host, opts = {}) => (input) => {
  const raw = trim(input);
  if (!raw) return '';
  const { stripPrefix = '', forceAt = false } = opts;
  // Already a full URL on the expected host → keep it as-is
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.hostname.includes(host.replace(/^www\./, ''))) {
        return raw.replace(/\/+$/, ''); // drop trailing slash
      }
    } catch {}
    // URL but on a different host → return raw (admin probably knows)
    return raw;
  }
  // Strip leading @ or slash and any partial url prefix
  let slug = stripUrlPrefix(raw)
    .replace(new RegExp(`^${host.replace('.', '\\.')}/`, 'i'), '')
    .replace(/^@/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!slug) return '';
  if (stripPrefix) slug = slug.replace(new RegExp(`^${stripPrefix}`), '');
  return `https://${host}/${forceAt ? '@' : ''}${slug}`;
};

export const normalizeInstagram = _socialNormalizer('instagram.com');
export const normalizeFacebook = _socialNormalizer('facebook.com');
export const normalizeTiktok = _socialNormalizer('www.tiktok.com', { forceAt: true });
export const normalizeLinkedin = _socialNormalizer('linkedin.com');
export const normalizeYoutube = _socialNormalizer('youtube.com');
