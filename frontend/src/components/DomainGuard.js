import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * DomainGuard
 * ---------------------------------------------------------------------------
 * Decides whether the current hostname is allowed to render the admin/dashboard
 * portion of the SPA, or whether we should restrict it to tenant landing pages.
 *
 * Rules:
 *   - Hostname == platform primary domain (e.g. qrhub.it)             → render anything
 *   - Hostname in admin_hosts_allowlist / admin_host_suffixes          → render anything
 *   - Otherwise (custom tenant domain like app.tenant-example.com):
 *       /v/:vendorId[...]   → render the public vendor landing
 *       /s/:slug[...]       → render the public store lead-gen landing
 *       Any other path      → render a neutral courtesy page.
 *
 * Earlier versions used to 302-redirect "non-landing" paths to the platform
 * primary domain. That was wrong: a visitor on app.tenant-example.com must NEVER be
 * dropped on qrhub.it — it isn't their site. Now we keep them on their
 * configured domain and just show a friendly "Pagina non disponibile" view.
 *
 * If the backend hasn't returned the config yet we render a blank state
 * (avoid flashing /dashboard then bouncing).
 *
 * This component is rendered INSIDE BrowserRouter so it can use useLocation().
 */
const PUBLIC_PATH_PREFIXES = ['/v/', '/s/'];

function isPublicPath(pathname) {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

const DomainGuard = ({ children }) => {
  const [config, setConfig] = useState(null);
  const [showCourtesy, setShowCourtesy] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/platform/config`);
        if (!cancelled) setConfig(data);
      } catch {
        // If the config endpoint fails we degrade gracefully: render everything
        // (better than locking users out of an admin dashboard).
        if (!cancelled) setConfig({ primary_domain: '', admin_hosts_allowlist: [] });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!config) return;
    const primary = (config.primary_domain || '').toLowerCase();
    const allow = new Set([
      ...(config.admin_hosts_allowlist || []).map((h) => h.toLowerCase()),
      primary,
    ].filter(Boolean));
    const suffixes = (config.admin_host_suffixes || []).map((s) => s.toLowerCase());
    const host = window.location.hostname.toLowerCase();
    const isAdminHost = allow.has(host) || suffixes.some((s) => host.endsWith(s));
    if (isAdminHost) {
      setShowCourtesy(false);
      return;
    }
    if (isPublicPath(location.pathname)) {
      setShowCourtesy(false);
      return;
    }
    setShowCourtesy(true);
  }, [config, location.pathname, location.search]);

  if (!config) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
          color: '#888', fontSize: 14,
        }}
        data-testid="domain-guard-loading"
      >
        Caricamento…
      </div>
    );
  }

  if (showCourtesy) {
    const host = window.location.hostname;
    // Build the admin login URL on the platform primary domain so a user who
    // ends up on a tenant custom domain (e.g. app.vdn.srl/login because they
    // bookmarked the wrong host) has a clear one-click escape back to the
    // real admin panel. Falls back to qrhub.it if config didn't ship one.
    const primaryDomain = (config.primary_domain || 'qrhub.it').replace(/^https?:\/\//, '');
    const adminLoginUrl = `https://${primaryDomain}/login`;
    return (
      <div
        data-testid="domain-guard-courtesy"
        style={{
          position: 'fixed', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(210,250,70,0.10), transparent 70%), #0a0a0b',
          color: '#e6e6ea',
          fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          padding: '40px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 520, width: '100%' }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 64, height: 64, borderRadius: 18, marginBottom: 24,
              background:
                'radial-gradient(circle at 30% 30%, rgba(210,250,70,0.25), rgba(210,250,70,0.05))',
              border: '1px solid rgba(210,250,70,0.25)',
              color: '#D2FA46',
            }}
          >
            <svg
              viewBox="0 0 24 24" width="30" height="30"
              fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <line x1="8" y1="20" x2="16" y2="20" />
              <line x1="12" y1="18" x2="12" y2="20" />
            </svg>
          </div>
          <div
            style={{
              fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: '#D2FA46', marginBottom: 10, fontWeight: 600,
            }}
          >
            {host}
          </div>
          <h1
            style={{
              fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
              margin: '0 0 14px', lineHeight: 1.15, color: '#fff',
            }}
          >
            Pagina non disponibile
          </h1>
          <p style={{ color: '#8a8a92', fontSize: 15, lineHeight: 1.6, margin: '0 0 28px' }}>
            Questo dominio è dedicato esclusivamente alle pagine pubbliche
            dei venditori. Se hai un QR code, inquadralo per essere reindirizzato
            alla pagina corretta.
          </p>

          {/* Admin escape hatch — visible only on tenant custom domains.
              Lets bookmarked / mistakenly-visited admins jump back to the
              real login portal without having to manually type the URL. */}
          <a
            href={adminLoginUrl}
            data-testid="domain-guard-admin-escape"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '12px 22px', borderRadius: 999,
              background: '#D2FA46', color: '#0a0a0b',
              fontSize: 13.5, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(210,250,70,0.18)',
              marginBottom: 24,
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                 stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Vai al pannello admin
          </a>

          <p style={{ color: '#6a6a72', fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
            Stai cercando il sito ufficiale dell&apos;organizzazione? Contatta
            direttamente chi ti ha fornito il dominio.
          </p>
        </div>
      </div>
    );
  }

  return children;
};

export default DomainGuard;
