import LegalShell from '@/components/LegalShell';
import '@/pages/Legal.public.css';

/**
 * Public license statement for QRHub. Adopts the PolyForm Noncommercial 1.0.0
 * license as the legal backbone (a battle-tested source-available license)
 * and adds an explicit prior-authorization clause for any clone/fork/study,
 * matching the owner's stated intent: "open ma riservato, collaborazioni
 * no-profit previa autorizzazione".
 */
const License = () => (
  <LegalShell
    eyebrow="Licenza"
    title="Licenza d'uso del codice QRHub"
    subtitle="Source-available, non commerciale, collaborazione su autorizzazione. Basata sulla PolyForm Noncommercial 1.0.0 con clausola di autorizzazione preventiva."
    updated="Maggio 2026"
  >
    <div className="legal-callout">
      <strong>In una riga.</strong> Il codice sorgente di QRHub è visionabile e modificabile per finalità non commerciali, didattiche o di ricerca, ma <em>solo dopo aver ottenuto un'autorizzazione scritta</em> dal titolare. Nessun uso commerciale, nessuna rivendita, nessun fork pubblico senza accordo.
    </div>

    <h2><span className="num">1.</span> Filosofia del progetto</h2>
    <p>
      QRHub è un progetto <strong>aperto ma riservato</strong>. Aperto perché crediamo nella trasparenza tecnica: chiunque collabori al progetto deve poterne ispezionare ogni riga per verificare cosa fa, come tratta i dati e dove le scelte sono opinabili. Riservato perché il valore di un software multi-tenant per piccole organizzazioni non sta nelle righe di codice ma nella combinazione di codice, dominio, infrastruttura, supporto e responsabilità GDPR: distribuirlo come prodotto commerciale altrove svuoterebbe questo equilibrio.
    </p>
    <p>
      Per questo abbiamo scelto una licenza <strong>source-available non commerciale</strong>: massima trasparenza per chi collabora in buona fede, massima protezione contro l'appropriazione commerciale del progetto.
    </p>

    <h2><span className="num">2.</span> Cosa è consentito</h2>
    <ul>
      <li><strong>Ispezione del codice</strong> per audit di sicurezza, verifica GDPR, finalità di ricerca, didattica o studio personale — previa autorizzazione scritta del titolare.</li>
      <li><strong>Modifica e contribuzione</strong> al progetto tramite pull request o patch, sempre previa autorizzazione e accettazione di un Contributor License Agreement (CLA).</li>
      <li><strong>Esecuzione locale</strong> di un'istanza per finalità non commerciali (studio, test, prototipazione interna).</li>
      <li><strong>Uso operativo</strong> come organizzazione cliente nei termini stabiliti contrattualmente con il titolare.</li>
    </ul>

    <h2><span className="num">3.</span> Cosa è vietato</h2>
    <ul>
      <li><strong>Uso commerciale</strong> diretto o indiretto, inclusa la rivendita, l'offerta come SaaS, la sublicenza, l'integrazione in prodotti a pagamento.</li>
      <li><strong>Distribuzione</strong> pubblica del codice o di derivati senza autorizzazione scritta.</li>
      <li><strong>Fork pubblici</strong> su repository pubblici GitHub, GitLab o altre piattaforme.</li>
      <li><strong>Pubblicazione</strong> di porzioni significative di codice in articoli, libri, corsi o materiale formativo senza accordo.</li>
      <li><strong>Reverse engineering</strong> di componenti compilati o offuscati al di fuori dei casi consentiti da legge inderogabile.</li>
      <li><strong>Rimozione</strong> dei riferimenti al titolare, alla licenza, ai copyright o agli avvisi di proprietà intellettuale.</li>
    </ul>

    <h2><span className="num">4.</span> Procedura di autorizzazione</h2>
    <p>
      Per richiedere l'accesso al codice o proporre una collaborazione, scrivi a <a href="mailto:collaborazioni@qrhub.it">collaborazioni@qrhub.it</a> indicando:
    </p>
    <ul>
      <li>chi sei (persona fisica o giuridica);</li>
      <li>la finalità d'uso (studio, audit, ricerca, contribuzione, integrazione interna no-profit);</li>
      <li>se la finalità è commerciale o meno;</li>
      <li>il livello di accesso che richiedi (sola lettura, contribuzione, esecuzione).</li>
    </ul>
    <p>
      Il titolare valuta la richiesta caso per caso e risponde entro un tempo ragionevole. L'autorizzazione, quando concessa, è personale, non cedibile e revocabile.
    </p>

    <h2><span className="num">5.</span> Basi giuridiche di questa licenza</h2>
    <p>
      Il presente testo costituisce una licenza d'uso del codice sorgente. Il riferimento standard adottato è la <strong>PolyForm Noncommercial 1.0.0</strong> (<a href="https://polyformproject.org/licenses/noncommercial/1.0.0/" target="_blank" rel="noreferrer">polyformproject.org/licenses/noncommercial/1.0.0</a>), licenza source-available di larga adozione che vieta l'uso commerciale e consente l'uso non commerciale (didattico, di ricerca, personale, no-profit).
    </p>
    <p>
      Ai termini della PolyForm Noncommercial il presente documento aggiunge le seguenti clausole rafforzative:
    </p>
    <ul>
      <li><strong>Clausola di autorizzazione preventiva</strong> — l'accesso, la copia, lo studio e la modifica del codice sono subordinati al consenso scritto del titolare, da richiedere come indicato all'art. 4.</li>
      <li><strong>Clausola di non-fork pubblico</strong> — la pubblicazione del codice o di derivati su repository pubblici è vietata anche per usi non commerciali.</li>
      <li><strong>Clausola di reversibilità delle autorizzazioni</strong> — il titolare può revocare un'autorizzazione concessa in caso di violazione dei termini o di mutamento delle finalità dichiarate dal beneficiario.</li>
    </ul>

    <h2><span className="num">6.</span> Marchio e identità</h2>
    <p>
      "QRHub" è il nome del progetto. L'uso del nome, del logo e delle scritte distintive per identificare il progetto è consentito nei limiti del fair use (citazione, recensione, riferimento). È vietato presentare derivati o servizi terzi con il nome "QRHub" o con marchi confondibili.
    </p>

    <h2><span className="num">7.</span> Garanzie e responsabilità</h2>
    <p>
      Il software è fornito "<em>as-is</em>", senza alcuna garanzia espressa o implicita di idoneità a un particolare scopo, di assenza di vizi o di non violazione di diritti di terzi. Il titolare non risponde di danni diretti o indiretti derivanti dall'uso o dalla mancata possibilità di utilizzo del codice.
    </p>

    <h2><span className="num">8.</span> Contatto</h2>
    <p>
      Per richieste di autorizzazione, segnalazioni di violazione o domande sulla licenza: <a href="mailto:collaborazioni@qrhub.it">collaborazioni@qrhub.it</a>.
    </p>

    <div className="legal-callout" style={{ marginTop: 40 }}>
      Grazie per rispettare il lavoro che c'è dietro a questo progetto. Le piccole organizzazioni che usano QRHub contano sul fatto che resti uno strumento curato, trasparente e non dilavato dal mercato.
    </div>
  </LegalShell>
);

export default License;
