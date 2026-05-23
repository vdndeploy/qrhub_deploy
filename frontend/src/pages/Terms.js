import LegalShell from '@/components/LegalShell';
import '@/pages/Legal.public.css';

/**
 * Public Terms of Service for the qrhub.it marketing site.
 * Audience: prospective organizations evaluating whether to onboard QRHub.
 * Vendor- and end-user-facing terms live on each tenant's own /v/.../privacy
 * page and are the responsibility of the organization that owns the domain.
 */
const Terms = () => (
  <LegalShell
    eyebrow="Termini"
    title="Termini di Servizio della Piattaforma QRHub"
    subtitle="Le regole d'uso del software QRHub e del sito qrhub.it. Per i termini d'uso delle singole landing dei venditori, fare riferimento alla privacy pubblicata sul dominio personalizzato dell'organizzazione."
    updated="Maggio 2026"
  >
    <div className="legal-callout">
      <strong>In breve.</strong> QRHub è un software multi-tenant <em>source-available</em>, non un servizio gestito offerto a terzi. Ogni organizzazione che lo utilizza è l'unica responsabile del dominio assegnato, dei contenuti pubblicati dai propri venditori e del trattamento dei dati dei propri visitatori. La proprietà intellettuale del codice resta del titolare della piattaforma. La collaborazione no-profit è benvenuta previa autorizzazione scritta.
    </div>

    <h2><span className="num">1.</span> Identità del titolare</h2>
    <p>
      Il software QRHub e il sito vetrina <a href="https://qrhub.it">qrhub.it</a> sono di proprietà del titolare configurato in piattaforma. I dati identificativi (denominazione, sede, P.IVA, contatti) sono pubblicati e mantenuti dal titolare nella sezione <em>Impostazioni Organizzazione</em> del proprio pannello e mostrati ai visitatori delle singole landing.
    </p>
    <p>
      Per ogni comunicazione riguardante questi Termini, la Privacy o richieste di collaborazione: <a href="mailto:collaborazioni@qrhub.it">collaborazioni@qrhub.it</a>.
    </p>

    <h2><span className="num">2.</span> Oggetto dei termini</h2>
    <p>
      I presenti Termini disciplinano: (i) l'accesso al sito vetrina <a href="https://qrhub.it">qrhub.it</a>; (ii) la consultazione del codice sorgente di QRHub; (iii) l'utilizzo della piattaforma da parte di organizzazioni autorizzate; (iv) i rapporti tra il titolare della piattaforma e gli utenti dei pannelli di amministrazione.
    </p>
    <p>
      <strong>Non disciplinano</strong> il rapporto tra le organizzazioni e i loro venditori, né quello tra le organizzazioni e i visitatori delle loro landing. Tali rapporti sono regolati esclusivamente dai documenti pubblicati da ciascuna organizzazione sul proprio dominio personalizzato.
    </p>

    <h2><span className="num">3.</span> Natura del software</h2>
    <p>
      QRHub è un software <strong>source-available a uso riservato</strong>. Significa che:
    </p>
    <ul>
      <li>Il codice è pubblicato e consultabile su repository privato, accessibile solo previa autorizzazione scritta.</li>
      <li>L'uso commerciale, la rivendita, la sublicenza, il fork pubblico e la pubblicazione di derivati commerciali sono <strong>vietati</strong>.</li>
      <li>L'uso e la modifica per finalità non commerciali, didattiche, di ricerca o di collaborazione sono ammessi previa richiesta a <a href="mailto:collaborazioni@qrhub.it">collaborazioni@qrhub.it</a>.</li>
      <li>I dettagli sono nel testo della <a href="/license">Licenza</a>.</li>
    </ul>

    <h2><span className="num">4.</span> Ruoli e responsabilità</h2>
    <p>
      La piattaforma riconosce tre ruoli con responsabilità distinte:
    </p>
    <ul>
      <li><strong>Titolare della piattaforma</strong> — fornisce il software, mantiene il sito vetrina, conserva la proprietà intellettuale.</li>
      <li><strong>Organizzazione</strong> — sottoscrittore di un'istanza, registra venditori, configura il proprio dominio personalizzato, è <strong>titolare autonomo del trattamento</strong> dei dati dei visitatori delle proprie landing. Risponde dei contenuti pubblicati dai propri venditori.</li>
      <li><strong>Venditore</strong> — utente operativo dell'organizzazione, opera all'interno del perimetro stabilito dalla stessa, è autenticato con credenziali separate.</li>
    </ul>
    <div className="legal-warn">
      <strong>Importante.</strong> Tutto ciò che viene pubblicato sulle landing <code>/v/:vendor</code> è imputabile esclusivamente al proprietario del dominio assegnato in pannello (l'organizzazione). Il titolare della piattaforma QRHub <strong>non controlla, non verifica e non avalla</strong> i contenuti delle landing dei tenant.
    </div>

    <h2><span className="num">5.</span> Accesso e account</h2>
    <p>
      Gli account di amministrazione (super admin, admin di organizzazione, venditori) sono creati tramite invito o procedura riservata. Le credenziali sono personali, non cedibili. L'utente è responsabile della loro custodia e di ogni attività svolta tramite il proprio account.
    </p>
    <p>
      Il titolare si riserva di sospendere o disabilitare account in caso di sospetto uso improprio, violazione dei presenti Termini o richiesta di autorità competenti.
    </p>

    <h2><span className="num">6.</span> Utilizzo accettabile</h2>
    <p>L'utilizzo della piattaforma è consentito a condizione che NON venga impiegata per:</p>
    <ul>
      <li>diffondere contenuti illeciti, diffamatori, lesivi della dignità o discriminatori;</li>
      <li>compiere attività di phishing, spam, frode o impersonificazione;</li>
      <li>raccogliere dati personali in violazione del GDPR;</li>
      <li>aggirare le limitazioni tecniche, sondare la sicurezza senza autorizzazione, effettuare reverse engineering al di fuori di quanto consentito dalla Licenza.</li>
    </ul>

    <h2><span className="num">7.</span> Contenuti delle landing</h2>
    <p>
      I contenuti pubblicati sulle landing <code>/v/:vendor</code> (foto, testi, annunci, link, recensioni) sono creati e gestiti esclusivamente dalle organizzazioni e dai loro venditori. Il titolare della piattaforma:
    </p>
    <ul>
      <li>non esercita controllo editoriale preventivo;</li>
      <li>non assume responsabilità sui contenuti pubblicati;</li>
      <li>può, a propria insindacabile valutazione, intervenire in caso di palese illiceità o di provvedimenti di autorità competenti;</li>
      <li>fornisce strumenti tecnici (es. eliminazione media, reset analytics, audit log) per consentire alle organizzazioni di adempiere ai propri obblighi.</li>
    </ul>

    <h2><span className="num">8.</span> Disponibilità del servizio</h2>
    <p>
      Il software è fornito "così com'è". Il titolare si impegna nel miglior modo possibile a garantirne la continuità ma non offre SLA contrattuali. Manutenzioni, aggiornamenti, interruzioni temporanee per cause tecniche o di forza maggiore non costituiscono inadempimento.
    </p>

    <h2><span className="num">9.</span> Limitazione di responsabilità</h2>
    <p>
      Nei limiti consentiti dalla legge, il titolare della piattaforma QRHub non è responsabile per: (i) danni indiretti, perdita di profitto, perdita di dati o di reputazione delle organizzazioni o dei loro clienti; (ii) condotte illecite di organizzazioni, venditori o terzi che usano il software; (iii) malfunzionamenti dei servizi infrastrutturali di terze parti (hosting, CDN, DNS, MongoDB, Cloudinary, Vercel, Fly.io) sui quali QRHub si appoggia.
    </p>

    <h2><span className="num">10.</span> Modifiche</h2>
    <p>
      I presenti Termini possono essere aggiornati. La versione vigente è sempre disponibile a <a href="/terms">qrhub.it/terms</a>; eventuali modifiche sostanziali saranno comunicate agli amministratori di organizzazione tramite il pannello.
    </p>

    <h2><span className="num">11.</span> Legge applicabile e foro</h2>
    <p>
      I presenti Termini sono regolati dalla legge italiana. Per qualunque controversia è competente in via esclusiva il Foro della sede legale del titolare, salvo competenze inderogabili di legge.
    </p>
  </LegalShell>
);

export default Terms;
