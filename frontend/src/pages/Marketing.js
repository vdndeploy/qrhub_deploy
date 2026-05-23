import { Link } from 'react-router-dom';
import {
  QrCode, Sparkles, Globe2, Shield, BarChart3,
  Users, Smartphone, Layers, ArrowRight, Zap, Star,
} from 'lucide-react';

/**
 * Marketing landing for the platform root URL (qrhub.it).
 * Only rendered on the configured primary domain — see App.js routing logic.
 *
 * Tenant landings live elsewhere (`/v/:vendorId`) on each org's canonical
 * domain. The DomainGuard makes sure visitors that hit the wrong host get
 * routed to the right place.
 *
 * Palette: dark + lime neon (replaces the legacy orange).
 *  - bg              #0a0a0b
 *  - surface         #131316 / #1a1a1c
 *  - lime accent     #D2FA46
 *  - text muted      #8a8a92
 */
const Marketing = () => {
  return (
    <div className="marketing-root" data-testid="marketing-landing">
      <style>{`
        .marketing-root {
          font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          background: #0a0a0b;
          color: #e6e6ea;
          min-height: 100vh;
          line-height: 1.5;
          position: relative;
          overflow-x: hidden;
        }
        /* Subtle dotted grid background — soft, never noisy */
        .marketing-root::before {
          content: '';
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
          background-size: 64px 64px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 70%);
          -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 70%);
        }
        /* Halo glow behind the hero */
        .marketing-root::after {
          content: '';
          position: absolute; top: -200px; left: 50%;
          width: 900px; height: 700px;
          transform: translateX(-50%);
          background: radial-gradient(circle at 50% 30%, rgba(210,250,70,.10), transparent 60%);
          z-index: 0; pointer-events: none;
        }
        .marketing-root > * { position: relative; z-index: 1; }

        /* Nav pill */
        .marketing-root .m-nav-wrap {
          position: sticky; top: 16px; z-index: 50;
          display: flex; justify-content: center;
          padding: 16px 16px 0;
        }
        .marketing-root .m-nav {
          display: flex; align-items: center; gap: 32px;
          padding: 10px 10px 10px 22px;
          background: rgba(17,17,20,.85);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 999px;
          box-shadow: 0 8px 32px rgba(0,0,0,.4);
          max-width: 100%;
        }
        .marketing-root .m-brand {
          display: inline-flex; align-items: center; gap: 8px;
          color: #fff; font-weight: 700; font-size: 17px; letter-spacing: -.01em;
          text-decoration: none;
        }
        .marketing-root .m-brand-icon {
          width: 24px; height: 24px; display: inline-flex;
          align-items: center; justify-content: center;
          color: #D2FA46;
        }
        .marketing-root .m-nav-links {
          display: flex; gap: 28px; font-size: 14px; color: #a8a8b0;
        }
        .marketing-root .m-nav-links a {
          color: inherit; text-decoration: none; transition: color .15s;
        }
        .marketing-root .m-nav-links a:hover { color: #fff; }
        @media (max-width: 760px) {
          .marketing-root .m-nav-links { display: none; }
          .marketing-root .m-nav { gap: 12px; }
        }

        /* Buttons */
        .marketing-root .m-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 20px; border-radius: 999px; font-size: 14px; font-weight: 600;
          text-decoration: none; border: 0; cursor: pointer;
          transition: transform .15s, background .15s, box-shadow .15s;
        }
        .marketing-root .m-btn-primary {
          background: #D2FA46; color: #0a0a0b;
          box-shadow: 0 0 0 1px rgba(210,250,70,.4), 0 6px 24px rgba(210,250,70,.2);
        }
        .marketing-root .m-btn-primary:hover {
          background: #dcff5e; transform: translateY(-1px);
          box-shadow: 0 0 0 1px rgba(210,250,70,.5), 0 10px 32px rgba(210,250,70,.32);
        }
        .marketing-root .m-btn-ghost {
          background: rgba(255,255,255,.04); color: #e6e6ea;
          border: 1px solid rgba(255,255,255,.1);
        }
        .marketing-root .m-btn-ghost:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.16); }

        /* Hero */
        .marketing-root .m-hero {
          padding: 80px 24px 100px;
          max-width: 980px; margin: 0 auto;
          text-align: center;
          position: relative; z-index: 1;
          background: transparent;
        }
        .marketing-root .m-hero::before { content: none; }
        .marketing-root .m-eyebrow {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 14px; border-radius: 999px; font-size: 13px;
          background: rgba(210,250,70,.08); color: #D2FA46;
          border: 1px solid rgba(210,250,70,.25);
          font-weight: 600;
          margin-bottom: 24px;
        }
        .marketing-root h1.m-headline {
          font-size: clamp(40px, 6.5vw, 68px); line-height: 1.05;
          letter-spacing: -.035em;
          margin: 0 0 22px;
          font-weight: 800;
          color: #fff;
        }
        .marketing-root h1.m-headline .muted {
          color: #5a5a62; font-weight: 800;
        }
        .marketing-root .m-lede {
          font-size: 17px; color: #8a8a92;
          max-width: 580px; margin: 0 auto 40px;
          line-height: 1.6;
        }
        .marketing-root .m-cta-wrap {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
        }
        .marketing-root .m-cta-note {
          font-size: 13px; color: #6a6a72;
        }
        .marketing-root .m-rating {
          margin-top: 28px;
          display: inline-flex; align-items: center; gap: 10px;
          color: #8a8a92; font-size: 13px;
        }
        .marketing-root .m-stars {
          display: inline-flex; gap: 2px; color: #D2FA46;
        }

        /* QR mock card */
        .marketing-root .m-mock {
          margin: 60px auto 0;
          max-width: 720px;
          background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01));
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 22px;
          padding: 36px;
          display: flex; align-items: center; gap: 36px;
          box-shadow: 0 40px 80px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.04);
        }
        .marketing-root .m-mock-qr {
          width: 180px; height: 180px; flex-shrink: 0;
          background: #fff; border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          color: #0a0a0b;
          box-shadow: 0 12px 32px rgba(210,250,70,.15);
        }
        .marketing-root .m-mock-qr svg { width: 75%; height: 75%; }
        .marketing-root .m-mock-info { text-align: left; min-width: 0; }
        .marketing-root .m-mock-info .lbl {
          font-size: 11px; color: #8a8a92; text-transform: uppercase;
          letter-spacing: .14em; font-weight: 600; margin-bottom: 8px;
        }
        .marketing-root .m-mock-info .nm {
          font-size: 22px; color: #fff; font-weight: 700; margin-bottom: 14px;
          letter-spacing: -.01em;
        }
        .marketing-root .m-mock-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .marketing-root .m-tag {
          padding: 4px 10px; border-radius: 999px; font-size: 12px;
          background: rgba(210,250,70,.1); color: #D2FA46;
          border: 1px solid rgba(210,250,70,.2);
        }
        @media (max-width: 700px) {
          .marketing-root .m-mock { flex-direction: column; text-align: center; padding: 28px; gap: 24px; }
          .marketing-root .m-mock-info { text-align: center; }
          .marketing-root .m-mock-tags { justify-content: center; }
        }

        /* Features section */
        .marketing-root .m-features {
          padding: 100px 24px 60px; max-width: 1100px; margin: 0 auto;
          text-align: center;
        }
        .marketing-root .m-section-eyebrow {
          display: inline-flex; padding: 6px 14px; border-radius: 999px;
          background: rgba(210,250,70,.08); color: #D2FA46;
          border: 1px solid rgba(210,250,70,.22);
          font-size: 13px; font-weight: 600; margin-bottom: 18px;
        }
        .marketing-root .m-features h2 {
          font-size: clamp(30px, 4.5vw, 46px);
          letter-spacing: -.025em; font-weight: 800;
          margin: 0 0 18px; color: #fff;
        }
        .marketing-root .m-features h2 .muted { color: #5a5a62; }
        .marketing-root .m-features .m-sub {
          color: #8a8a92; margin: 0 auto 56px; max-width: 520px; font-size: 16px;
        }
        .marketing-root .m-grid {
          display: grid; gap: 20px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }
        .marketing-root .m-card {
          padding: 32px 28px; border-radius: 18px;
          background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.005));
          border: 1px solid rgba(255,255,255,.07);
          text-align: left;
          transition: border-color .2s, transform .2s;
        }
        .marketing-root .m-card:hover {
          border-color: rgba(210,250,70,.25);
          transform: translateY(-3px);
        }
        .marketing-root .m-card-icon {
          width: 56px; height: 56px; border-radius: 14px;
          background: radial-gradient(circle at 30% 30%, rgba(210,250,70,.2), rgba(210,250,70,.04));
          color: #D2FA46;
          display: inline-flex; align-items: center; justify-content: center;
          margin-bottom: 20px;
          border: 1px solid rgba(210,250,70,.15);
        }
        .marketing-root .m-card h3 { font-size: 18px; font-weight: 700; margin: 0 0 8px; color: #fff; letter-spacing: -.01em; }
        .marketing-root .m-card p { font-size: 14px; color: #8a8a92; margin: 0; line-height: 1.6; }

        /* Access cards */
        .marketing-root .m-access {
          padding: 60px 24px 100px; max-width: 1100px; margin: 0 auto;
          display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
        }
        @media (max-width: 760px) {
          .marketing-root .m-access { grid-template-columns: 1fr; }
        }
        .marketing-root .m-access-card {
          position: relative;
          padding: 36px;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01));
          border: 1px solid rgba(255,255,255,.08);
          display: flex; flex-direction: column; gap: 14px;
          min-height: 240px;
          overflow: hidden;
        }
        .marketing-root .m-access-card::before {
          content: ''; position: absolute; top: -60px; right: -60px;
          width: 200px; height: 200px;
          background: radial-gradient(circle, rgba(210,250,70,.15), transparent 60%);
          pointer-events: none;
        }
        .marketing-root .m-access-card h3 {
          font-size: 24px; font-weight: 800; letter-spacing: -.02em;
          margin: 0 0 6px; color: #fff;
        }
        .marketing-root .m-access-card p {
          font-size: 14.5px; color: #a8a8b0; margin: 0 0 auto;
          line-height: 1.6;
        }

        /* Footer */
        .marketing-root .m-footer {
          padding: 32px 24px 60px; color: #6a6a72; font-size: 13px;
          max-width: 1100px; margin: 0 auto;
          border-top: 1px solid rgba(255,255,255,.06);
          display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px;
        }
        .marketing-root .m-footer a { color: inherit; text-decoration: none; transition: color .15s; }
        .marketing-root .m-footer a:hover { color: #D2FA46; }
      `}</style>

      <div className="m-nav-wrap">
        <nav className="m-nav">
          <Link to="/" className="m-brand">
            <span className="m-brand-icon"><Zap size={20} strokeWidth={2.4} fill="#D2FA46" /></span>
            QRHub
          </Link>
          <div className="m-nav-links">
            <a href="#features">Funzionalità</a>
            <a href="#access">Accesso</a>
            <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <Link to="/login" className="m-btn m-btn-primary" data-testid="nav-org-login">
            Inizia ora <ArrowRight size={14} />
          </Link>
        </nav>
      </div>

      <section className="m-hero">
        <span className="m-eyebrow"><Sparkles size={13} /> Piattaforma multi-tenant open-source</span>
        <h1 className="m-headline">
          Trasforma ogni QR <span className="muted">in una landing</span> brandizzata.
        </h1>
        <p className="m-lede">
          QRHub porta WhatsApp, recensioni Google, social e annunci dinamici sotto
          il dominio della tua organizzazione — un QR per ogni venditore, branding
          per ogni cliente, analytics privacy-first.
        </p>

        <div className="m-cta-wrap">
          <Link to="/login" className="m-btn m-btn-primary" data-testid="hero-org-cta">
            Accedi al pannello <ArrowRight size={14} />
          </Link>
          <span className="m-cta-note">Multi-tenant nativo · GDPR ready · Open source MIT</span>
        </div>

        <div className="m-rating">
          <span className="m-stars">
            <Star size={14} fill="#D2FA46" strokeWidth={0} />
            <Star size={14} fill="#D2FA46" strokeWidth={0} />
            <Star size={14} fill="#D2FA46" strokeWidth={0} />
            <Star size={14} fill="#D2FA46" strokeWidth={0} />
            <Star size={14} fill="#D2FA46" strokeWidth={0} />
          </span>
          Costruito per agenzie multi-negozio
        </div>

        <div className="m-mock" aria-hidden="true">
          <div className="m-mock-qr">
            <svg viewBox="0 0 100 100" fill="currentColor">
              <rect x="0" y="0" width="30" height="30" />
              <rect x="6" y="6" width="18" height="18" fill="#fff" />
              <rect x="12" y="12" width="6" height="6" />
              <rect x="70" y="0" width="30" height="30" />
              <rect x="76" y="6" width="18" height="18" fill="#fff" />
              <rect x="82" y="12" width="6" height="6" />
              <rect x="0" y="70" width="30" height="30" />
              <rect x="6" y="76" width="18" height="18" fill="#fff" />
              <rect x="12" y="82" width="6" height="6" />
              <rect x="40" y="10" width="6" height="6" />
              <rect x="50" y="20" width="6" height="6" />
              <rect x="60" y="40" width="6" height="6" />
              <rect x="40" y="50" width="6" height="6" />
              <rect x="50" y="60" width="6" height="6" />
              <rect x="70" y="50" width="6" height="6" />
              <rect x="40" y="70" width="6" height="6" />
              <rect x="60" y="80" width="6" height="6" />
            </svg>
          </div>
          <div className="m-mock-info">
            <div className="lbl">Landing del venditore</div>
            <div className="nm">Marco · La tua agenzia</div>
            <div className="m-mock-tags">
              <span className="m-tag">WhatsApp</span>
              <span className="m-tag">Recensioni</span>
              <span className="m-tag">Social</span>
              <span className="m-tag">Mappa</span>
              <span className="m-tag">Annunci</span>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="m-features">
        <span className="m-section-eyebrow">Perché scegliere QRHub?</span>
        <h2>Tutto quello che serve <span className="muted">per gestire</span> più clienti.</h2>
        <p className="m-sub">
          Ogni organizzazione gestisce i propri venditori, dominio personalizzato, branding e annunci — in totale isolamento dagli altri tenant.
        </p>
        <div className="m-grid">
          {[
            { ic: <Globe2 size={22} />, t: 'Dominio personalizzato', d: 'Connetti app.tuaazienda.com per servire le landing sotto il tuo brand. SSL automatico via Vercel.' },
            { ic: <Layers size={22} />, t: 'Annunci a carosello', d: 'Crea post promozionali con immagine, titolo e CTA WhatsApp. Stessi annunci, tutti i venditori del negozio.' },
            { ic: <BarChart3 size={22} />, t: 'Analytics privacy-first', d: 'Visite, click WhatsApp, recensioni, dispositivo, città. Zero PII, IP anonimizzati, retention 365gg.' },
            { ic: <Shield size={22} />, t: 'GDPR compliant', d: 'DPA digitale, cookie banner per org, export dati, cancellazione account in 1 click.' },
            { ic: <QrCode size={22} />, t: 'QR ad alta densità', d: 'Generazione PNG ad alta risoluzione (error correction H) — leggibile anche con stampa rovinata.' },
            { ic: <Users size={22} />, t: 'Multi-tenant nativo', d: 'Ogni org vede solo i propri venditori, negozi, file Cloudinary e analytics — isolamento per organization_id.' },
          ].map((f, i) => (
            <div key={i} className="m-card">
              <div className="m-card-icon">{f.ic}</div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="access" className="m-access">
        <div className="m-access-card">
          <h3>Sei un'organizzazione?</h3>
          <p>Gestisci negozi, venditori, dominio personalizzato e analytics da un'unica dashboard. Ogni venditore riceve un QR code univoco e una landing brandizzata.</p>
          <Link to="/login" className="m-btn m-btn-primary" style={{ alignSelf: 'flex-start', marginTop: 16 }}
                 data-testid="access-org-cta">
            Accedi al pannello <ArrowRight size={14} />
          </Link>
        </div>
        <div className="m-access-card">
          <h3>Sei un venditore?</h3>
          <p>Personalizza la tua bio, foto profilo, scarica il tuo QR code e monitora le visite e i click WhatsApp del tuo profilo pubblico.</p>
          <Link to="/vendor-login" className="m-btn m-btn-ghost" style={{ alignSelf: 'flex-start', marginTop: 16 }}
                 data-testid="access-vendor-cta">
            <Smartphone size={14} /> Accedi al tuo profilo
          </Link>
        </div>
      </section>

      <footer className="m-footer">
        <span>© {new Date().getFullYear()} QRHub — Piattaforma multi-tenant per landing QR.</span>
        <span style={{ display: 'inline-flex', gap: 16 }}>
          <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          <a href="/login">Accesso</a>
        </span>
      </footer>
    </div>
  );
};

export default Marketing;
