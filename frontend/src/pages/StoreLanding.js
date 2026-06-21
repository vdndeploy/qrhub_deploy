import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  MessageCircle, Star, MapPin, Clock, Instagram, Facebook, ExternalLink,
  ShieldCheck,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Inline preview-session guard — mirrors the one in VendorLanding.js so a
// super-admin previewing the landing from the dashboard doesn't pollute
// the analytics funnel of paid traffic visitors.
const isPreviewSession = () => {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get('preview') === '1';
  } catch { return false; }
};

/**
 * StoreLanding — public lead-gen funnel page (route: /s/:slug).
 *
 * Optimized for paid traffic (Meta/Google Ads). Single primary CTA
 * (WhatsApp OR HTML widget, depending on `landing_cta_mode`). Tracks the
 * whole funnel via the analytics endpoint:
 *   - store_landing_view           on mount
 *   - store_landing_whatsapp_click on WhatsApp CTA tap
 *   - store_landing_review_click   on Google Reviews tap
 *   - store_landing_maps_click     on map tap
 *   - store_landing_social_click   on social icon tap (channel in meta — TBD)
 *   - store_landing_form_view      when the HTML widget enters viewport
 *   - store_landing_bounce         on `beforeunload` if no CTA was clicked
 *                                  within 10 s of mount (rough but useful)
 */
