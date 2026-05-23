import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import './VendorLanding.css';
import './VendorPrivacy.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Block = ({ title, children, accent = '#F96815' }) => (
  <section className="privacy-block" data-testid={`privacy-block-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
    <h2 style={{ borderLeftColor: accent }}>{title}</h2>
    <div className="privacy-block-body">{children}</div>
  </section>
);

const VendorPrivacy = () => {
  const { vendorId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancel = false;
    axios.get(`${API}/vendors/${vendorId}/privacy-info`)
      .then(r => { if (!cancel) setData(r.data); })
      .catch(e => { if (!cancel) setError(e?.response?.data?.detail || 'Informativa non disponibile'); });
    return () => { cancel = true; };
  }, [vendorId]);

  if (error) {
    return (
      <div className="privacy-page" data-testid="privacy-error">
        <div className="privacy-container">
          <h1>Informativa non disponibile</h1>
          <p>{error}</p>
          <Link to={`/v/${vendorId}`} className="privacy-back-link">← Torna alla pagina</Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="privacy-page" data-testid="privacy-loading">
        <div className="privacy-container">
          <p>Caricamento…</p>
        </div>
      </div>
    );
  }

  const accent = data.organization?.primary_color || '#F96815';
  const c = data.controller || {};
  const hasController = !!(c.legal_name || c.vat_number || c.privacy_contact_email);

  return (
    <div className="privacy-page" data-testid="privacy-page">
      <div className="privacy-container">
        <header className="privacy-header" style={{ borderBottomColor: accent }}>
          {data.organization?.logo_url && (
            <img src={data.organization.logo_url} alt="" className="privacy-logo" />
          )}
          <h1 data-testid="privacy-title">Informativa Privacy</h1>
          <p className="privacy-sub">
            Pagina di <strong>{data.vendor.name}</strong> — {data.organization?.brand_name}
          </p>
          {data.gdpr_status?.controller_verified && (
            <span className={`privacy-trust-badge privacy-trust-${data.gdpr_status.completeness}`}
                  data-testid="privacy-trust-badge"
                  title="Il titolare del trattamento ha completato l'identificazione richiesta dall'art. 13 GDPR">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                    strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
                <path d="M9 12l2 2 4-4"/>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Titolare verificato
              {data.gdpr_status.completeness === 'complete' && <span className="privacy-trust-plus">+</span>}
            </span>
          )}
          <Link to={`/v/${vendorId}`} className="privacy-back-link" data-testid="privacy-back">← Torna alla pagina</Link>
        </header>

        <Block title="Titolare del trattamento" accent={accent}>
          {hasController ? (
            <dl className="privacy-dl" data-testid="privacy-controller">
              {c.legal_name && (<><dt>Denominazione</dt><dd>{c.legal_name}</dd></>)}
              {c.vat_number && (<><dt>P.IVA / C.F.</dt><dd>{c.vat_number}</dd></>)}
              {c.legal_address && (<><dt>Sede legale</dt><dd>{c.legal_address}</dd></>)}
              {c.privacy_contact_email && (
                <><dt>Contatto privacy</dt>
                <dd><a href={`mailto:${c.privacy_contact_email}`}>{c.privacy_contact_email}</a></dd></>
              )}
              {c.privacy_policy_url && (
                <><dt>Privacy policy estesa</dt>
                <dd><a href={c.privacy_policy_url} target="_blank" rel="noopener noreferrer">{c.privacy_policy_url}</a></dd></>
              )}
            </dl>
          ) : (
            <p className="privacy-warn" data-testid="privacy-controller-missing">
              Il titolare del trattamento non ha ancora completato i propri dati identificativi.
              Per esercitare i tuoi diritti contatta direttamente <strong>{data.organization?.brand_name}</strong>{' '}
              attraverso i canali di contatto presenti nella pagina principale.
            </p>
          )}
        </Block>

        <Block title="Responsabile del trattamento (processor)" accent={accent}>
          <p>
            La piattaforma tecnologica è fornita da <strong>{data.processor.name}</strong>{' '}
            (progetto open source, licenza {data.processor.license}), che agisce come
            <em> responsabile del trattamento </em>per conto del Titolare.
            Codice sorgente consultabile su{' '}
            <a href={data.processor.github_url} target="_blank" rel="noopener noreferrer">GitHub</a>.
          </p>
        </Block>

        <Block title="Sub-responsabili (servizi infrastrutturali)" accent={accent}>
          <table className="privacy-table" data-testid="privacy-subprocessors">
            <thead>
              <tr><th>Fornitore</th><th>Ruolo</th><th>Region</th><th>Trasferimenti / Garanzie</th></tr>
            </thead>
            <tbody>
              {(data.sub_processors || []).map(sp => (
                <tr key={sp.name}>
                  <td><a href={sp.website} target="_blank" rel="noopener noreferrer">{sp.name}</a></td>
                  <td>{sp.role}</td>
                  <td>{sp.region}</td>
                  <td>{sp.transfers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>

        <Block title="Dati raccolti" accent={accent}>
          <p><strong>Metriche aggregate (non riconducibili alla singola persona):</strong></p>
          <ul>
            {(data.data_collected?.aggregate_metrics || []).map(x => <li key={x}>{x}</li>)}
          </ul>
          <p><strong>Cookie tecnici:</strong></p>
          <ul className="privacy-list-cookies">
            {(data.data_collected?.cookies_technical || []).map(ck => (
              <li key={ck.name}>
                <code>{ck.name}</code> — {ck.purpose} <span className="privacy-muted">({ck.duration})</span>
              </li>
            ))}
          </ul>
          <p><strong>Dati che NON vengono memorizzati:</strong></p>
          <ul>
            {(data.data_collected?.never_stored || []).map(x => <li key={x}>{x}</li>)}
          </ul>
        </Block>

        <Block title="Basi giuridiche" accent={accent}>
          <dl className="privacy-dl">
            <dt>Visualizzazione landing</dt><dd>{data.legal_basis?.page_view}</dd>
            <dt>Analytics aggregati</dt><dd>{data.legal_basis?.aggregate_analytics}</dd>
            <dt>Cookie tecnici</dt><dd>{data.legal_basis?.technical_cookies}</dd>
          </dl>
        </Block>

        <Block title="Periodi di conservazione" accent={accent}>
          <dl className="privacy-dl">
            {Object.entries(data.retention || {}).map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{k.replace(/_/g, ' ')}</dt><dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Block>

        <Block title="I tuoi diritti (GDPR)" accent={accent}>
          <p>In qualità di interessato puoi esercitare i seguenti diritti contattando il Titolare ai recapiti sopra indicati:</p>
          <ul data-testid="privacy-rights">
            {(data.rights || []).map(r => (
              <li key={r.art}><strong>{r.art}</strong> — {r.name}</li>
            ))}
          </ul>
        </Block>

        <Block title="Profilazione tramite servizi terzi" accent={accent}>
          {data.data_profiling_text ? (
            <p style={{ whiteSpace: 'pre-line' }} data-testid="privacy-profiling-text">
              {data.data_profiling_text}
            </p>
          ) : (
            <p className="privacy-muted" data-testid="privacy-profiling-missing">
              Il titolare non ha ancora pubblicato un'informativa sui canali terzi (WhatsApp, social, Google).
              Per dubbi sui trattamenti operati da Meta, Google o TikTok rivolgiti direttamente alle rispettive informative.
            </p>
          )}
        </Block>

        <section className="privacy-block" id="terms" data-testid="privacy-block-terms">
          <h2 style={{ borderLeftColor: accent }}>Termini e condizioni d'uso</h2>
          <div className="privacy-block-body">
            {data.terms_text ? (
              <p style={{ whiteSpace: 'pre-line' }} data-testid="privacy-terms-text">
                {data.terms_text}
              </p>
            ) : (
              <p className="privacy-muted" data-testid="privacy-terms-missing">
                Il titolare non ha pubblicato termini specifici per questa landing.
                Per qualunque richiesta usa i contatti riportati sopra.
              </p>
            )}
          </div>
        </section>

        <footer className="privacy-footer">
          <p>Ultimo aggiornamento: {(data.updated_at || '').slice(0, 10)}</p>
          <p>
            Per dubbi tecnici sulla piattaforma:{' '}
            <a href={data.processor.github_url} target="_blank" rel="noopener noreferrer">repository {data.processor.name}</a>.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default VendorPrivacy;
