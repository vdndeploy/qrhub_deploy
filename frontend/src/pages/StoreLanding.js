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

  // ── Dynamic hero color band ───────────────────────────────────────────
  // We sample the bottom ~80px strip of the hero image to derive a base
  // colour for the title band underneath the picture. This way the band
  // visually continues the image instead of being a hard cut, AND the
  // hero image itself is shown at its natural aspect ratio (square,
  // 4:5 post, 9:16 story…) — no more crop violence on user-supplied
  // promo creatives.
  const [bandColor, setBandColor] = useState({ r: 17, g: 24, b: 39 }); // gray-900 fallback
  const sampleHeroColor = (img) => {
    try {
      if (!img || !img.naturalWidth) return;
      const canvas = document.createElement('canvas');
      const stripH = Math.max(8, Math.floor(img.naturalHeight * 0.12));
      canvas.width = 40;
      canvas.height = 12;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // Draw the bottom strip of the image scaled into a tiny 40×12 buffer.
      ctx.drawImage(
        img,
        0, img.naturalHeight - stripH, img.naturalWidth, stripH,
        0, 0, 40, 12
      );
      const { data } = ctx.getImageData(0, 0, 40, 12);
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 200) continue; // skip transparent samples
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      if (!n) return;
      setBandColor({ r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) });
    } catch {
      // Canvas may throw on cross-origin without proper CORS headers.
      // Silently keep the fallback (gray-900) — never break the page.
    }
  };
  // Title text colour: pick white on dark band, near-black on light band.
  // Uses relative luminance per WCAG (sRGB lin coefficients).
  const bandIsDark = useMemo(() => {
    const { r, g, b } = bandColor;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum < 150;
  }, [bandColor]);
  const bandRgb = `rgb(${bandColor.r}, ${bandColor.g}, ${bandColor.b})`;
  const bandRgbDark = `rgb(${Math.max(0, bandColor.r - 25)}, ${Math.max(0, bandColor.g - 25)}, ${Math.max(0, bandColor.b - 25)})`;

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

    // Ad-platform conversion fan-out — fires Lead/Conversion to Meta and
    // Google Ads ONLY when the visitor hits the primary CTA (WhatsApp).
    // Both are no-ops when pixels are not configured or libraries did not
    // load (e.g. user blocked them via consent / ad-blocker).
    if (type === 'store_landing_whatsapp_click') {
      try { window.fbq && window.fbq('track', 'Lead'); } catch { /* */ }
      try {
        const adsId = store?.organization?.google_ads_id || '';
        const label = store?.organization?.google_ads_conversion_label || '';
        if (window.gtag && adsId && label) {
          window.gtag('event', 'conversion', { send_to: `${adsId}/${label}` });
        }
      } catch { /* */ }
    }
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

  // ── Ad-platform pixels — inject ONLY on this funnel page, once the store
  // payload is in. We skip preview sessions and skip when the IDs are empty
  // so test traffic and unconfigured orgs don't pollute campaigns.
  useEffect(() => {
    if (!store || isPreviewSession()) return;
    const orgMeta = store.organization || {};
    const pixelId = (orgMeta.meta_pixel_id || '').trim();
    const adsId = (orgMeta.google_ads_id || '').trim();
    const injected = [];

    // Meta Pixel
    if (pixelId && !window.fbq) {
      const s = document.createElement('script');
      s.dataset.qrhubPixel = 'meta';
      s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`;
      document.head.appendChild(s);
      injected.push(s);
    } else if (pixelId && window.fbq) {
      try { window.fbq('init', pixelId); window.fbq('track', 'PageView'); } catch { /* */ }
    }

    // Google Ads gtag — use dataLayer pattern so multiple AW IDs from
    // different orgs on the same browser session don't trample each other.
    if (adsId && !window.gtag) {
      const sLib = document.createElement('script');
      sLib.async = true;
      sLib.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`;
      sLib.dataset.qrhubPixel = 'google-lib';
      document.head.appendChild(sLib);
      const sInit = document.createElement('script');
      sInit.dataset.qrhubPixel = 'google-init';
      sInit.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${adsId}');`;
      document.head.appendChild(sInit);
      injected.push(sLib, sInit);
    } else if (adsId && window.gtag) {
      try { window.gtag('config', adsId); } catch { /* */ }
    }

    return () => {
      // Remove only the tags we injected so HMR / route changes stay clean.
      injected.forEach((el) => { try { el.remove(); } catch { /* */ } });
    };
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
      className="min-h-dvh bg-gradient-to-b from-gray-50 to-white text-gray-900"
      style={themeVars}
      data-testid="store-landing-root"
    >

      {/* Page is intentionally constrained to phone width even on desktop —
          paid traffic is 95% mobile and the funnel reads cleaner this way.
          Pattern used by Linktree / Beacons / Stan etc. */}
      <main className="mx-auto w-full max-w-md min-h-dvh bg-white shadow-[0_0_80px_-20px_rgba(0,0,0,0.08)] flex flex-col">
        {/* ── Hero banner — RESPONSIVE to image aspect ratio.
            The image renders at its natural ratio (1:1 square post,
            4:5 portrait post, 9:16 story…) so admin's promo creative
            isn't crop-mutilated. Below the image sits a smooth gradient
            band whose base colour is sampled from the image's bottom
            strip — the title overlay lives ON the band, never on the
            image. No more text-on-image readability issues. */}
        <section
          className="relative w-full overflow-hidden bg-gray-100"
          data-testid="store-landing-hero"
        >
          {store.landing_hero_image ? (
            <img
              src={store.landing_hero_image}
              alt={store.landing_title || store.name}
              className="block w-full h-auto"
              crossOrigin="anonymous"
              onLoad={(e) => sampleHeroColor(e.currentTarget)}
              data-testid="store-landing-hero-image"
            />
          ) : (
            <div
              className="w-full aspect-[16/9]"
              style={{ background: `linear-gradient(140deg, ${orgColor}, ${shadeColor(orgColor, -15)})` }}
            />
          )}
          {/* Brand badge — top-left, subtle glassmorphism */}
          {brand && (
            <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-white bg-black/35 backdrop-blur-md ring-1 ring-white/15 rounded-full px-2.5 py-1">
              <ShieldCheck className="h-3 w-3" />
              <span className="uppercase">{brand}</span>
            </div>
          )}
        </section>

        {/* ── Title band — dynamic gradient sampled from the image bottom.
            Sits directly under the picture so the title is on a solid
            (gradient) surface, never overlapped on the photo. */}
        <section
          className="relative px-6 pt-7 pb-12 transition-[background] duration-500 ease-out"
          style={{
            background: `linear-gradient(180deg, ${bandRgb} 0%, ${bandRgbDark} 100%)`,
            color: bandIsDark ? '#ffffff' : '#0f172a',
          }}
          data-testid="store-landing-titleband"
        >
          {/* Soft top blend so the photo "melts" into the band */}
          <div
            aria-hidden
            className="absolute -top-8 inset-x-0 h-8 pointer-events-none"
            style={{
              background: `linear-gradient(180deg, rgba(0,0,0,0) 0%, ${bandRgb} 100%)`,
            }}
          />
          <h1
            className="text-[26px] font-bold leading-[1.15] tracking-tight"
            data-testid="store-landing-title"
          >
            {store.landing_title || store.name}
          </h1>
          {store.landing_subtitle && (
            <p
              className={`mt-2 text-[14px] leading-relaxed font-medium ${bandIsDark ? 'text-white/90' : 'text-slate-700'}`}
              data-testid="store-landing-subtitle"
            >
              {store.landing_subtitle}
            </p>
          )}
        </section>

        {/* ── Premium CTA strip — pulls up into the image bottom (-mt-5)
            for a "ticket stub" feel + single primary action with depth
            and a brand-tinted halo. The extra pb-14 on the hero text
            block keeps the subtitle clear of the button. */}
        <section className="px-5 -mt-5 relative z-10">
          {showWhatsapp && (
            <a
              href={buildWaUrl()}
              target="_blank" rel="noopener noreferrer"
              onClick={() => track('store_landing_whatsapp_click')}
              data-testid="store-landing-whatsapp-btn"
              className="relative flex items-center justify-center gap-3 w-full bg-gradient-to-b from-[#25D366] to-[#1eba56] hover:from-[#28dc6c] hover:to-[#1eb957] text-white font-bold rounded-2xl py-[18px] shadow-[0_20px_40px_-12px_rgba(37,211,102,0.45)] ring-1 ring-emerald-700/10 active:scale-[0.97] transition-all duration-200"
            >
              <MessageCircle className="h-5 w-5" strokeWidth={2.5} />
              <span className="text-[15px] tracking-tight">Scrivici su WhatsApp</span>
            </a>
          )}
          {showWhatsapp && (
            <p className="text-center text-[11px] text-gray-500 mt-3 font-medium flex items-center justify-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
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

        {/* ── Info blocks — unified card design with subtle borders,
            consistent rounded-2xl, hover lift, generous padding. */}
        <div className="px-5 mt-8 space-y-2.5">
          {store.landing_show_reviews && (() => {
            const readUrl = (store.landing_review_read_url || '').trim()
              || (store.google_review || '').replace(/\/review\/?$/i, '');
            if (!readUrl) return null;
            return (
              <a
                href={readUrl}
                target="_blank" rel="noopener noreferrer"
                onClick={() => track('store_landing_review_click')}
                data-testid="store-landing-review-btn"
                className="group flex items-center gap-3 rounded-2xl bg-white border border-gray-200 hover:border-amber-300 p-4 shadow-sm hover:shadow-md transition-all active:scale-[0.99]"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-sm shadow-amber-500/30">
                  <Star className="h-5 w-5 text-white fill-white" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-[14px] leading-tight">Leggi le recensioni</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Cosa dicono i clienti su Google</p>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-amber-600 transition-colors" />
              </a>
            );
          })()}

          {store.landing_show_map && (store.google_maps_url || store.address) && (
            <a
              href={store.google_maps_url || `https://maps.google.com/?q=${encodeURIComponent(store.address)}`}
              target="_blank" rel="noopener noreferrer"
              onClick={() => track('store_landing_maps_click')}
              data-testid="store-landing-maps-btn"
              className="group flex items-center gap-3 rounded-2xl bg-white border border-gray-200 hover:border-blue-300 p-4 shadow-sm hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm shadow-blue-500/30">
                <MapPin className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-[14px] leading-tight">Vieni a trovarci</p>
                {store.address && (
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">{store.address}</p>
                )}
              </div>
              <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
            </a>
          )}

          {store.landing_show_hours && (store.hours_text || store.hours) && (
            <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm" data-testid="store-landing-hours">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center shadow-sm">
                  <Clock className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-[14px] leading-tight">Orari di apertura</p>
                  {store.hours_text && (
                    <p className="text-[11px] text-gray-600 mt-1 whitespace-pre-line leading-relaxed">
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
        {/* GDPR-grade footer — mirrors the vendor pages so visitors see the
            same legal controller block + "Titolare verificato" trust badge
            + privacy/terms links. Keeps the lead-gen funnel transparent and
            compliant with art. 13 GDPR before they tap the WhatsApp CTA. */}
        <footer className="px-5 pt-6 pb-5 mt-6 border-t border-gray-100 bg-gray-50/60 text-center text-[11px] text-gray-500 leading-relaxed">
          {store.organization?.gdpr_status?.controller_verified && (
            <a
              href={`/s/${slug}/privacy`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 font-medium text-[10px] uppercase tracking-wider mb-2"
              data-testid="store-landing-trust-badge"
              title="Il titolare del trattamento ha completato l'identificazione richiesta dall'art. 13 GDPR."
            >
              <ShieldCheck className="h-3 w-3" />
              Titolare verificato
            </a>
          )}
          {(store.organization?.legal_name
            || store.organization?.vat_number
            || store.organization?.legal_address
            || store.organization?.privacy_contact_email) && (
            <div className="mb-3" data-testid="store-landing-footer-org">
              {store.organization.legal_name && (
                <div className="font-semibold text-gray-700 text-[12px]">
                  {store.organization.legal_name}
                </div>
              )}
              <div className="text-[11px] text-gray-500 space-y-0.5 mt-1">
                {store.organization.legal_address && (
                  <div>{store.organization.legal_address}</div>
                )}
                {store.organization.vat_number && (
                  <div>P.IVA {store.organization.vat_number}</div>
                )}
                {store.organization.privacy_contact_email && (
                  <a
                    href={`mailto:${store.organization.privacy_contact_email}`}
                    className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
                  >
                    {store.organization.privacy_contact_email}
                  </a>
                )}
              </div>
            </div>
          )}
          <p className="text-[10.5px] text-gray-500">
            <a
              href={`/s/${slug}/privacy`}
              className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
              data-testid="store-landing-privacy-link"
            >
              Informativa privacy
            </a>
            <span aria-hidden="true"> · </span>
            <a
              href={`/s/${slug}/privacy#terms`}
              className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
              data-testid="store-landing-terms-link"
            >
              Termini &amp; condizioni
            </a>
            {store.organization?.privacy_policy_url && (
              <>
                <span aria-hidden="true"> · </span>
                <a
                  href={store.organization.privacy_policy_url}
                  target="_blank" rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
                  data-testid="store-landing-policy-link"
                >
                  Privacy policy estesa
                </a>
              </>
            )}
            <span aria-hidden="true"> · </span>
            Powered by <span className="font-semibold text-gray-700">QRHub</span>
          </p>
        </footer>
      </main>
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
