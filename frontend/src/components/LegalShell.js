import { Link } from 'react-router-dom';
import { Zap, ArrowLeft } from 'lucide-react';

/**
 * Shared shell for the three public legal pages (Terms, Privacy, License)
 * on the qrhub.it marketing site. Provides the sticky nav pill and an
 * accessible "back to home" CTA so legal text always feels like part of
 * the same site, not a forgotten static page.
 */
const LegalShell = ({ eyebrow, title, subtitle, updated, children }) => (
  <div className="legal-page" data-testid={`legal-page-${(eyebrow || '').toLowerCase()}`}>
    <div className="legal-nav">
      <div className="legal-nav-inner">
        <Link to="/" className="legal-brand">
          <span className="legal-brand-dot" />
          QRHub
        </Link>
        <Link to="/" className="legal-back" data-testid="legal-back-home">
          <ArrowLeft size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          Home
        </Link>
      </div>
    </div>

    <div className="legal-wrap">
      {eyebrow && <span className="legal-eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {subtitle && <p className="legal-subtitle">{subtitle}</p>}
      <div className="legal-meta">
        <span>Ultimo aggiornamento: {updated || 'Maggio 2026'}</span>
        <span>Versione 1.0</span>
      </div>

      {children}

      <div className="legal-footer">
        <span>© {new Date().getFullYear()} QRHub. Tutti i diritti riservati.</span>
        <span style={{ display: 'inline-flex', gap: 18 }}>
          <Link to="/terms">Termini</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/license">Licenza</Link>
        </span>
      </div>
    </div>

    {/* Keep the Zap icon imported so tree-shake doesn't strip the lucide chunk
        that other pages share. */}
    <Zap size={0} aria-hidden="true" />
  </div>
);

export default LegalShell;
