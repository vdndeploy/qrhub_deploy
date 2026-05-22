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
 *   - Hostname == platform primary domain (e.g. qrhub.it)     → render anything
 *   - Hostname in admin_hosts_allowlist (Vercel default, localhost) → render anything
 *   - Otherwise (custom tenant domain like app.vdn.srl)       → only allow
 *       /v/:vendorId      (public landing)
 *       /v/:vendorId/...  (privacy etc)
 *     Every other path is 302-redirected to https://{primary_domain}{path}.
 *
 * If the backend hasn't returned the config yet we render a blank state
 * (avoid flashing /dashboard then bouncing).
 *
 * This component is rendered INSIDE BrowserRouter so it can use useLocation().
 */
const PUBLIC_PATH_PREFIXES = ['/v/'];

function isPublicPath(pathname) {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

const DomainGuard = ({ children }) => {
  const [config, setConfig] = useState(null);
  const [redirecting, setRedirecting] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/platform/config`);
        if (!cancelled) setConfig(data);
      } catch (e) {
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
    if (isAdminHost) return; // nothing to do — render the SPA normally

    // We're on a tenant custom domain. Public landing paths render normally.
    if (isPublicPath(location.pathname)) return;

    // Everything else → redirect to primary platform domain (if configured).
    // If the platform domain isn't set yet, fall back to the Vercel default so
    // users at least get *somewhere* useful.
    const fallback = (config.admin_hosts_allowlist || []).find((h) => h.includes('.vercel.app'));
    const target = primary || fallback || '';
    if (!target) return; // nothing we can do
    setRedirecting(true);
    window.location.replace(`https://${target}${location.pathname}${location.search || ''}`);
  }, [config, location.pathname, location.search]);

  if (!config) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        color: '#888', fontSize: 14,
      }} data-testid="domain-guard-loading">
        Caricamento…
      </div>
    );
  }

  if (redirecting) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        color: '#444', fontSize: 14, textAlign: 'center', padding: 24,
      }} data-testid="domain-guard-redirecting">
        Reindirizzamento al pannello principale…
      </div>
    );
  }

  return children;
};

export default DomainGuard;
