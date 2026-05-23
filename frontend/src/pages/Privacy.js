import LegalShell from '@/components/LegalShell';
import '@/pages/Legal.public.css';

/**
 * Public Privacy notice for qrhub.it itself — covers only what the marketing
 * site processes (essentially nothing: theme preference in localStorage and
 * server logs). For tenant landings, see /v/:vendorId/privacy which is owned
 * by each organization.
 */
const Privacy = () => (
  <LegalShell
    eyebrow="Privacy"
    title="Informativa Privacy del sito QRHub"
    subtitle="Cosa raccoglie qrhub.it. Per la privacy delle landing dei venditori, ogni organizzazione pubblica la propria informativa sul proprio dominio personalizzato."
    updated="Maggio 2026"
  >
    <div className="legal-callout">
      <strong>In breve.</strong> Il sito vetrina <a href="https://qrhub.it">qrhub.it</a> non utilizza cookie di tracciamento, non profila visitatori, non vende dati a terzi. L'unica preferenza salvata localmente sul tuo browser è il tema chiaro/scuro. I dati personali sono raccolti soltanto se ci scrivi spontaneamente a <a href="mailto:collaborazioni@qrhub.it">collaborazioni@qrhub.it</a>.
    </div>

    <h2><span className="num">1.</span> Titolare del trattamento</h2>
    <p>
      Il titolare del trattamento dei dati raccolti tramite qrhub.it è il proprietario della piattaforma indicato nella sezione Impostazioni Organizzazione del pannello QRHub. Contatto privacy: <a href="mailto:collaborazioni@qrhub.it">collaborazioni@qrhub.it</a>.
    </p>

    <h2><span className="num">2.</span> Distinzione fondamentale: piattaforma ≠ landing</h2>
    <p>
      QRHub funziona su <strong>due livelli separati</strong> sotto il profilo della privacy:
    </p>
    <ul>
      <li><strong>qrhub.it</strong> — il sito vetrina che stai leggendo. Tratta dati solo nei termini di questa pagina.</li>
      <li><strong>landing dei venditori</strong> (<code>app.tuaorg.it/v/...</code>) — pubblicate sui domini personalizzati delle organizzazioni. Ogni organizzazione è <strong>titolare autonomo</strong> del trattamento dei dati dei propri visitatori, pubblica la propria informativa sotto <code>/v/:vendor/privacy</code> e gestisce il proprio banner cookie.</li>
    </ul>
    <div className="legal-warn">
      <strong>Importante.</strong> Tutto ciò che riguarda le visite alle landing <code>/v/...</code> (analytics, banner cookie, eventuali interazioni con annunci o WhatsApp) ricade sotto la responsabilità della singola organizzazione proprietaria del dominio. QRHub fornisce solo l'infrastruttura tecnica e gli strumenti per l'adempimento.
    </div>

    <h2><span className="num">3.</span> Cosa raccoglie qrhub.it</h2>

    <h3>3.1 Navigazione del sito vetrina</h3>
    <p>
      Visitando qrhub.it non vengono installati cookie di analytics, marketing o profilazione. Il browser scambia con il server soltanto i dati strettamente tecnici necessari a servire la pagina (richiesta HTTP, indirizzo IP per il routing, user-agent). Tali dati sono presenti nei log del provider di hosting (Vercel) per le ordinarie finalità di sicurezza e diagnostica e sono cancellati secondo le policy di Vercel stesso.
    </p>

    <h3>3.2 Preferenza tema (localStorage)</h3>
    <p>
      Quando scegli il tema chiaro o scuro nel pannello, il valore <code>qrhub_theme</code> viene salvato nel localStorage del tuo browser. Si tratta di un <strong>cookie strettamente necessario</strong>: serve a ricordare la tua preferenza, non lascia il dispositivo, non identifica te personalmente. Puoi cancellarlo dalle impostazioni del browser.
    </p>

    <h3>3.3 Contatti via email</h3>
    <p>
      Se ci scrivi a <a href="mailto:collaborazioni@qrhub.it">collaborazioni@qrhub.it</a>, raccogliamo il tuo indirizzo email e il contenuto del messaggio per rispondere alla tua richiesta. La base giuridica è la tua richiesta esplicita (art. 6.1.b GDPR). I messaggi sono conservati per il tempo necessario a evadere la richiesta e per al massimo 24 mesi successivi.
    </p>

    <h3>3.4 Accesso ai pannelli di amministrazione</h3>
    <p>
      Quando un amministratore o un venditore accede al proprio pannello, vengono trattati: email, ruolo, ID organizzazione, sessione JWT (cookie strettamente necessario), audit log delle azioni amministrative sensibili. Base giuridica: contratto / interesse legittimo a garantire la sicurezza dell'accesso. Conservazione: fino alla disattivazione dell'account.
    </p>

    <h2><span className="num">4.</span> Cosa NON raccoglie qrhub.it</h2>
    <ul>
      <li>Non installa cookie di tracciamento sul sito vetrina.</li>
      <li>Non utilizza Google Analytics, Facebook Pixel o simili sul sito vetrina.</li>
      <li>Non vende, cede o concede a terzi i dati raccolti, neanche in forma aggregata.</li>
      <li>Non profila l'attività dei visitatori di qrhub.it.</li>
    </ul>

    <h2><span className="num">5.</span> Destinatari dei dati</h2>
    <p>
      I dati sono trattati esclusivamente dal personale autorizzato del titolare e dai seguenti responsabili esterni, scelti tra fornitori con garanzie GDPR adeguate:
    </p>
    <ul>
      <li><strong>Vercel</strong> — hosting frontend e CDN.</li>
      <li><strong>Fly.io</strong> — hosting backend e container compute.</li>
      <li><strong>MongoDB Atlas</strong> — database in Cloud, region EU.</li>
      <li><strong>Cloudinary</strong> — storage media uploads.</li>
    </ul>
    <p>
      Per le landing dei venditori, ulteriori responsabili sono nominati direttamente dalle organizzazioni nella propria informativa privacy.
    </p>

    <h2><span className="num">6.</span> Trasferimenti extra-UE</h2>
    <p>
      Alcuni fornitori (Vercel, Fly.io, Cloudinary) possono avere infrastrutture anche fuori dall'UE. In tali casi i trasferimenti sono coperti dalle Clausole Contrattuali Standard della Commissione Europea (SCC) o, per gli USA, dal Data Privacy Framework.
    </p>

    <h2><span className="num">7.</span> I tuoi diritti</h2>
    <p>Puoi esercitare in qualunque momento i diritti previsti dagli artt. 15-22 GDPR:</p>
    <ul>
      <li>accesso ai tuoi dati;</li>
      <li>rettifica o aggiornamento;</li>
      <li>cancellazione;</li>
      <li>limitazione del trattamento;</li>
      <li>portabilità;</li>
      <li>opposizione;</li>
      <li>reclamo al Garante della Privacy (<a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer">garanteprivacy.it</a>).</li>
    </ul>
    <p>
      Per esercitare i diritti relativi a qrhub.it scrivi a <a href="mailto:collaborazioni@qrhub.it">collaborazioni@qrhub.it</a>. Per i diritti relativi ai dati raccolti dalle singole landing, rivolgiti direttamente all'organizzazione titolare del dominio (i contatti sono pubblicati nella privacy della landing stessa).
    </p>

    <h2><span className="num">8.</span> Modifiche</h2>
    <p>
      Questa informativa può essere aggiornata per riflettere modifiche tecniche o normative. La versione corrente è sempre disponibile a <a href="/privacy">qrhub.it/privacy</a>. Modifiche sostanziali saranno notificate agli amministratori delle organizzazioni tramite il pannello.
    </p>
  </LegalShell>
);

export default Privacy;
