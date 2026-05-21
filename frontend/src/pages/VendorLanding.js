import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { MapPin, Share2 } from 'lucide-react';
import PostsCarousel from '../components/PostsCarousel';
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
  const [showAndroidBanner, setShowAndroidBanner] = useState(false);
  const [showIosBanner, setShowIosBanner] = useState(false);

  useEffect(() => {
    fetchVendor();
    trackPageView();
    setupPWA();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const fetchVendor = async () => {
    try {
      const { data } = await axios.get(`${API}/vendors/${vendorId}`);
      setVendor(data);
      // Dynamic page title: "{Vendor Name} - {Brand}" so it shows nicely in browser tabs,
      // bookmarks, OS share sheets, and when the QR code is scanned.
      const brand = data?.organization?.brand_name || data?.organization?.name || 'QRHub';
      if (data?.name) document.title = `${data.name} · ${brand}`;
    } catch (e) {
      console.error('Vendor not found');
    } finally {
      setLoading(false);
    }
  };

  const trackPageView = async () => {
    try {
      await axios.post(`${API}/analytics`, { vendor_id: vendorId, event_type: 'page_view' });
    } catch (e) {}
  };

  const trackClick = async (type) => {
    try {
      await axios.post(`${API}/analytics`, { vendor_id: vendorId, event_type: `${type}_click` });
    } catch (e) {}
  };

  const setupPWA = () => {
    try {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setTimeout(() => setShowAndroidBanner(true), 1500);
      });
      const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      if (isIos && !isStandalone) setTimeout(() => setShowIosBanner(true), 1500);
    } catch (e) {}
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowAndroidBanner(false);
    } catch (e) {
      setShowAndroidBanner(false);
    }
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
  if (!vendor) return <div className="vendor-error"><h1>Venditore non trovato</h1></div>;

  return (
    <div className="vendor-landing">
      {showAndroidBanner && (
        <div id="install-banner">
          <div className="banner-inner">
            <div className="banner-icon"><svg viewBox="0 0 28 28" fill="none"><path d="M4 10 L10 22 L14 14 L18 22 L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg></div>
            <div className="banner-text"><div className="banner-title">Aggiungi alla Home</div><div className="banner-sub">Accedi in un tap</div></div>
            <div className="banner-actions">
              <button className="btn-dismiss" onClick={() => setShowAndroidBanner(false)}>Dopo</button>
              <button className="btn-install" onClick={handleInstall}>Installa</button>
            </div>
          </div>
        </div>
      )}
      {showIosBanner && (
        <div id="ios-banner">
          <div className="ios-inner">
            <div className="ios-header">
              <div className="ios-title">Aggiungi alla Home</div>
              <button className="ios-close" onClick={() => setShowIosBanner(false)}>×</button>
            </div>
            <div className="ios-steps">
              <div className="ios-step"><div className="ios-step-num">1</div><span>Tocca il tasto Condividi in basso</span></div>
              <div className="ios-step"><div className="ios-step-num">2</div><span>Scegli "Aggiungi alla schermata Home"</span></div>
              <div className="ios-step"><div className="ios-step-num">3</div><span>Tocca Aggiungi</span></div>
            </div>
          </div>
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
            {vendor.google_maps_url && (
              <a href={vendor.google_maps_url} target="_blank" rel="noopener noreferrer" className="map-btn" onClick={() => trackClick('maps')}>
                <MapPin className="h-6 w-6" />
              </a>
            )}
            <button
              type="button"
              onClick={handleShare}
              className="map-btn"
              aria-label="Condividi"
              title="Condividi questa pagina"
              data-testid="vendor-share-button"
            >
              <Share2 className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <div className="hero">
        <div className="hero-eyebrow">{(vendor.organization?.landing_headline || '').trim() || 'Il tuo consulente di fiducia'}</div>
        {vendor.profile_image_url && (
          <div className="hero-avatar" data-testid="vendor-hero-avatar">
            <div className="hero-avatar-ring">
              <img src={vendor.profile_image_url} alt={vendor.name} loading="lazy" />
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
            <div className="card-main"><div className="card-icon"><svg viewBox="0 0 56 56" fill="none"><rect x="4" y="4" width="48" height="48" rx="12" stroke="#F96815" strokeWidth="2.2" fill="none"/><path d="M28 14C20.268 14 14 20.268 14 28C14 30.524 14.688 32.892 15.892 34.92L14 42L21.352 40.144C23.316 41.224 25.584 41.84 28 41.84C35.732 41.84 42 35.572 42 27.84C42 20.108 35.732 14 28 14Z" stroke="#F96815" strokeWidth="2" fill="none" strokeLinejoin="round"/><path d="M23 24.5C23 24.5 23.5 23 25 23C26.5 23 27 24 27.5 25.5C28 27 27 28 26.5 28.5C26 29 25.5 29.5 26.5 31C27.5 32.5 29.5 34 31 34.5C32.5 35 33 34 33.5 33.5C34 33 34.5 32 34.5 32" stroke="#F96815" strokeWidth="2" strokeLinecap="round" fill="none"/></svg></div><div><div className="card-label">Scrivici su WhatsApp</div><div className="card-sublabel">Risposta in pochi minuti</div></div></div>
            <div className="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="#4A2D8C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
          </a>
        )}
        {vendor.google_review && (
          <a className="card" href={vendor.google_review} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('review')}>
            <div className="card-main"><div className="card-icon"><svg viewBox="0 0 56 56" fill="none"><rect x="4" y="4" width="48" height="48" rx="12" stroke="#F96815" strokeWidth="2.2" fill="none"/><path d="M28 14L31.09 22.26H40L33.45 27.14L36.55 35.4L28 30 19.45 35.4 22.55 27.14 16 22.26H24.91L28 14Z" stroke="#F96815" strokeWidth="2" strokeLinejoin="round" fill="none"/><path d="M22 42H34" stroke="#F96815" strokeWidth="2" strokeLinecap="round"/></svg></div><div><div className="card-label">Lascia una recensione</div><div className="card-sublabel">Aiutaci su Google</div></div></div>
            <div className="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="#4A2D8C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
          </a>
        )}
        {vendor.instagram && (
          <a className="card" href={vendor.instagram} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('instagram')}>
            <div className="card-main"><div className="card-icon"><svg viewBox="0 0 56 56" fill="none"><rect x="4" y="4" width="48" height="48" rx="12" stroke="#F96815" strokeWidth="2.2" fill="none"/><rect x="16" y="16" width="24" height="24" rx="7" stroke="#F96815" strokeWidth="2" fill="none"/><circle cx="28" cy="28" r="5.5" stroke="#F96815" strokeWidth="2" fill="none"/><circle cx="35.5" cy="20.5" r="1.5" fill="#F96815"/></svg></div><div><div className="card-label">Seguici su Instagram</div><div className="card-sublabel">Offerte esclusive</div></div></div>
            <div className="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="#4A2D8C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
          </a>
        )}
        {vendor.facebook && (
          <a className="card" href={vendor.facebook} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('facebook')}>
            <div className="card-main"><div className="card-icon"><svg viewBox="0 0 56 56" fill="none"><rect x="4" y="4" width="48" height="48" rx="12" stroke="#F96815" strokeWidth="2.2" fill="none"/><path d="M31 42V30H34.5L35 26H31V23.5C31 22.4 31.3 21.7 33 21.7H35V18.1C34.6 18.1 33.3 18 31.8 18C28.6 18 26.5 19.9 26.5 23.2V26H23V30H26.5V42H31Z" stroke="#F96815" strokeWidth="1.8" strokeLinejoin="round" fill="none"/></svg></div><div><div className="card-label">Metti Like</div><div className="card-sublabel">Resta aggiornato</div></div></div>
            <div className="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="#4A2D8C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
          </a>
        )}
        {vendor.tiktok && (
          <a className="card" href={vendor.tiktok} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('tiktok')}>
            <div className="card-main"><div className="card-icon"><svg viewBox="0 0 56 56" fill="none"><rect x="4" y="4" width="48" height="48" rx="12" stroke="#F96815" strokeWidth="2.2" fill="none"/><path d="M32 18v8c2 1.5 4 2 6 2v-4c-2-.5-3.5-2-4-4h-4v12c0 2-1.5 3.5-3.5 3.5S23 34 23 32s1.5-3.5 3.5-3.5c.5 0 1 .1 1.5.3V25c-4-.5-7 2.5-7 6.5 0 4 3 7 7 7s7-3 7-7V24c1.5 1 3.5 2 5.5 2v-4c-2.5 0-4.5-1.5-5.5-4h-3z" stroke="#F96815" strokeWidth="1.8" fill="none"/></svg></div><div><div className="card-label">Seguici su TikTok</div><div className="card-sublabel">Video e contenuti</div></div></div>
            <div className="card-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="#4A2D8C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>
          </a>
        )}
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
        <p>
          <a href={`/v/${vendorId}/privacy`}
              className="vendor-footer-link"
              data-testid="vendor-footer-privacy-link">
            Informativa privacy
          </a>
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
    </div>
  );
};

export default VendorLanding;