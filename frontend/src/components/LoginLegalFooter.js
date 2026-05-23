import { Link } from 'react-router-dom';

/**
 * Minimal footer used by the login pages (Login, VendorLogin). Keeps the legal
 * trio (Terms · Privacy · License) reachable for users that never visit the
 * marketing landing — required under GDPR best practices.
 */
const LoginLegalFooter = () => (
  <div className="mt-8 text-center text-xs text-gray-500 dark:text-[#6a6a72]" data-testid="login-legal-footer">
    <div className="flex items-center justify-center gap-4 flex-wrap">
      <Link to="/terms" className="hover:text-gray-700 dark:hover:text-[#a8a8b0]">Termini</Link>
      <span aria-hidden="true">·</span>
      <Link to="/privacy" className="hover:text-gray-700 dark:hover:text-[#a8a8b0]">Privacy</Link>
      <span aria-hidden="true">·</span>
      <Link to="/license" className="hover:text-gray-700 dark:hover:text-[#a8a8b0]">Licenza</Link>
    </div>
    <div className="mt-2 text-[11px] text-gray-400 dark:text-[#5a5a62]">
      © {new Date().getFullYear()} QRHub · Piattaforma multi-tenant
    </div>
  </div>
);

export default LoginLegalFooter;