const StoreLanding = () => {
  const { slug } = useParams();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Refs to avoid stale-closure pitfalls in the beforeunload listener:
  // we need to know "did the user click ANY CTA by the time they leave?".
  const interactedRef = useRef(false);
  const sessionStartRef = useRef(Date.now());
  const storeIdRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/store-landing/${encodeURIComponent(slug)}`);
        if (cancelled) return;
        setStore(data);
        storeIdRef.current = data.id;
        // Track the landing view (skip preview sessions to keep the funnel clean)
        if (!isPreviewSession()) {
          axios.post(`${API}/analytics`, {
            vendor_id: '', store_id: data.id, event_type: 'store_landing_view',
          }).catch(() => {});
        }
      } catch (err) {
        if (cancelled) return;
        setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Bounce tracking: fire on unload if no CTA was clicked within 10 s
  // (a longer window would also flag genuinely engaged users who simply
  // close the tab to come back later, so we keep it tight).
  useEffect(() => {
    if (!store) return;
    const handler = () => {
      if (interactedRef.current) return;
      const elapsed = (Date.now() - sessionStartRef.current) / 1000;
      if (elapsed > 10) return;
      // `sendBeacon` is the only reliable transport during the unload event.
      try {
        const body = JSON.stringify({
          vendor_id: '', store_id: storeIdRef.current,
          event_type: 'store_landing_bounce',
        });
        navigator.sendBeacon?.(`${API}/analytics`,
          new Blob([body], { type: 'application/json' })
        );
      } catch { /* best-effort */ }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [store]);

  const track = (type) => {
    if (isPreviewSession()) return;
    // Any meaningful interaction disarms the bounce tracker — not just WA.
    // Otherwise a visitor who taps "Leggi recensioni" within 10s would be
    // wrongly counted as bounce (false negative on engagement).
    interactedRef.current = true;
    axios.post(`${API}/analytics`, {
      vendor_id: '', store_id: storeIdRef.current, event_type: type,
    }).catch(() => {});
  };

  // Set document title + meta description directly (avoids extra lib).
  useEffect(() => {
    if (!store) return;
    const brand = store.organization?.name || 'QRHub';
    document.title = `${store.landing_title || store.name} · ${brand}`;
    const ensureMeta = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    ensureMeta('description', store.landing_subtitle || `Contatta ${store.name} su WhatsApp.`);
    ensureMeta('theme-color', store.organization?.primary_color || '#F96815');
    ensureMeta('robots', 'index, follow');
  }, [store]);

  // Derived: themed CSS vars based on the org primary color.
  const orgColor = store?.organization?.primary_color || '#F96815';
  const themeVars = useMemo(() => ({
    '--brand': orgColor,
    '--brand-soft': hexWithAlpha(orgColor, 0.08),
  }), [orgColor]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Caricamento…</div>
      </div>
    );
  }
  if (notFound || !store) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 px-6">
        <div className="text-center max-w-sm">
          <p className="text-base font-semibold text-gray-900">Pagina non trovata</p>
          <p className="text-sm text-gray-500 mt-2">
            Il link che hai aperto non è più attivo. Controlla l&apos;indirizzo o contatta il negozio.
          </p>
        </div>
      </div>
    );
  }

  const ctaMode = store.landing_cta_mode || 'whatsapp';
  const showWhatsapp = ctaMode === 'whatsapp' && !!store.whatsapp;
  const showWidget = ctaMode === 'html_widget' && !!store.landing_html_widget;

  const buildWaUrl = () => {
    // The admin can store either a wa.me link or a raw phone number;
    // we normalize and append `?text=...` only if it has none yet.
    let url = (store.whatsapp || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//.test(url)) {
      // Raw phone — strip non-digits
      const digits = url.replace(/[^\d+]/g, '');
      url = `https://wa.me/${digits.replace(/^\+/, '')}`;
    }
    const msg = (store.landing_whatsapp_message || '').trim();
    if (msg && !url.includes('?text=') && !url.includes('&text=')) {
      url += `${url.includes('?') ? '&' : '?'}text=${encodeURIComponent(msg)}`;
    }
    return url;
  };

  const brand = store.organization?.name || '';

  return (
    <div
      className="min-h-dvh bg-gray-50 text-gray-900"
      style={themeVars}
      data-testid="store-landing-root"
    >

      {/* Page is intentionally constrained to phone width even on desktop —
          paid traffic is 95% mobile and the funnel reads cleaner this way.
          Pattern used by Linktree / Beacons / Stan etc. */}
      <main className="mx-auto w-full max-w-md min-h-dvh bg-white shadow-sm flex flex-col">
        {/* ── Hero banner — premium layout: full-width image with title /
            subtitle overlayed at the BOTTOM (admin can design the promo
            into the image and we leave the bottom strip semi-transparent
            for readability). If no image, fallback to brand-color
            gradient with title centered. */}
        <section className="relative w-full aspect-[4/5] sm:aspect-[16/12] overflow-hidden">
          {store.landing_hero_image ? (
            <img
              src={store.landing_hero_image}
              alt={store.landing_title || store.name}
              className="absolute inset-0 w-full h-full object-cover"
              data-testid="store-landing-hero-image"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(140deg, ${orgColor}, ${shadeColor(orgColor, -15)})` }}
            />
          )}
          {/* Bottom overlay gradient — only kicks in for the lower 45% of the
              image so the focal subject above stays untouched. */}
          <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/70 via-black/35 to-transparent" />
          {/* Brand badge — top-left, subtle */}
          {brand && (
            <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-[10px] font-medium text-white bg-black/30 backdrop-blur-sm rounded-full px-2.5 py-1">
              <ShieldCheck className="h-3 w-3" /> {brand}
            </div>
          )}
          {/* Title + subtitle in the bottom overlay */}
          <div className="absolute inset-x-0 bottom-0 px-6 pb-5 text-white">
            <h1 className="text-2xl font-bold leading-tight drop-shadow-lg" data-testid="store-landing-title">
              {store.landing_title || store.name}
            </h1>
            {store.landing_subtitle && (
              <p className="mt-1.5 text-sm text-white/95 leading-relaxed drop-shadow-md" data-testid="store-landing-subtitle">
                {store.landing_subtitle}
              </p>
            )}
          </div>
        </section>

        {/* ── Neutral CTA strip — sits directly below the image so the
            admin's design above never gets visually fragmented. */}
        <section className="px-6 pt-5 pb-2 bg-white">
          {showWhatsapp && (
            <a
              href={buildWaUrl()}
              target="_blank" rel="noopener noreferrer"
              onClick={() => track('store_landing_whatsapp_click')}
              data-testid="store-landing-whatsapp-btn"
              className="flex items-center justify-center gap-3 w-full bg-[#25D366] hover:bg-[#1eb957] text-white font-semibold rounded-2xl py-4 shadow-xl shadow-emerald-500/20 active:scale-[0.98] transition-transform"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="text-base">Scrivici su WhatsApp</span>
            </a>
          )}
          {showWhatsapp && (
            <p className="text-center text-[11px] text-gray-500 mt-2">
              Risposta in pochi minuti negli orari di apertura
            </p>
          )}
          {showWidget && (
            <HtmlWidgetSection
              html={store.landing_html_widget}
              onMount={() => track('store_landing_form_view')}
            />
          )}
        </section>

        {/* ── Info blocks — uniform spacing (`space-y-3`) and rounded
            cards so the page never feels "stacked" / cramped. Each block
            is independently toggled via landing_show_*. */}
        <div className="px-6 mt-6 space-y-3">
          {store.landing_show_reviews && (() => {
            // The "Read reviews" link must point to the READ page on Google
            // Maps — distinct from the "write a review" link the org keeps
            // in `google_review`. We prefer the explicit field set by the
            // admin; if empty we make a best-effort fallback by stripping
            // a trailing `/review` segment from the write URL. The admin
            // can override this any time from the Landings tab.
            const readUrl = (store.landing_review_read_url || '').trim()
              || (store.google_review || '').replace(/\/review\/?$/i, '');
            if (!readUrl) return null;
            return (
              <a
                href={readUrl}
                target="_blank" rel="noopener noreferrer"
                onClick={() => track('store_landing_review_click')}
                data-testid="store-landing-review-btn"
                className="block rounded-2xl bg-yellow-50 border border-yellow-200 p-4 hover:bg-yellow-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Star className="h-5 w-5 text-yellow-600 fill-yellow-500" />
                  <div className="flex-1">
                    <p className="font-semibold text-yellow-900 text-sm">Leggi le recensioni</p>
                    <p className="text-xs text-yellow-800/80 mt-0.5">Cosa dicono i nostri clienti su Google</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-yellow-700" />
                </div>
              </a>
            );
          })()}

          {store.landing_show_map && (store.google_maps_url || store.address) && (
            <a
              href={store.google_maps_url || `https://maps.google.com/?q=${encodeURIComponent(store.address)}`}
              target="_blank" rel="noopener noreferrer"
              onClick={() => track('store_landing_maps_click')}
              data-testid="store-landing-maps-btn"
              className="block rounded-2xl bg-gray-50 border border-gray-200 p-4 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-gray-700" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">Vieni a trovarci</p>
                  {store.address && (
                    <p className="text-xs text-gray-600 mt-0.5 truncate">{store.address}</p>
                  )}
                </div>
                <ExternalLink className="h-4 w-4 text-gray-500" />
              </div>
            </a>
          )}

          {store.landing_show_hours && (store.hours_text || store.hours) && (
            <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4" data-testid="store-landing-hours">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-gray-700 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 text-sm">Orari</p>
                  {store.hours_text && (
                    <p className="text-xs text-gray-600 mt-1 whitespace-pre-line leading-relaxed">
                      {store.hours_text}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Socials — small inline strip at the bottom */}
        {(store.instagram || store.facebook || store.tiktok) && (
          <div className="px-6 mt-6 flex items-center justify-center gap-3">
            {store.instagram && (
              <a
                href={store.instagram}
                target="_blank" rel="noopener noreferrer"
                onClick={() => track('store_landing_social_click')}
                data-testid="store-landing-instagram-btn"
                aria-label="Instagram"
                className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-yellow-500 text-white flex items-center justify-center"
              >
                <Instagram className="h-5 w-5" />
              </a>
            )}
            {store.facebook && (
              <a
                href={store.facebook}
                target="_blank" rel="noopener noreferrer"
                onClick={() => track('store_landing_social_click')}
                data-testid="store-landing-facebook-btn"
                aria-label="Facebook"
                className="w-11 h-11 rounded-full bg-[#1877F2] text-white flex items-center justify-center"
              >
                <Facebook className="h-5 w-5" />
              </a>
            )}
            {store.tiktok && (
              <a
                href={store.tiktok}
                target="_blank" rel="noopener noreferrer"
                onClick={() => track('store_landing_social_click')}
                data-testid="store-landing-tiktok-btn"
                aria-label="TikTok"
                className="w-11 h-11 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold"
              >
                TT
              </a>
            )}
          </div>
        )}

        <div className="flex-1" />
        <footer className="px-6 py-6 text-center text-[10px] text-gray-400">
          Powered by <span className="font-semibold">QRHub</span>
        </footer>
      </main>

      {/* Sticky reinforcement CTA — only on WhatsApp mode to keep the
          funnel single-purpose. Hidden when scroll is near the top because
          the hero already has the same button. */}
      {showWhatsapp && (
        <a
          href={buildWaUrl()}
          target="_blank" rel="noopener noreferrer"
          onClick={() => track('store_landing_whatsapp_click')}
          data-testid="store-landing-whatsapp-sticky"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold rounded-full py-3 px-5 shadow-2xl active:scale-95"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <MessageCircle className="h-4 w-4" />
          <span className="text-sm">Scrivici ora</span>
        </a>
      )}
    </div>
  );
};

// ── Small helper components & utilities ────────────────────────────────────

const HtmlWidgetSection = ({ html, onMount }) => {
  const wrapRef = useRef(null);
  useEffect(() => {
    onMount?.();
  }, [onMount]);
  // We render via dangerouslySetInnerHTML because the admin literally pastes
  // a vendor-provided widget snippet (e.g. WINDTRE lead form). The form-view
  // event approximates the "engaged user saw the form" funnel step.
  return (
    <div
      ref={wrapRef}
      className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 overflow-hidden"
      data-testid="store-landing-html-widget"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

function hexWithAlpha(hex, alpha) {
  // Convert "#RRGGBB" → "rgba(r,g,b,alpha)" so we can use a soft background.
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return 'rgba(0,0,0,0.05)';
  const int = parseInt(m[1], 16);
  // eslint-disable-next-line no-bitwise
  const r = (int >> 16) & 255;
  // eslint-disable-next-line no-bitwise
  const g = (int >> 8) & 255;
  // eslint-disable-next-line no-bitwise
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shadeColor(hex, percent) {
  // Lighten/darken a #RRGGBB color by percent (+ lighter, - darker).
  // Used to derive the hero gradient endpoint from the org primary color.
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  // eslint-disable-next-line no-bitwise
  let r = (int >> 16) & 255;
  // eslint-disable-next-line no-bitwise
  let g = (int >> 8) & 255;
  // eslint-disable-next-line no-bitwise
  let b = int & 255;
  const f = 1 + percent / 100;
  r = Math.max(0, Math.min(255, Math.round(r * f)));
  g = Math.max(0, Math.min(255, Math.round(g * f)));
  b = Math.max(0, Math.min(255, Math.round(b * f)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export default StoreLanding;
