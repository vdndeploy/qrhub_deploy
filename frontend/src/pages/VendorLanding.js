import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { MapPin, Share2, Store as StoreIcon, Clock, X, Plus, CalendarClock } from 'lucide-react';
import AddToHomeDialog from '@/components/AddToHomeDialog';
import PostsCarousel from '../components/PostsCarousel';
import { computeOpenStatus } from '../components/HoursEditor';
import BrandSocialIcon from '../components/BrandSocialIcon';
import ConsultantAvatar from '../components/ConsultantAvatar';
import PushSubscribe from '../components/PushSubscribe';
import './VendorLanding.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DEFAULT_COOKIE_TEXT =
  'Questa pagina raccoglie dati statistici aggregati (visite, click, città di provenienza approssimativa) per migliorare il servizio. Non vengono memorizzati indirizzi IP né utilizzati cookie di profilazione. Continuando a navigare accetti questa policy.';

const CookieBanner = ({ vendorId, orgId, banner, primaryColor }) => {
  const storageKey = `qrhub_cookie_ack_${orgId || 'default'}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const ack = localStorage.getItem(storageKey);
      if (!ack) setVisible(true);
    } catch { setVisible(true); }
  }, [storageKey]);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(storageKey, new Date().toISOString()); } catch { /* ignore */ }
    setVisible(false);
  };

  // GDPR (art. 13): the link to the privacy notice is MANDATORY. If the tenant
  // didn't configure a custom URL, fall back to the per-tenant auto-generated
  // page that the platform builds from db.organizations + sub-processor list.
  const privacyLink = banner?.link || `/v/${vendorId}/privacy`;
  const useCustomText = banner?.use_custom_text && banner?.text;

  return (
    <div className="cookie-banner" data-testid="cookie-banner" role="dialog" aria-live="polite">
      <div className="cookie-banner-inner">
        <p className="cookie-banner-text">{useCustomText ? banner.text : DEFAULT_COOKIE_TEXT}</p>
        <div className="cookie-banner-actions">
          <a href={privacyLink}
              target={banner?.link ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className="cookie-banner-link" data-testid="cookie-banner-link">
            Informativa privacy
          </a>
          <button onClick={dismiss}
                  className="cookie-banner-button"
                  style={{ backgroundColor: primaryColor || '#F96815' }}
                  data-testid="cookie-banner-accept">
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
};

const VendorLanding = () => {
  const { vendorId } = useParams();
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [addToHomeOpen, setAddToHomeOpen] = useState(false);
  const [blockedReason, setBlockedReason] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  // True when the page is rendered inside the installed PWA (standalone).
  // We hide the "+" install button in that case — pointless prompt for a
  // user who already has the icon on their home screen.
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: minimal-ui)').matches ||
      // iOS Safari
      window.navigator?.standalone === true
    );
  });
  // Tick every minute so the "open now" badge stays accurate without a refresh.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetchVendor();
    trackPageView();
    setupPWA();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const fetchVendor = async () => {
    try {
      const { data } = await axios.get(`${API}/vendors/${vendorId}`);

      // Admin preview mode: when the URL carries a signed `?preview={token}`
      // we verify the token against the backend (public endpoint, no cookies
      // involved → works even across qrhub.it ↔ qrhub.fly.dev domains).
      // Tokens are minted by the admin panel via /api/vendors/:id/preview-token
      // and last 30 minutes.
      const params = new URLSearchParams(window.location.search);
      const previewToken = params.get('preview') || '';
      if (previewToken) {
        try {
          await axios.get(`${API}/preview/check`, {
            params: { token: previewToken, vendor_id: vendorId },
          });
          // Valid signed preview token — render the landing on whichever host.
          setPreviewMode(true);
          setVendor(data);
          const brand = data?.organization?.brand_name || data?.organization?.name || 'QRHub';
          if (data?.name) document.title = `[Anteprima] ${data.name} · ${brand}`;
          setLoading(false);
          return;
        } catch {
          // Token invalid or expired — fall through to the normal host
          // enforcement so visitors don't get to see the landing on the wrong
          // host just by trying random tokens.
        }
      }

      // Canonical-host enforcement: each vendor landing is published under the
      // org's own verified custom domain. Any other host (qrhub.it platform
      // domain, qrhub-app.vercel.app default, etc.) must NOT serve the landing
      // so the open-source platform is never confused with a tenant's branded
      // service. The only exception are local/preview testing hosts.
      const canonical = (data.canonical_host || '').toLowerCase();
      const host = window.location.hostname.toLowerCase();
      const isTestHost = host === 'localhost'
        || host === '127.0.0.1'
        || host.endsWith('.preview.emergentagent.com')
        || host.endsWith('.emergent.host');

      if (isTestHost) {
        // Local/preview testing: always render so we can QA the landing.
        setVendor(data);
        const brand = data?.organization?.brand_name || data?.organization?.name || 'QRHub';
        if (data?.name) document.title = `${data.name} · ${brand}`;
        return;
      }

      if (canonical && host === canonical) {
        // Correct tenant domain — render the landing.
        setVendor(data);
        const brand = data?.organization?.brand_name || data?.organization?.name || 'QRHub';
        if (data?.name) document.title = `${data.name} · ${brand}`;
        return;
      }

      if (canonical && host !== canonical) {
        // Visitor reached the landing on the wrong host (qrhub.it,
        // qrhub-app.vercel.app, etc.). Redirect to the org's canonical domain.
        window.location.replace(`https://${canonical}${window.location.pathname}${window.location.search || ''}`);
        return;
      }

      // No canonical_host configured for this vendor's org. We deliberately
      // refuse to serve the landing anywhere except local/preview to keep the
      // platform separate from tenant content. We point the admin at the
      // preview workflow so they can still see what their landing looks like.
      setBlockedReason(
        "L'organizzazione non ha ancora configurato un dominio personalizzato per pubblicare le proprie landing. Gli admin possono visualizzare un'anteprima dalla sezione Venditori del pannello."
      );
      setLoading(false);
    } catch (e) {
      console.error('Vendor not found');
    } finally {
      setLoading(false);
    }
  };

  // Quick helper — admin preview sessions never write analytics events.
  // Reading the URL each call keeps it correct even before React state settles.
  const isPreviewSession = () => {
    try {
      return (new URLSearchParams(window.location.search).get('preview') || '') !== '';
    } catch { return false; }
  };

  // Inject per-vendor PWA manifest + Apple touch icon as soon as we know who
  // the vendor is. Android reads <link rel=manifest> for the home-screen
  // shortcut icon, iOS reads <link rel=apple-touch-icon>. Both override
  // QRHub's default favicon so the customer sees the org's own logo on
  // their phone after "Add to Home Screen".
  useEffect(() => {
    if (!vendor?.id) return;
    // CRITICAL: the manifest MUST be served from the SAME ORIGIN as the
    // landing page, otherwise Chrome falls back to a legacy WebAPK build
    // that Play Protect on recent Samsung/Android 14+ devices blocks with
    // the "App non sicura · versione precedente di Android" banner.
    // The Vercel rewrite (/api/* → qrhub.fly.dev/api/*) lets us use a
    // relative URL here so the manifest is fetched from app.vdn.srl
    // (or whatever custom domain the tenant uses).
    const manifestHref = `/api/manifest/v/${vendor.id}`;
    const iconUrl = vendor.organization?.pwa_icon_url || vendor.organization?.logo_url || '';
    const themeColor = vendor.organization?.primary_color || '#F96815';

    // Manifest
    let manifestLink = document.querySelector('link[data-qrhub-manifest]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.setAttribute('data-qrhub-manifest', '1');
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestHref;

    // Apple touch icon (iOS picks this one — it ignores the manifest icons)
    let appleIcon = document.querySelector('link[data-qrhub-apple]');
    if (!appleIcon) {
      appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      appleIcon.setAttribute('data-qrhub-apple', '1');
      document.head.appendChild(appleIcon);
    }
    appleIcon.href = iconUrl;

    // Theme color = brand color (status bar tint when app is launched standalone)
    let themeMeta = document.querySelector('meta[data-qrhub-theme]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      themeMeta.setAttribute('data-qrhub-theme', '1');
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = themeColor;

    // Apple-specific tags for fullscreen behaviour
    let mobileWebApp = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
    if (!mobileWebApp) {
      mobileWebApp = document.createElement('meta');
      mobileWebApp.name = 'apple-mobile-web-app-capable';
      mobileWebApp.content = 'yes';
      document.head.appendChild(mobileWebApp);
    }
    let mobileWebTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!mobileWebTitle) {
      mobileWebTitle = document.createElement('meta');
      mobileWebTitle.name = 'apple-mobile-web-app-title';
      document.head.appendChild(mobileWebTitle);
    }
    mobileWebTitle.content = vendor.name || vendor.organization?.brand_name || 'Contatto';

    // iOS Splash Screens — inject 8 <link rel="apple-touch-startup-image">
    // entries, one per supported iPhone size. iOS picks the one that matches
    // the device's media query and shows it during PWA launch instead of a
    // blank white screen. The PNG is generated server-side with the org's
    // PWA icon centered on the brand color.
    const SPLASH_SIZES = [
      { w: 640,  h: 1136, cssW: 320, cssH: 568, dpr: 2 },
      { w: 750,  h: 1334, cssW: 375, cssH: 667, dpr: 2 },
      { w: 828,  h: 1792, cssW: 414, cssH: 896, dpr: 2 },
      { w: 1125, h: 2436, cssW: 375, cssH: 812, dpr: 3 },
      { w: 1170, h: 2532, cssW: 390, cssH: 844, dpr: 3 },
      { w: 1179, h: 2556, cssW: 393, cssH: 852, dpr: 3 },
      { w: 1242, h: 2688, cssW: 414, cssH: 896, dpr: 3 },
      { w: 1290, h: 2796, cssW: 430, cssH: 932, dpr: 3 },
    ];
    const splashLinks = [];
    SPLASH_SIZES.forEach(({ w, h, cssW, cssH, dpr }) => {
      const link = document.createElement('link');
      link.rel = 'apple-touch-startup-image';
      link.setAttribute('data-qrhub-splash', '1');
      link.media =
        `(device-width: ${cssW}px) and (device-height: ${cssH}px) ` +
        `and (-webkit-device-pixel-ratio: ${dpr}) ` +
        `and (orientation: portrait)`;
      // Same-origin splash too (consistency with the manifest fix).
      link.href = `/api/splash/v/${vendor.id}/${w}x${h}.png`;
      document.head.appendChild(link);
      splashLinks.push(link);
    });

    // Cleanup on unmount: restore platform manifest to avoid leaking the
    // vendor PWA when the user navigates away (e.g. to /privacy then back
    // to /login on the admin host).
    return () => {
      if (manifestLink && manifestLink.parentNode) manifestLink.parentNode.removeChild(manifestLink);
      if (appleIcon && appleIcon.parentNode) appleIcon.parentNode.removeChild(appleIcon);
      if (themeMeta && themeMeta.parentNode) themeMeta.parentNode.removeChild(themeMeta);
      splashLinks.forEach((l) => { if (l && l.parentNode) l.parentNode.removeChild(l); });
    };
  }, [vendor?.id, vendor?.organization?.pwa_icon_url, vendor?.organization?.logo_url, vendor?.organization?.primary_color, vendor?.name, vendor?.organization?.brand_name]);

  // Treat a hit (page view OR action click) as a "real customer interaction"
  // only when:
  //  - it's the FIRST hit of THIS event type on this vendor from this device, OR
  //  - the previous one was more than VISIT_WINDOW_MS ago.
  // This dedupes refreshes, PWA re-launches and re-tap-on-link-the-same-link
  // for a customer who stays in the store. Different devices = different
  // localStorage = independent counters, so 5 customers in 90 minutes still
  // produce 5 entrances (and 5 WhatsApp clicks if they all click).
  const VISIT_WINDOW_MS = 90 * 60 * 1000; // 90 minutes — typical in-store dwell

  const isNewHit = (eventKey) => {
    const storageKey = `qrhub_last_${eventKey}_${vendorId}`;
    const now = Date.now();
    try {
      const last = parseInt(window.localStorage.getItem(storageKey) || '0', 10);
      window.localStorage.setItem(storageKey, String(now));
      return !last || (now - last) > VISIT_WINDOW_MS;
    } catch {
      try {
        const last = parseInt(window.sessionStorage.getItem(storageKey) || '0', 10);
        window.sessionStorage.setItem(storageKey, String(now));
        return !last;
      } catch {
        return true;
      }
    }
  };

  const trackPageView = async () => {
    if (isPreviewSession()) return;
    if (!isNewHit('page_view')) return;
    try {
      await axios.post(`${API}/analytics`, { vendor_id: vendorId, event_type: 'page_view' });
    } catch (e) {}
  };

  const trackClick = async (type) => {
    if (isPreviewSession()) return;
    if (!isNewHit(`${type}_click`)) return;
    try {
      await axios.post(`${API}/analytics`, { vendor_id: vendorId, event_type: `${type}_click` });
    } catch (e) {}
  };

  const setupPWA = () => {
    try {
      // Register the bare-minimum Service Worker. This is REQUIRED for
      // Samsung Internet to consider the site as a "modern WebAPK target":
      // without an SW it falls back to the legacy install path that
      // produces an APK with old targetSdk, which Play Protect on Android
      // 14+ Samsung devices then blocks with "App non sicura · versione
      // precedente di Android". See public/qrhub-sw.js for the rationale.
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/qrhub-sw.js', { scope: '/' })
          .catch(() => { /* SW failed — install will still work on Chrome */ });
      }
      // The visitor already opened this landing from the saved PWA on their
      // home screen — never re-prompt to install (neither Android nor iOS).
      // We check both signals: Chrome/Android/desktop expose `display-mode:
      // standalone`, while iOS Safari only exposes the legacy
      // `navigator.standalone` flag and ignores the media query.
      const detectedStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.navigator.standalone === true ||
        document.referrer.startsWith('android-app://');
      if (detectedStandalone) {
        // Mark <body> so our CSS can apply iOS safe-area-inset padding to the
        // sticky header & bottom banners (iOS Safari ignores the
        // `(display-mode: standalone)` media query, so we need a JS hook).
        document.body.classList.add('qrhub-pwa-standalone');
        // Sync the React state too so the "+" install button auto-hides.
        setIsStandalone(true);
        return;
      }

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        // Don't auto-show the bottom Android banner anymore — the universal
        // "+" button in the header opens the AddToHomeDialog which uses this
        // prompt natively when available. Keeping just deferredPrompt cached.
      });
      // Clear cached prompt if the app gets installed while the page is open.
      window.addEventListener('appinstalled', () => {
        setDeferredPrompt(null);
        // Also flip the standalone flag so the "+" install button vanishes
        // even before the user reloads the page in the installed app.
        setIsStandalone(true);
        // Track the install as a one-off analytics event so the admin can
        // count how many PWA installs each landing generates. We bypass the
        // 90-min anti-duplicate filter on purpose: an `appinstalled` event
        // fires at most once per device anyway.
        try {
          axios.post(`${API}/analytics`, { vendor_id: vendorId, event_type: 'pwa_install' }).catch(() => {});
        } catch (e) {}
      });
      // iOS auto-popup banner disabled: the "+" button in the header now
      // serves as a universal manual entry point for all devices.
    } catch (e) {}
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch (e) {}
    setDeferredPrompt(null);
  };

  const handleShare = async () => {
    const brand = vendor?.organization?.brand_name || vendor?.organization?.name || 'QRHub';
    const shareData = {
      title: `${vendor?.name || 'Contattami'} · ${brand}`,
      text: `Contatta ${vendor?.name || 'il tuo consulente'} di ${brand}`,
      url: window.location.href,
    };
    trackClick('share');
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (e) {
      // User cancelled or share unavailable — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(shareData.url);
      // Lightweight inline feedback without pulling a toast library on the public page
      const note = document.createElement('div');
      note.textContent = 'Link copiato negli appunti';
      note.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;z-index:9999;box-shadow:0 6px 24px rgba(0,0,0,.25)';
      document.body.appendChild(note);
      setTimeout(() => note.remove(), 1800);
    } catch (e) {
      window.prompt('Copia il link:', shareData.url);
    }
  };

  if (loading) return <div className="vendor-loading"><div className="loading-spinner"></div></div>;
  if (blockedReason) {
    return (
      <div data-testid="vendor-landing-blocked" style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(210,250,70,0.10), transparent 70%), #0a0a0b',
        color: '#e6e6ea',
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 18,
            background: 'radial-gradient(circle at 30% 30%, rgba(210,250,70,0.25), rgba(210,250,70,0.05))',
            border: '1px solid rgba(210,250,70,0.25)',
            color: '#D2FA46',
            marginBottom: 24,
          }}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.2"/>
              <rect x="14" y="3" width="7" height="7" rx="1.2"/>
              <rect x="3" y="14" width="7" height="7" rx="1.2"/>
              <line x1="14" y1="14" x2="21" y2="14"/>
              <line x1="14" y1="18" x2="18" y2="18"/>
              <line x1="14" y1="21" x2="21" y2="21"/>
            </svg>
          </div>
          <div style={{
            fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: '#D2FA46', marginBottom: 10, fontWeight: 600,
          }}>
            Pagina riservata
          </div>
          <h1 style={{
            fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
            margin: '0 0 14px', lineHeight: 1.15, color: '#fff',
          }}>
            Landing non disponibile su questo dominio
          </h1>
          <p style={{
            color: '#8a8a92', fontSize: 15, lineHeight: 1.6, margin: '0 0 32px',
          }}>
            {blockedReason}
          </p>
          <a href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '12px 22px', borderRadius: 999,
            background: '#D2FA46', color: '#0a0a0b',
            textDecoration: 'none', fontWeight: 600, fontSize: 14,
            boxShadow: '0 0 0 1px rgba(210,250,70,0.4), 0 8px 24px rgba(210,250,70,0.22)',
            transition: 'transform .15s, background .15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#dcff5e'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#D2FA46'; e.currentTarget.style.transform = 'translateY(0)'; }}
          data-testid="vendor-blocked-cta">
            Scopri QRHub
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </a>
          <div style={{
            marginTop: 40, paddingTop: 24,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 12, color: '#6a6a72',
          }}>
            QRHub è una piattaforma multi-tenant.<br />
            Le landing dei venditori vengono pubblicate esclusivamente sui domini delle rispettive organizzazioni.
          </div>
        </div>
      </div>
    );
  }
  if (!vendor) return <div className="vendor-error"><h1>Venditore non trovato</h1></div>;

  // DPA gating: backend marks the response with inactive_reason='dpa_pending'
  // when the controller org hasn't signed the latest DPA yet. We hide the
  // public landing in that case so visitors don't see content the org hasn't
  // legally cleared. Preview mode (admin) still shows the real landing so
  // operators can QA before going live.
  if (vendor.inactive_reason === 'dpa_pending' && !previewMode) {
    const brand = vendor?.organization?.brand_name || vendor?.organization?.name || 'questa organizzazione';
    return (
      <div data-testid="vendor-landing-dpa-pending" style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(210,250,70,0.10), transparent 70%), #0a0a0b',
        color: '#e6e6ea',
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 18,
            background: 'radial-gradient(circle at 30% 30%, rgba(210,250,70,0.25), rgba(210,250,70,0.05))',
            border: '1px solid rgba(210,250,70,0.25)',
            color: '#D2FA46',
            marginBottom: 24,
          }}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <circle cx="12" cy="16" r="0.6" fill="currentColor"/>
            </svg>
          </div>
          <div style={{
            fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: '#D2FA46', marginBottom: 10, fontWeight: 600,
          }}>
            Servizio in attivazione
          </div>
          <h1 style={{
            fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
            margin: '0 0 14px', lineHeight: 1.15, color: '#fff',
          }}>
            Servizio non ancora attivo
          </h1>
          <p style={{
            color: '#8a8a92', fontSize: 15, lineHeight: 1.6, margin: '0 0 32px',
          }}>
            L'organizzazione <strong style={{ color: '#e6e6ea' }}>{brand}</strong> deve
            completare la configurazione del servizio (Accordo sul Trattamento Dati) prima
            che questa landing diventi pubblica. Torna a trovarci tra qualche giorno.
          </p>
          <a href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '12px 22px', borderRadius: 999,
            background: '#D2FA46', color: '#0a0a0b',
            textDecoration: 'none', fontWeight: 600, fontSize: 14,
            boxShadow: '0 0 0 1px rgba(210,250,70,0.4), 0 8px 24px rgba(210,250,70,0.22)',
            transition: 'transform .15s, background .15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#dcff5e'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#D2FA46'; e.currentTarget.style.transform = 'translateY(0)'; }}
          data-testid="vendor-dpa-pending-cta">
            Scopri QRHub
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="vendor-landing"
      style={{
        '--brand-color': vendor.organization?.primary_color || '#F96815',
        '--brand-secondary': vendor.organization?.secondary_color || vendor.organization?.primary_color || '#F96815',
        '--cta-arrow-color': vendor.organization?.cta_arrow_color || '#4A2D8C',
      }}
    >
      {previewMode && (
        <div
          data-testid="vendor-preview-banner"
          style={{
            position: 'sticky', top: 0, zIndex: 10000,
            background: 'linear-gradient(90deg, #D2FA46, #bce63d)',
            color: '#0a0a0b',
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
              background: '#0a0a0b', color: '#D2FA46',
              padding: '3px 8px', borderRadius: 999,
              textTransform: 'uppercase', flexShrink: 0,
            }}>Anteprima</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {vendor.inactive_reason === 'dpa_pending'
                ? 'DPA non ancora accettato dall\'organizzazione · landing visibile solo agli admin.'
                : 'Stai vedendo questa landing come admin. I visitatori normali la vedono solo sul dominio dell\'organizzazione.'}
            </span>
          </div>
          <a
            href="/dashboard/vendors"
            style={{
              fontSize: 12, fontWeight: 700,
              color: '#0a0a0b', textDecoration: 'none',
              background: 'rgba(0,0,0,0.12)',
              padding: '6px 12px', borderRadius: 999,
              flexShrink: 0,
            }}
            data-testid="vendor-preview-back"
          >
            ← Torna al pannello
          </a>
        </div>
      )}

      <header className="vendor-header">
        <div className="header-content">
          {vendor.organization?.logo_url ? (
            <img
              src={vendor.organization.logo_url}
              alt={vendor.organization?.brand_name || vendor.organization?.name || 'Logo'}
              className="vendor-logo-img"
              style={{ maxHeight: 48, width: 'auto', objectFit: 'contain' }}
            />
          ) : (
            // Fallback inline brand mark — used only when an org hasn't uploaded a logo yet.
            <div className="vendor-logo-fallback" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 10,
              background: vendor.organization?.primary_color || '#F96815',
              color: '#fff',
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: 0.4,
            }}>
              {(vendor.organization?.brand_name || vendor.organization?.name || 'QRHub').slice(0, 24)}
            </div>
          )}
          <div className="header-actions">
            {(vendor.appointment_url || vendor.store?.appointment_url) && (
              <a
                href={vendor.appointment_url || vendor.store?.appointment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="map-btn"
                onClick={() => trackClick('appointment')}
                aria-label="Prenota appuntamento"
                title="Prenota appuntamento in negozio"
                data-testid="vendor-appointment-button"
              >
                <CalendarClock className="h-6 w-6" />
              </a>
            )}
            {vendor.google_maps_url && (
              <a href={vendor.google_maps_url} target="_blank" rel="noopener noreferrer" className="map-btn" onClick={() => trackClick('maps')}>
                <MapPin className="h-6 w-6" />
              </a>
            )}
            {vendor.store && vendor.store.name && (() => {
              const status = vendor.store.hours ? computeOpenStatus(vendor.store.hours) : null;
              const dotColor = status?.status === 'open' ? '#22c55e'
                              : status?.status === 'closing_soon' ? '#f59e0b'
                              : status?.status === 'opening_soon' ? '#f59e0b'
                              : status?.status === 'closed' ? '#ef4444'
                              : null;
              return (
                <button
                  type="button"
                  onClick={() => { setStoreOpen(true); trackClick('store_info'); }}
                  className="map-btn"
                  aria-label="Info negozio"
                  title={status ? `${status.label} · ${status.detail}` : 'Info negozio'}
                  data-testid="vendor-store-button"
                  style={{ position: 'relative' }}
                >
                  <StoreIcon className="h-6 w-6" />
                  {dotColor && (
                    <span
                      data-testid="vendor-store-status-dot"
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 10, height: 10, borderRadius: '50%',
                        background: dotColor,
                        border: '2px solid #fff',
                        boxShadow: status.status === 'open' ? `0 0 0 2px ${dotColor}55` : 'none',
                      }}
                    />
                  )}
                </button>
              );
            })()}
            {/* "+" install button — hidden when the PWA is already
                installed (standalone mode). Pointless to prompt for an
                action the user has already completed. */}
            {!isStandalone && (
              <button
                type="button"
                onClick={() => setAddToHomeOpen(true)}
                className="map-btn"
                aria-label="Aggiungi alla schermata Home"
                title="Salva sul telefono"
                data-testid="vendor-add-to-home-button"
                style={{ background: 'var(--brand-secondary)' }}
              >
                <Plus className="h-6 w-6" />
              </button>
            )}
            <button
              type="button"
              onClick={handleShare}
              className="map-btn"
              aria-label="Condividi"
              title="Condividi questa pagina"
              data-testid="vendor-share-button"
              style={{ background: 'var(--brand-secondary)' }}
            >
              <Share2 className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <div className="hero">
        <div className="hero-eyebrow">{(vendor.organization?.landing_headline || '').trim() || 'Il tuo consulente di fiducia'}</div>
        {vendor.profile_image_url ? (
          <div className="hero-avatar" data-testid="vendor-hero-avatar">
            <div className="hero-avatar-ring">
              <img src={vendor.profile_image_url} alt={vendor.name} loading="lazy" />
            </div>
          </div>
        ) : (
          // Fallback: brand-tinted vector mascot — friendly, unisex, unique to
          // QRHub (NOT a Will clone). Keeps the hero composition consistent
          // for consultants who haven't uploaded a profile photo yet.
          <div className="hero-avatar" data-testid="vendor-hero-avatar-default">
            <div className="hero-avatar-ring">
              <ConsultantAvatar
                brandColor={vendor.organization?.primary_color || '#F96815'}
                gender={vendor.default_avatar_gender || 'neutral'}
                className="w-full h-full"
              />
            </div>
          </div>
        )}
        <div className="hero-title">Ciao, da oggi puoi restare in contatto con <br/> {vendor.name}.</div>
        {vendor.bio && <div className="hero-sub">{vendor.bio}</div>}
        {!vendor.bio && <div className="hero-sub">Rimani in contatto. Salva questa pagina e interagisci direttamente.</div>}
      </div>

      <div className="cards">
        {vendor.whatsapp && (
          <a className="card" href={`${vendor.whatsapp}${vendor.whatsapp_message ? `?text=${encodeURIComponent(vendor.whatsapp_message)}` : ''}`} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('whatsapp')}>
            <div className="card-main">
              <BrandSocialIcon platform="whatsapp" size={56} className="!rounded-[14px] flex-shrink-0" />
              <div><div className="card-label">Scrivici su WhatsApp</div><div className="card-sublabel">Risposta in pochi minuti</div></div>
            </div>
            <div className="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="var(--cta-arrow-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
          </a>
        )}
        {vendor.google_review && (
          <a className="card" href={vendor.google_review} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('review')}>
            <div className="card-main">
              <BrandSocialIcon platform="google" size={56} className="!rounded-[14px] flex-shrink-0" />
              <div><div className="card-label">Lascia una recensione</div><div className="card-sublabel">Aiutaci su Google</div></div>
            </div>
            <div className="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="var(--cta-arrow-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
          </a>
        )}
        {vendor.instagram && (
          <a className="card" href={vendor.instagram} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('instagram')}>
            <div className="card-main">
              <BrandSocialIcon platform="instagram" size={56} className="!rounded-[14px] flex-shrink-0" />
              <div><div className="card-label">Seguici su Instagram</div><div className="card-sublabel">Offerte esclusive</div></div>
            </div>
            <div className="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="var(--cta-arrow-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
          </a>
        )}
        {vendor.facebook && (
          <a className="card" href={vendor.facebook} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('facebook')}>
            <div className="card-main">
              <BrandSocialIcon platform="facebook" size={56} className="!rounded-[14px] flex-shrink-0" />
              <div><div className="card-label">Metti Like</div><div className="card-sublabel">Resta aggiornato</div></div>
            </div>
            <div className="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="var(--cta-arrow-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
          </a>
        )}
        {vendor.tiktok && (
          <a className="card" href={vendor.tiktok} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('tiktok')}>
            <div className="card-main">
              <BrandSocialIcon platform="tiktok" size={56} className="!rounded-[14px] flex-shrink-0" />
              <div><div className="card-label">Seguici su TikTok</div><div className="card-sublabel">Video e contenuti</div></div>
            </div>
            <div className="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="var(--cta-arrow-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
          </a>
        )}

        {/* Push opt-in — sits at the end of the action cards so the user has
            already seen what this consultant offers before opting into
            ongoing notifications. */}
        <div className="px-1 pt-1">
          <PushSubscribe
            vendorId={vendor.id}
            vendorName={vendor.name}
            brandColor={vendor.organization?.primary_color || '#F96815'}
          />
        </div>
      </div>

      {(vendor.posts && vendor.posts.length > 0) && (
        <PostsCarousel
          posts={vendor.posts}
          whatsappBase={vendor.whatsapp || ''}
          defaultMessage={vendor.whatsapp_message || ''}
          onCtaClick={() => trackClick('post_cta')}
        />
      )}

      <footer className="vendor-footer">
        {vendor.organization?.gdpr_status?.controller_verified && (
          <a href={`/v/${vendorId}/privacy`}
              className={`vendor-trust-badge vendor-trust-${vendor.organization.gdpr_status.completeness}`}
              data-testid="vendor-trust-badge"
              title="Il titolare del trattamento ha completato l'identificazione richiesta dall'art. 13 GDPR. Clicca per leggere l'informativa.">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
              <path d="M9 12l2 2 4-4"/>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Titolare verificato
          </a>
        )}

        {/* Identity block — populated when the org filled the GDPR data
            (Sede legale, P.IVA, contatto). Falls back gracefully when fields
            are empty so we never render orphan punctuation. */}
        {(vendor.organization?.legal_name
          || vendor.organization?.vat_number
          || vendor.organization?.legal_address
          || vendor.organization?.privacy_contact_email) && (
          <div className="vendor-footer-org" data-testid="vendor-footer-org-info">
            {vendor.organization.legal_name && (
              <div className="vendor-footer-org-name">{vendor.organization.legal_name}</div>
            )}
            <div className="vendor-footer-org-meta">
              {vendor.organization.legal_address && <span>{vendor.organization.legal_address}</span>}
              {vendor.organization.vat_number && (
                <span>P.IVA {vendor.organization.vat_number}</span>
              )}
              {vendor.organization.privacy_contact_email && (
                <a href={`mailto:${vendor.organization.privacy_contact_email}`}>
                  {vendor.organization.privacy_contact_email}
                </a>
              )}
            </div>
          </div>
        )}

        <p>
          <a href={`/v/${vendorId}/privacy`}
              className="vendor-footer-link"
              data-testid="vendor-footer-privacy-link">
            Informativa privacy
          </a>
          <span aria-hidden="true"> · </span>
          <a href={`/v/${vendorId}/privacy#terms`}
              className="vendor-footer-link"
              data-testid="vendor-footer-terms-link">
            Termini & condizioni
          </a>
          {vendor.organization?.privacy_policy_url && (
            <>
              <span aria-hidden="true"> · </span>
              <a href={vendor.organization.privacy_policy_url}
                  target="_blank" rel="noopener noreferrer"
                  className="vendor-footer-link"
                  data-testid="vendor-footer-policy-link">
                Privacy policy estesa
              </a>
            </>
          )}
          <span aria-hidden="true"> · </span>
          Powered by QRHub
        </p>
      </footer>

      <CookieBanner
        vendorId={vendorId}
        orgId={vendor.organization?.brand_name || vendorId}
        banner={vendor.organization?.cookie_banner}
        primaryColor={vendor.organization?.primary_color}
      />

      {storeOpen && vendor.store && (() => {
        const hours = vendor.store.hours || null;
        const status = hours ? computeOpenStatus(hours) : null;
        const statusColor = status?.status === 'open' ? '#16a34a'
                          : status?.status === 'closing_soon' ? '#f59e0b'
                          : status?.status === 'opening_soon' ? '#f59e0b'
                          : '#ef4444';
        const statusBg = status?.status === 'open' ? '#dcfce7'
                       : status?.status === 'closing_soon' ? '#fef3c7'
                       : status?.status === 'opening_soon' ? '#fef3c7'
                       : '#fee2e2';
        // Render structured hours as a 7-row schedule, highlighting today's row.
        const dayLabels = [
          { key: 'mon', label: 'Lun', full: 'Lunedì' },
          { key: 'tue', label: 'Mar', full: 'Martedì' },
          { key: 'wed', label: 'Mer', full: 'Mercoledì' },
          { key: 'thu', label: 'Gio', full: 'Giovedì' },
          { key: 'fri', label: 'Ven', full: 'Venerdì' },
          { key: 'sat', label: 'Sab', full: 'Sabato' },
          { key: 'sun', label: 'Dom', full: 'Domenica' },
        ];
        const dayOrder = ['sun','mon','tue','wed','thu','fri','sat'];
        const todayKey = dayOrder[new Date().getDay()];
        const formatDay = (d) => {
          if (!d) return '—';
          if (d.closed) return 'Chiuso';
          if (!d.open || !d.close) return '—';
          if (d.break_start && d.break_end) {
            return `${d.open}-${d.break_start} / ${d.break_end}-${d.close}`;
          }
          return `${d.open}-${d.close}`;
        };
        return (
        <div
          className="store-modal-backdrop"
          onClick={() => setStoreOpen(false)}
          data-testid="vendor-store-modal"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            zIndex: 1000, animation: 'fadeIn .2s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '20px 20px 0 0',
              width: '100%', maxWidth: 480, padding: '20px 20px 32px',
              boxShadow: '0 -8px 24px rgba(0,0,0,0.15)',
              animation: 'slideUp .25s ease-out',
              maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <div style={{
              width: 40, height: 4, background: '#ddd', borderRadius: 2,
              margin: '0 auto 16px',
            }} />
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <h3 style={{
                margin: 0, fontSize: 18, fontWeight: 700,
                color: vendor.organization?.primary_color || '#F96815',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <StoreIcon size={20} />
                {vendor.store.name || 'Il tuo negozio'}
              </h3>
              <button onClick={() => setStoreOpen(false)} aria-label="Chiudi"
                       style={{ background: 'transparent', border: 0, padding: 6, cursor: 'pointer', color: '#666' }}>
                <X size={20} />
              </button>
            </div>

            {status && (
              <div data-testid="vendor-store-status" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 999,
                background: statusBg, color: statusColor,
                fontSize: 12, fontWeight: 700, marginBottom: 14,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: statusColor,
                  boxShadow: status.status === 'open' ? `0 0 0 3px ${statusColor}33` : 'none',
                  animation: status.status === 'open' ? 'pulse 2s ease-in-out infinite' : 'none',
                }} />
                {status.label}
                {status.detail && (
                  <span style={{ fontWeight: 500, opacity: 0.85, marginLeft: 4 }}>· {status.detail}</span>
                )}
              </div>
            )}

            {hours ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }} data-testid="vendor-store-hours-table">
                <Clock size={16} style={{ marginTop: 4, color: '#888', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  {dayLabels.map((d) => {
                    const isToday = d.key === todayKey;
                    return (
                      <div key={d.key} style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: '1px solid #f0f0f0',
                        fontSize: 13.5,
                        fontWeight: isToday ? 700 : 400,
                        color: isToday ? '#111' : '#444',
                      }} data-testid={`vendor-hours-row-${d.key}`}>
                        <span>{d.full}{isToday && <span style={{ color: statusColor, marginLeft: 6, fontSize: 11 }}>· oggi</span>}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDay(hours[d.key])}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : vendor.store.hours_text ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Clock size={16} style={{ marginTop: 2, color: '#888', flexShrink: 0 }} />
                <div style={{
                  fontSize: 14, color: '#222', lineHeight: 1.55, whiteSpace: 'pre-line',
                }} data-testid="vendor-store-hours">
                  {vendor.store.hours_text}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#888', textAlign: 'center', padding: '12px 0' }}>
                Orari non disponibili
              </div>
            )}
          </div>
        </div>
        );
      })()}

      <AddToHomeDialog
        open={addToHomeOpen}
        onClose={() => setAddToHomeOpen(false)}
        deferredPrompt={deferredPrompt}
        vendorName={vendor?.organization?.brand_name || vendor?.name}
      />
    </div>
  );
};

export default VendorLanding;