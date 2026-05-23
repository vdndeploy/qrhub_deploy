import { Link } from 'react-router-dom';
import {
  QrCode, Sparkles, Globe2, Shield, BarChart3,
  Users, Smartphone, Layers, ArrowRight, Github,
} from 'lucide-react';

/**
 * Marketing landing for the platform root URL (qrhub.it).
 * Only rendered on the configured primary domain — see App.js routing logic.
 *
 * Tenant landings live elsewhere (`/v/:vendorId`), and DomainGuard ensures
 * that custom tenant domains redirect to the right place when a visitor
 * lands at "/" on a non-platform host.
 */
const Marketing = () => {
  return (
    <div className="marketing-root" data-testid="marketing-landing">
      <style>{`
        .marketing-root {
          font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          background: #0a0a0b;
          color: #fff;
          min-height: 100vh;
          line-height: 1.5;
        }
        .marketing-root .grain::before {
          content: '';
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px);
          background-size: 3px 3px;
        }
        .marketing-root .marketing-nav {
          position: sticky; top: 0; z-index: 50;
          backdrop-filter: blur(12px); background: rgba(10,10,11,.7);
          border-bottom: 1px solid rgba(255,255,255,.06);
          padding: 14px 24px; display: flex; align-items: center; justify-content: space-between;
        }
        .marketing-root .brand-pill {
          display: inline-flex; align-items: center; gap: 8px;
          font-weight: 800; font-size: 18px; letter-spacing: -.02em;
        }
        .marketing-root .brand-dot { width: 26px; height: 26px; border-radius: 8px; background: #F96815; display: inline-flex; align-items: center; justify-content: center; }
        .marketing-root .nav-actions { display: flex; gap: 8px; }
        .marketing-root .btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 16px; border-radius: 999px; font-size: 13px; font-weight: 600;
          text-decoration: none; transition: transform .15s, background .15s, color .15s;
          cursor: pointer; border: 0;
        }
        .marketing-root .btn-primary { background: #F96815; color: #fff; }
        .marketing-root .btn-primary:hover { transform: translateY(-1px); background: #ff7a2e; }
        .marketing-root .btn-secondary { background: #4A2D8C; color: #fff; }
        .marketing-root .btn-secondary:hover { transform: translateY(-1px); background: #5d3aab; }
        .marketing-root .btn-ghost { background: rgba(255,255,255,.06); color: #eee; border: 1px solid rgba(255,255,255,.1); }
        .marketing-root .btn-ghost:hover { background: rgba(255,255,255,.12); }
        .marketing-root .hero {
          padding: 80px 24px 100px; max-width: 1100px; margin: 0 auto;
          position: relative; z-index: 1;
          background: transparent;
          text-align: left;
        }
        .marketing-root .hero::before { content: none; }
        .marketing-root .eyebrow { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; font-size: 12px; background: rgba(249,104,21,.15); color: #ffae7e; border: 1px solid rgba(249,104,21,.3); font-weight: 600; }
        .marketing-root h1.headline { font-size: clamp(38px, 6vw, 64px); line-height: 1.05; letter-spacing: -.03em; margin: 18px 0 18px; font-weight: 800; color: #fff; }
        .marketing-root h1.headline em { color: #F96815; font-style: normal; }
        .marketing-root .lede { font-size: 17px; color: #b8b8be; max-width: 600px; margin-bottom: 32px; }
        .marketing-root .hero-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
        .marketing-root .hero-mock {
          margin-top: 60px; max-width: 720px; height: 320px;
          background: linear-gradient(135deg, #1a1a1f 0%, #2a1a10 100%);
          border-radius: 18px; padding: 32px; box-shadow: 0 30px 60px rgba(249,104,21,.18), inset 0 1px 0 rgba(255,255,255,.06);
          display: flex; align-items: center; justify-content: center; gap: 40px;
        }
        .marketing-root .qr-block {
          width: 200px; height: 200px; background: #fff; border-radius: 12px;
          display: flex; align-items: center; justify-content: center; color: #0a0a0b;
        }
        .marketing-root .qr-block svg { width: 70%; height: 70%; }
        .marketing-root .mock-info { color: #ddd; font-size: 14px; }
        .marketing-root .mock-info .l { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: .12em; }
        .marketing-root .mock-info .name { font-size: 22px; font-weight: 700; margin: 6px 0 14px; }
        .marketing-root .pill { display: inline-block; background: rgba(255,255,255,.08); padding: 4px 10px; border-radius: 999px; font-size: 11px; margin-right: 4px; }
        .marketing-root section.features { padding: 80px 24px; max-width: 1100px; margin: 0 auto; }
        .marketing-root section.features h2 { font-size: clamp(28px, 4vw, 42px); letter-spacing: -.02em; font-weight: 800; margin-bottom: 14px; }
        .marketing-root section.features .sub { color: #999; margin-bottom: 48px; max-width: 520px; }
        .marketing-root .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
        .marketing-root .card { padding: 24px; border-radius: 14px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); transition: border .2s, transform .2s; }
        .marketing-root .card:hover { border-color: rgba(249,104,21,.3); transform: translateY(-2px); }
        .marketing-root .card .ic { width: 36px; height: 36px; border-radius: 10px; background: rgba(249,104,21,.15); color: #F96815; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; }
        .marketing-root .card h3 { font-size: 16px; font-weight: 700; margin: 0 0 6px; color: #fff; }
        .marketing-root .card p { font-size: 13px; color: #aaa; margin: 0; line-height: 1.5; }
        .marketing-root section.access {
          padding: 80px 24px; max-width: 1100px; margin: 0 auto;
          display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
        }
        @media (max-width: 700px) {
          .marketing-root section.access { grid-template-columns: 1fr; }
          .marketing-root .hero-mock { flex-direction: column; height: auto; padding: 24px; }
        }
        .marketing-root .access-card {
          padding: 32px; border-radius: 18px;
          background: linear-gradient(180deg, rgba(249,104,21,.12), rgba(249,104,21,.02));
          border: 1px solid rgba(249,104,21,.25);
          display: flex; flex-direction: column; gap: 12px;
          min-height: 220px;
        }
        .marketing-root .access-card.vendor {
          background: linear-gradient(180deg, rgba(74,45,140,.18), rgba(74,45,140,.02));
          border-color: rgba(74,45,140,.35);
        }
        .marketing-root .access-card h3 { font-size: 22px; font-weight: 800; letter-spacing: -.02em; margin: 0 0 4px; color: #fff; }
        .marketing-root .access-card p { font-size: 14px; color: #b8b8be; margin: 0 0 auto; }
        .marketing-root footer { padding: 32px 24px 60px; color: #777; font-size: 13px; max-width: 1100px; margin: 0 auto; border-top: 1px solid rgba(255,255,255,.06); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
      `}</style>
      <div className="grain" />
      <nav className="marketing-nav">
        <span className="brand-pill">
          <span className="brand-dot"><QrCode size={16} color="#fff" /></span>
          QRHub
        </span>
        <div className="nav-actions">
          <Link to="/login" className="btn btn-primary" data-testid="nav-org-login">
            <Users size={14} /> Organizzazioni
          </Link>
          <Link to="/vendor-login" className="btn btn-secondary" data-testid="nav-vendor-login">
            Venditori <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      <section className="hero">
        <span className="eyebrow"><Sparkles size={12} /> Piattaforma multi-tenant per landing QR</span>
        <h1 className="headline">
          Un solo QR code,<br />
          una landing <em>brandizzata</em><br />
          per ogni venditore.
        </h1>
        <p className="lede">
          QRHub trasforma il QR sul biglietto da visita in una pagina di contatto
          mobile-first con WhatsApp, recensioni Google, social e annunci dinamici —
          tutto sotto il dominio della tua organizzazione.
        </p>
        <div className="hero-ctas">
          <Link to="/login" className="btn btn-primary" data-testid="hero-org-cta">
            <Users size={14} /> Accedi come Organizzazione
          </Link>
          <Link to="/vendor-login" className="btn btn-secondary" data-testid="hero-vendor-cta">
            <Smartphone size={14} /> Accedi come Venditore
          </Link>
        </div>

        <div className="hero-mock" aria-hidden="true">
          <div className="qr-block">
            <svg viewBox="0 0 100 100" fill="currentColor">
              {/* simplified QR pattern */}
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
          <div className="mock-info">
            <div className="l">Landing del venditore</div>
            <div className="name">Marco · La tua agenzia</div>
            <span className="pill">WhatsApp</span>
            <span className="pill">Recensioni</span>
            <span className="pill">Social</span>
            <span className="pill">Mappa</span>
          </div>
        </div>
      </section>

      <section className="features">
        <h2>Costruita per agenzie multi-negozio.</h2>
        <p className="sub">Ogni organizzazione gestisce i propri venditori, dominio personalizzato, branding e annunci — in totale isolamento dagli altri tenant.</p>
        <div className="grid">
          {[
            { ic: <Globe2 size={18} />, t: 'Dominio personalizzato', d: 'Connetti app.tuaazienda.com per servire le landing sotto il tuo brand. SSL automatico via Vercel.' },
            { ic: <Layers size={18} />, t: 'Annunci a carosello', d: 'Crea post promozionali con immagine, titolo e CTA WhatsApp. Stessi annunci, tutti i venditori del negozio.' },
            { ic: <BarChart3 size={18} />, t: 'Analytics privacy-first', d: 'Visite, click WhatsApp, recensioni, dispositivo, città. Zero PII, IP anonimizzati, retention 365gg.' },
            { ic: <Shield size={18} />, t: 'GDPR compliant', d: 'DPA digitale, cookie banner per org, export dati, cancellazione account in 1 click.' },
            { ic: <QrCode size={18} />, t: 'QR ad alta densità', d: 'Generazione PNG ad alta risoluzione (error correction H) — leggibile anche con stampa rovinata.' },
            { ic: <Users size={18} />, t: 'Multi-tenant nativo', d: 'Ogni org vede solo i propri venditori, negozi, file Cloudinary e analytics.' },
          ].map((f, i) => (
            <div key={i} className="card">
              <div className="ic">{f.ic}</div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="access">
        <div className="access-card">
          <h3>Sei un'organizzazione?</h3>
          <p>Gestisci negozi, venditori, dominio personalizzato e analytics da un'unica dashboard. Ogni venditore riceve un QR code univoco e una landing brandizzata.</p>
          <Link to="/login" className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: 12 }}
                 data-testid="access-org-cta">
            Accedi al pannello <ArrowRight size={14} />
          </Link>
        </div>
        <div className="access-card vendor">
          <h3>Sei un venditore?</h3>
          <p>Personalizza la tua bio, foto profilo, scarica il tuo QR code e monitora le visite e i click WhatsApp del tuo profilo pubblico.</p>
          <Link to="/vendor-login" className="btn btn-secondary" style={{ alignSelf: 'flex-start', marginTop: 12 }}
                 data-testid="access-vendor-cta">
            Accedi al tuo profilo <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      <footer>
        <span>© {new Date().getFullYear()} QRHub — Piattaforma multi-tenant per landing QR.</span>
        <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
          <a href="https://github.com" target="_blank" rel="noreferrer" style={{ color: '#999', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Github size={14} /> GitHub</a>
        </span>
      </footer>
    </div>
  );
};

export default Marketing;
