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
          <svg className="vendor-logo" xmlns="http://www.w3.org/2000/svg" height="48" viewBox="0 0 429.748 266.055" width="80">
            <path d="M403.425 84.429l-4.48-3.52c.473-.811 1.307-2.069 2.057-3.129 4.361-6.321 12.539-18.273 12.539-35.336 0-9.799-3.581-20.432-12.211-28.601C392.707 5.672 379.068-.004 359.064 0c-18.979.003-40.348 6.236-58.813 17.152-8.281 4.911-15.1 10.203-19.875 15.284-4.76 5.081-7.52 9.941-7.533 14.124-.005 2.028.777 3.893 2.253 5.355 1.171 1.151 2.731 2.033 4.62 2.719 1.976-12.844 50.716-40.768 86.408-36.677 15.96 1.829 27.84 13.709 26.188 30.167-1.579 15.743-17.604 24.291-31.401 28.411-7.699 2.299-15.428 4.532-22.815 7.736-3.627 1.572-7.292 3.36-10.469 5.732-2.316 1.728-5.316 3.972-5.151 7.213 5.459 3.715 14.124 5.869 19.76 6.276a197.01 197.01 0 0 0 10.991.567c10.537.317 21.607.677 31.447 4.896 13.808 5.921 21.933 20.196 18.96 35.137-3.823 19.207-23.197 30.829-41.181 34.159-19.235 3.563-43.365.775-56.068-15.827-5.192-6.784-8.464-15.879-7.048-24.456 1.573-9.527 8.267-18.641 17.913-21.08 6.084-1.537 12.493-.113 17.325 3.48a25.55 25.55 0 0 0-4.184-4.644c-5.588-4.851-13.445-7.576-22.56-7.576-11.249-.003-20.277 4.667-26.459 11.592s-9.545 16.089-9.551 25.119c-.003 14.208 6.556 28.479 19.328 39.176 12.779 10.699 31.764 17.824 56.621 17.824 19.705-.001 39.583-6.507 54.627-17.807 12.461-9.387 27.357-26.496 27.351-54.561.007-25.681-17.237-38.376-26.323-45.06m-65.349 55.592c-.092-2.677-.207-3.645-.207-3.645-.141-1.149-.357-2.296-.687-3.407-2.863-9.671-14.393-13.907-22.735-7.983-6.915 4.911-9.631 14.337-7.127 22.279 6.369 20.184 29.703 24.375 48.103 21.601 9.059-1.365 17.971-4.633 25.175-10.404 6.971-5.585 12.271-14.204 10.545-23.232-1.144-13.537-11.411-20.277-28.149-22.221.795 1.632 3.376 13.491-5.051 21.149-5.149 4.681-10.647 5.92-18.047 5.931-.288 0-1.821-.068-1.821-.068M33.64 126.948c1.06.82 2.24 1.691 3.365 2.42 2.236 1.481 4.471 2.757 6.848 3.989 2.371 1.244 4.793 2.391 7.281 3.351 0 0 3.491 1.435 7.575 2.481a68.86 68.86 0 0 0 7.781 1.495c2.617.356 5.249.435 7.877.4 0 0 4.34-.129 7.84-.777 8.475-1.4 17.097-7.74 19.307-9.312l3.537-2.512c1.288-.891 2.613-1.744 4.001-2.521 2.765-1.561 5.749-2.872 8.943-3.72 3.196-.833 6.183-1.153 9.564-.792.423.033 2.98.289 6.157 1.499 0 0 2.228.856 3.46 1.641a37.43 37.43 0 0 1 4.041 2.965c6.019 5.093 23.636 26.347 28.715 30.893 5.999 5.371 13.533 10.832 19.639 12.451 11.795 3.125 21.096.281 31.681-6.411 11.689-7.391 21.161-18.421 29.22-29.513 8.499-11.701 16.157-24.46 21.151-38.072 2.472-6.737 4.464-14.128 3.133-21.336-.136-.741-.339-1.44-.589-2.099-1.681 3.579-3.488 7.105-5.413 10.573-3.099 5.556-6.499 10.972-10.299 16.16-3.804 5.181-7.989 10.155-12.768 14.691-4.772 4.523-10.16 8.643-16.439 11.669a49.97 49.97 0 0 1-5.317 2.145 42.71 42.71 0 0 1-5.681 1.428c-3.888.669-7.971.737-11.94.076-3.977-.636-7.792-1.988-11.285-3.761-3.479-1.805-6.661-4.009-9.529-6.456l-2.085-1.867-1.887-1.795-3.739-3.603c-2.464-2.415-6.863-7.349-6.863-7.349s-7.628-8.917-13.904-15.661c0 0-5.875-6.38-9.083-9.099-10.98-9.303-24.367-7.257-36.237-.8-10.991 5.979-20.784 17.444-33.941 18.259-10.248.635-19.612-3.215-27.148-10.028C40.596 79 30.993 69.581 22.953 58.565c-3.564-4.883-11.568-12.167-19.608-5.9s-.511 27.271 11.195 49.249c0 0 10.492 18.379 19.1 25.033m293.733-43.989c5.721-3.812 12.113-6.776 18.391-9.527 12.004-5.261 30.339-7.867 34.784-21.56 4.728-14.56-8.507-24.02-21.927-24.475-36.311-1.231-72.216 21.879-74.007 28.491 1.277.228 2.633.415 4.065.568 6.103.64 13.552.661 21.564.661h1.431c12.353 0 21.077.332 26.659 1.145 2.789.407 4.793.94 6.035 1.569 1.259.651 1.657 1.269 1.665 1.972-.001.496-.317.944-1.084 1.695-2.667 2.675-9.671 6.643-15.969 11.003-3.156 2.185-6.145 4.48-8.371 6.823-2.216 2.339-3.716 4.737-3.739 7.212v.117c.015 1.712.519 3.237 1.381 4.588-.116-1.128 1.359-3.033 1.981-3.885 1.892-2.592 4.489-4.631 7.14-6.397m-134.105 28.132c2.247 2.027 4.644 3.777 7.151 5.197 2.517 1.385 5.149 2.427 7.872 2.98 2.717.573 5.523.661 8.353.321 1.413-.184 2.832-.464 4.248-.843 1.413-.399 2.82-.881 4.217-1.445 5.135-2.127 10.045-5.355 14.6-9.132 4.567-3.78 8.809-8.105 12.785-12.703 3.976-4.604 7.68-9.501 11.159-14.573a193.87 193.87 0 0 0 7.401-11.715c-1.86-1.443-4.275-2.168-7.016-1.991-6.501.421-12.093 4.724-16.641 9.032-4.856 4.601-9.16 9.709-14.256 14.067-5.087 4.347-10.395 8.471-16.133 11.925-7.561 4.553-16.072 7.805-24.697 7.985l.957.893m-65.963 17.845c-2.375-.129-4.785.195-7.145.929-2.36.752-4.66 1.88-6.856 3.264-1.103.687-2.173 1.451-3.224 2.252 0 0-8.413 6.239-11.075 7.823-5.373 3.088-8.664 5.437-14.792 6.86-5.224 1.191-9.333 1.377-9.333 1.377-3.137.196-8.076.355-14.101-.531-8.108-1.191-13.624-3.316-13.624-3.316-2.524-.843-4.984-1.841-7.401-2.929 4.577 6.656 9.601 13.336 15.833 18.177 5.272 4.096 11.652 6.848 18.34 7.38 11.033.879 18.701-4.4 26.871-11.415 5.84-5.016 10.844-11.065 15.889-16.86 3.516-4.037 7.095-9.349 11.505-12.924h0c-.296-.025-.588-.083-.887-.088m-16.801-88.265c1.201 1.356 3.108 1.995 5.317 2.412 1.099.195 2.268.307 3.464.36.577.035 1.243.061 1.768.031l.827-.019.835-.068c2.225-.179 4.495-.756 6.704-1.531 2.197-.817 4.369-1.844 6.304-3.131 3.121-2.075 4.161-3.591 4.727-4.424.535-.848.915-1.707 1.064-2.547.155-.84.067-1.707-.377-2.675-.387-.819-1.015-1.673-2.231-2.753-3.409-3.027-9.003-3.264-12.303-2.888-7.652.872-14.096 5.348-16.487 10.136-.603 1.285-.915 2.853-.784 4.169.123 1.241.569 2.237 1.172 2.927m20.376 20.325c11.752-1.339 20.323-10.832 19.141-21.203-.315-2.763-1.297-5.303-2.78-7.527.151 1.624-.089 3.22-.541 4.659-.528 1.739-1.396 3.293-2.399 4.715-1.005 1.403-2.141 2.613-3.371 3.707-2.451 2.187-5.252 3.844-8.261 5.051-3.021 1.161-6.267 1.9-9.635 1.885 0 0-1.22.028-2.361-.108a36.18 36.18 0 0 1-2.568-.421c-1.568-.345-3.147-.805-4.696-1.511-.772-.355-2.621-1.207-4.423-2.891-.485-.453-.936-.973-1.345-1.531 1.812 9.739 11.936 16.461 23.239 15.175" fill="#f96815"/>
          </svg>
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