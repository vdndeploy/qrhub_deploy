import { useAuth } from '@/contexts/AuthContext';
import {
  ShieldCheck, FileText, AlertTriangle, Server, Github,
  Lock, Globe, HeartHandshake, ExternalLink,
} from 'lucide-react';

const Section = ({ icon: Icon, title, children, accent = '#F96815' }) => (
  <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
    <div className="flex items-start gap-3 mb-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${accent}14`, color: accent }}>
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 pt-1">{title}</h2>
    </div>
    <div className="text-sm text-gray-700 leading-relaxed space-y-2 sm:pl-12">
      {children}
    </div>
  </section>
);

const Legal = () => {
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';

  return (
    <div className="max-w-3xl space-y-5" data-testid="legal-page">
      <header className="pb-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Note Legali e Privacy</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ultima revisione: febbraio 2026 · Versione 1.0
        </p>
      </header>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900 flex items-start gap-3"
            data-testid="legal-banner">
        <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">QRHub è un progetto open source senza scopo di lucro</p>
          <p className="text-xs mt-0.5">
            Licenza MIT · Creato e mantenuto a titolo personale. La piattaforma è offerta "as-is" gratuitamente,
            nei limiti del free tier dei servizi di terze parti utilizzati.
          </p>
        </div>
      </div>

      <Section icon={HeartHandshake} title="Cosa è QRHub e chi lo gestisce">
        <p>
          <strong>QRHub</strong> è una piattaforma web open source per la generazione e gestione di landing
          page con QR code per venditori. Il codice è pubblicato con licenza
          <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer"
              className="text-[#F96815] hover:underline ml-1">MIT</a>{' '}
          e accessibile su
          <a href="https://github.com" target="_blank" rel="noopener noreferrer"
              className="text-[#F96815] hover:underline ml-1 inline-flex items-center gap-1">
            GitHub <Github className="h-3 w-3" />
          </a>.
        </p>
        <p>
          La piattaforma è creata e mantenuta a <strong>titolo personale</strong>, senza scopo di lucro,
          senza una società dietro. Le <strong>organizzazioni clienti (tenant)</strong> che utilizzano la piattaforma
          sono semplici <em>utilizzatori</em> del servizio, non proprietari del codice.
        </p>
      </Section>

      <Section icon={Server} title="Servizi di terze parti utilizzati" accent="#4A2D8C">
        <p>
          QRHub si appoggia ai seguenti servizi, tutti utilizzati nei rispettivi piani <strong>gratuiti (free tier)</strong>:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li><strong>Fly.io</strong> — hosting backend (region fra). Limiti: ~256MB RAM, auto-stop.</li>
          <li><strong>Vercel</strong> — hosting frontend statico. Limiti: 100GB bandwidth/mese.</li>
          <li><strong>MongoDB Atlas</strong> — database (M0 tier). Limiti: 512MB storage.</li>
          <li><strong>Cloudinary</strong> — CDN immagini/video. Limiti: 25 credits/mese.</li>
        </ul>
        <p className="text-amber-800 bg-amber-50 border-l-2 border-amber-400 p-3 rounded-r mt-2">
          <strong>Nessuna garanzia di disponibilità perpetua né di superamento dei limiti free tier.</strong>{' '}
          Se l'utilizzo aumenta oltre i limiti gratuiti, il servizio potrebbe essere temporaneamente
          interrotto o richiedere un upgrade a pagamento.
          Eventuali piani a pagamento o SLA dedicati devono essere concordati per iscritto.
        </p>

        <p className="font-semibold pt-3">Trasferimenti extra-UE e clausole contrattuali tipo (SCC)</p>
        <p>
          Alcuni dei sub-responsabili sopra elencati trattano dati al di fuori dello SEE.
          Quando ciò accade, il trattamento è coperto dalle <strong>Standard Contractual Clauses</strong> approvate
          dalla Commissione Europea (Decisione 2021/914) e/o, se applicabile, dal <strong>EU-US Data Privacy Framework</strong>.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li><strong>Fly.io</strong> — region <code>fra</code> (Francoforte, Germania): <strong>nessun trasferimento extra-UE</strong>.</li>
          <li><strong>MongoDB Atlas</strong> — cluster nel piano M0; la region effettiva è visibile nella console Atlas
            di chi gestisce il database. Atlas è certificato sotto SCC e fornisce DPA su richiesta.</li>
          <li><strong>Cloudinary</strong> — server di default negli Stati Uniti. Cloudinary aderisce al <em>EU-US Data Privacy Framework</em>{' '}
            e applica SCC. Trasferimento minimo: solo immagini/video pubblicati nelle landing pubbliche
            (nessun dato personale identificativo).</li>
          <li><strong>Vercel</strong> — edge network globale (CDN). Le richieste utente sono servite dalla edge più
            vicina geograficamente. Vercel applica SCC e fornisce un DPA accessibile dalla loro dashboard.</li>
          <li><strong>ipapi.co</strong> — server in UE. La piattaforma invia l'IP del visitatore solo come parametro di
            chiamata (mai memorizzato lato QRHub), per ottenere città/regione/paese.</li>
        </ul>
        <p className="text-xs text-gray-500 pt-1">
          I link ai DPA/SCC dei singoli fornitori sono pubblicati sui rispettivi siti web ufficiali.
          Le organizzazioni clienti (titolari del trattamento) sono invitate a verificare e accettare tali documenti
          direttamente con i fornitori, qualora richiesto dalla propria due-diligence interna.
        </p>
      </Section>

      <Section icon={Lock} title="Privacy e GDPR" accent="#10B981">
        <p>
          La piattaforma è progettata in conformità con il <strong>Regolamento (UE) 2016/679 (GDPR)</strong>{' '}
          e la normativa italiana sulla privacy (D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018).
        </p>
        <p className="font-semibold pt-1">Cosa NON viene memorizzato:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Indirizzi IP individuali degli utenti finali (vengono usati solo a runtime per il geo-lookup città e poi <strong>scartati immediatamente</strong>; in cache rimane soltanto la subnet anonimizzata a livello /24 IPv4 o /48 IPv6, non riconducibile al singolo dispositivo)</li>
          <li>User agent grezzi del browser</li>
          <li>Cookie di profilazione o di marketing</li>
          <li>Dati personali identificativi degli utenti finali delle landing</li>
        </ul>
        <p className="font-semibold pt-2">Cosa viene memorizzato:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Dati aggregati: numero visite e click per canale</li>
          <li>Città/regione/paese (approssimati, livello macro)</li>
          <li>Categoria device (mobile/tablet/desktop), OS family, browser family</li>
          <li>Cookie tecnici essenziali: <code className="bg-gray-100 px-1 rounded text-xs">access_token</code> e <code className="bg-gray-100 px-1 rounded text-xs">vendor_token</code> per autenticazione (durata 24h)</li>
        </ul>
        <p>
          I cookie tecnici essenziali <strong>non richiedono consenso</strong> ai sensi dell'art. 122 del Codice Privacy
          e delle Linee Guida del Garante (provvedimento del 10/06/2021).
        </p>
      </Section>

      <Section icon={Globe} title="Responsabilità del titolare del dominio (Org Admin)" accent="#DC2626">
        <p>
          Ogni organizzazione (tenant) che utilizza QRHub è <strong>titolare autonomo</strong> del proprio dominio
          personalizzato (es. <span className="font-mono">qr.tuodominio.it</span>) e dei contenuti pubblicati sulle proprie
          landing page.
        </p>
        <p className="font-semibold pt-1">QRHub <u>non è responsabile</u> di:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Contenuti pubblicati sulle landing page (post, immagini, link, messaggi)</li>
          <li>Conformità delle landing alle normative settoriali del titolare (es. autorizzazioni AGCOM,
              norme telco, marketing diretto, contest)</li>
          <li>Trattamento dei dati raccolti tramite i link esterni delle landing (WhatsApp, Instagram, ecc.)</li>
          <li>Privacy policy e cookie policy specifiche del dominio del titolare</li>
          <li>Eventuali violazioni di copyright dei contenuti caricati</li>
          <li>Disservizi causati dal mancato rinnovo del dominio o configurazione DNS errata</li>
        </ul>
        <p className="bg-red-50 border-l-2 border-red-400 p-3 rounded-r mt-2">
          <strong>L'Org Admin si impegna a:</strong> fornire informativa privacy adeguata sul proprio dominio,
          gestire i consensi marketing dei propri utenti finali, e utilizzare la piattaforma nel rispetto
          delle leggi italiane ed europee.
        </p>
      </Section>

      <Section icon={AlertTriangle} title="Limitazione di responsabilità">
        <p>
          La piattaforma è fornita <strong>"as-is"</strong>, senza garanzie esplicite o implicite di
          funzionamento continuo, idoneità a uno scopo specifico, o assenza di bug.
        </p>
        <p>
          In nessun caso il creatore di QRHub potrà essere ritenuto responsabile per:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Perdite di dati causate da disservizi dei provider terzi</li>
          <li>Interruzioni di servizio dovute al raggiungimento dei limiti free tier</li>
          <li>Danni diretti o indiretti derivanti dall'uso (o impossibilità d'uso) della piattaforma</li>
          <li>Modifiche o interruzioni del servizio comunicate con ragionevole preavviso</li>
        </ul>
        <p>
          Per esigenze di business-critical, l'utente è tenuto a valutare autonomamente backup esterni
          dei propri dati (esportabili in ogni momento dall'interfaccia) e/o a richiedere un piano a pagamento
          dedicato (da concordare per iscritto).
        </p>
      </Section>

      <Section icon={FileText} title="Open source e contributi">
        <p>
          Il codice sorgente è disponibile su GitHub con licenza MIT. Contributi, segnalazioni di bug e
          suggerimenti sono benvenuti tramite issue o pull request.
        </p>
        <a href="https://github.com" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[#F96815] hover:underline">
          GitHub repository <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Section>

      {isSuper && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-purple-900"
              data-testid="super-admin-notice">
          <p className="font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />Nota per il Super Admin
          </p>
          <p className="text-xs mt-1">
            Tu sei il creatore della piattaforma. Questa pagina è visibile a tutti gli org admin
            registrati ed è il riferimento legale ufficiale del progetto. Per modifiche al testo,
            edita il file <code className="bg-white px-1 rounded">/app/frontend/src/pages/Legal.js</code>.
          </p>
        </div>
      )}

      <footer className="text-center text-xs text-gray-500 pt-4 pb-2">
        QRHub © 2026 · MIT License · Nessun dato identificativo viene tracciato.
      </footer>
    </div>
  );
};

export default Legal;
