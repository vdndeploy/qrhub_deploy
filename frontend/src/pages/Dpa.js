import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FileSignature, CheckCircle2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Dpa = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    axios.get(`${API}/me/dpa-status`, { withCredentials: true })
      .then(r => setStatus(r.data))
      .catch(() => {});
  }, []);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await axios.post(`${API}/me/accept-dpa`, {}, { withCredentials: true });
      toast.success('DPA accettato');
      const { data } = await axios.get(`${API}/me/dpa-status`, { withCredentials: true });
      setStatus(data);
      setTimeout(() => navigate('/dashboard'), 1200);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore');
    } finally {
      setAccepting(false);
    }
  };

  if (status && !status.required) {
    return (
      <div className="max-w-3xl" data-testid="dpa-not-required">
        <h1 className="text-2xl font-bold mb-2">Data Processing Agreement</h1>
        <p className="text-gray-600 dark:text-[#8a8a92]">
          Sei il super admin della piattaforma: non c'è bisogno che tu firmi un DPA con te stesso.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl" data-testid="dpa-page">
      <header className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <FileSignature className="h-7 w-7 text-emerald-700" />
          Data Processing Agreement (DPA)
        </h1>
        <p className="text-sm text-gray-500 dark:text-[#6a6a72] mt-1">
          Versione corrente: <strong>{status?.current_version || '1.0'}</strong>
          {status?.accepted && (
            <> · <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />Accettato il {status.accepted_at}</span></>
          )}
        </p>
      </header>

      <article className="bg-white dark:bg-[#131316] border border-gray-200 dark:border-white/10 rounded-xl p-6 prose prose-sm max-w-none">
        <h2>1. Premesse</h2>
        <p>
          Il presente accordo (di seguito <em>"DPA"</em>) disciplina i ruoli e gli obblighi tra:
        </p>
        <ul>
          <li><strong>Titolare del trattamento (Controller)</strong>: l'organizzazione che utilizza QRHub per pubblicare
            landing page e raccogliere metriche aggregate sui propri venditori (di seguito <em>"Tu"</em> o <em>"Cliente"</em>);</li>
          <li><strong>Responsabile del trattamento (Processor)</strong>: <strong>QRHub</strong>, piattaforma open source
            (licenza MIT) creata e mantenuta da un soggetto privato a titolo personale, senza scopo di lucro,
            senza struttura societaria e senza dipendenti (di seguito <em>"QRHub"</em>).</li>
        </ul>
        <div className="not-prose bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r text-sm text-amber-900 my-3">
          <strong>Natura non commerciale del servizio.</strong> Il Cliente prende atto e accetta espressamente che
          QRHub è un software fornito <strong>gratuitamente</strong>, in modalità <strong>self-served</strong>,
          all'interno dei limiti dei piani gratuiti (free tier) dei fornitori di infrastruttura indicati al §4.
          QRHub non è un fornitore SaaS commerciale: non esiste un canone, un SLA contrattuale, né un'assistenza
          tecnica garantita. Il Cliente conferma di aver scelto liberamente di adottare la piattaforma in piena
          consapevolezza di questa natura non commerciale.
        </div>

        <h2>2. Oggetto del trattamento</h2>
        <p>
          QRHub fornisce al Cliente l'infrastruttura tecnologica per pubblicare landing page con QR code e raccogliere
          metriche statistiche aggregate (visite, click, città di provenienza approssimativa, device, OS, browser).
          Nessun dato identificativo individuale viene memorizzato lato QRHub.
        </p>

        <h2>3. Tipologia di dati trattati</h2>
        <ul>
          <li>Eventi aggregati (page_view, click_*) privi di identificatori personali.</li>
          <li>Subnet anonimizzata (IPv4 /24, IPv6 /48) usata solo come chiave di cache geo, conservata 7 giorni.</li>
          <li>Cookie tecnici <code>access_token</code> e <code>vendor_token</code> per autenticazione dashboard (24h).</li>
        </ul>

        <h2>4. Sub-responsabili autorizzati</h2>
        <p>Il Cliente autorizza QRHub a designare i seguenti sub-responsabili:</p>
        <ul>
          <li><strong>Fly.io</strong> (hosting backend, region Frankfurt EU)</li>
          <li><strong>Vercel</strong> (hosting frontend / CDN, edge globale — trasferimenti coperti da SCC + Vercel DPA)</li>
          <li><strong>MongoDB Atlas</strong> (database, region dichiarata in console — SCC + DPA disponibili)</li>
          <li><strong>Cloudinary</strong> (CDN immagini/video, default US — EU-US Data Privacy Framework + SCC)</li>
          <li><strong>ipapi.co</strong> (geo-lookup città; IP individuale mai memorizzato lato QRHub)</li>
        </ul>
        <p className="text-xs text-gray-600 dark:text-[#8a8a92]">
          Il Cliente è tenuto a verificare e accettare autonomamente i DPA e le SCC dei singoli fornitori sopra
          elencati, secondo i loro termini di servizio. QRHub non è parte di tali rapporti contrattuali e non
          può modificarne le condizioni.
        </p>

        <h2>5. Misure di sicurezza (Art. 32 GDPR)</h2>
        <ul>
          <li>Cifratura in transito TLS 1.2+ su tutti i servizi.</li>
          <li>Cifratura at-rest su MongoDB Atlas e Cloudinary.</li>
          <li>Password hashate con bcrypt cost 12.</li>
          <li>JWT firmati HS256 con secret rotabile dal pannello Super Admin.</li>
          <li>Rate-limit anti brute-force su tutti gli endpoint di login (5 tentativi / 15 minuti).</li>
          <li>Isolamento multi-tenant via <code>organization_id</code> scope su ogni query.</li>
          <li>Logging applicativo privo di password e token.</li>
        </ul>

        <h2>6. Responsabilità del Cliente (Titolare)</h2>
        <p>
          Il Cliente, in qualità di Titolare autonomo del trattamento, è e rimane il <strong>solo responsabile</strong> nei confronti
          degli interessati, del Garante della Privacy e di qualsiasi autorità competente per quanto riguarda:
        </p>
        <ul>
          <li>la liceità del trattamento dei dati raccolti tramite le proprie landing page;</li>
          <li>l'informativa privacy e il banner cookie pubblicati sul proprio dominio personalizzato;</li>
          <li>la gestione dei consensi marketing degli utenti finali;</li>
          <li>la risposta alle richieste di esercizio dei diritti degli interessati (artt. 15–22 GDPR);</li>
          <li>il rispetto delle normative settoriali applicabili (es. AGCOM, codici di condotta telco/marketing);</li>
          <li>i contenuti pubblicati sulle landing (testi, immagini, link, messaggi WhatsApp);</li>
          <li>la nomina interna del DPO ove obbligatorio.</li>
        </ul>
        <p>
          QRHub fornisce esclusivamente strumenti tecnici per facilitare l'adempimento (export dati, cancellazione
          account, anonimizzazione di default) ma non assume alcun ruolo consultivo, legale o di compliance verso il Cliente.
        </p>

        <h2>7. Diritti dell'interessato</h2>
        <p>
          Il Cliente in qualità di Titolare resta responsabile dell'esercizio dei diritti degli interessati
          (artt. 15-22 GDPR). QRHub mette a disposizione i seguenti endpoint tecnici per facilitare gli adempimenti:
        </p>
        <ul>
          <li><code>GET /api/me/data-export</code> — esportazione dati personali utente</li>
          <li><code>DELETE /api/me</code> — diritto all'oblio</li>
          <li><code>POST /api/me/revoke-all-sessions</code> — revoca sessioni</li>
          <li><code>DELETE /api/organizations/{'{'}id{'}'}</code> — cancellazione totale tenant (cascade)</li>
        </ul>

        <h2>8. Notifica violazioni dati (Art. 33 GDPR)</h2>
        <p>
          In caso di violazione di sicurezza nota a QRHub e potenzialmente impattante sui dati del Cliente, QRHub si
          impegna a notificare il Cliente <strong>il prima possibile e comunque entro 72 ore</strong> dalla scoperta
          documentata, utilizzando l'email registrata nel profilo organizzazione. Tale notifica è fornita a titolo
          collaborativo e <em>best-effort</em>: stante la natura non commerciale del servizio e l'assenza di un team di
          incident response 24/7, QRHub non garantisce tempi o modalità di rilevazione delle violazioni.
        </p>

        <h2>9. Limitazione di responsabilità ed esclusione di garanzia</h2>
        <p>
          QRHub è fornito <strong>"AS-IS" e "AS-AVAILABLE"</strong>, in coerenza con la licenza MIT, <strong>senza alcuna
          garanzia</strong> esplicita o implicita di funzionamento continuo, idoneità a uno scopo specifico,
          commerciabilità, assenza di bug o di vulnerabilità.
        </p>
        <p>
          Nella massima misura consentita dalla legge applicabile, e fatta salva la responsabilità per dolo o colpa
          grave non rinunciabile per legge, il Cliente <strong>esonera espressamente</strong> QRHub e il soggetto privato
          che lo mantiene da qualunque responsabilità — diretta, indiretta, incidentale, consequenziale, punitiva,
          patrimoniale o non patrimoniale — derivante o connessa a:
        </p>
        <ul>
          <li>indisponibilità, interruzione o sospensione del servizio (anche per superamento dei limiti free tier o decisione unilaterale di cessazione);</li>
          <li>perdita, alterazione o esfiltrazione di dati dovuta a malfunzionamenti dei sub-responsabili indicati al §4;</li>
          <li>provvedimenti del Garante, sanzioni, contenziosi o richieste di risarcimento avanzate da interessati o terzi nei confronti del Cliente in relazione al trattamento sotto la sua titolarità;</li>
          <li>danni reputazionali, mancato guadagno o opportunità commerciali perse dal Cliente;</li>
          <li>contenuti pubblicati dal Cliente sulle proprie landing e dalle conseguenze del loro pubblico utilizzo.</li>
        </ul>
        <p>
          Il Cliente riconosce che il valore complessivo della prestazione QRHub è pari a zero e che, di
          conseguenza, qualsiasi eventuale responsabilità residua non potrà comunque eccedere tale importo.
        </p>

        <h2>10. Backup ed export</h2>
        <p>
          Il Cliente prende atto che QRHub non garantisce backup esterni dei dati con frequenza fissa o retention
          minima. Il Cliente è invitato a eseguire <strong>backup autonomi periodici</strong> utilizzando gli strumenti
          di export forniti dal pannello (export analytics PDF, export dati utente JSON, export immagini dalla
          libreria Cloudinary). Per esigenze business-critical il Cliente deve dotarsi di soluzioni di backup
          indipendenti.
        </p>

        <h2>11. Durata e cessazione</h2>
        <p>
          Il presente DPA è efficace dalla data di accettazione e rimane in vigore finché il Cliente utilizza la
          piattaforma. Al termine, il Cliente può richiedere la cancellazione totale dei dati tramite l'endpoint
          <code>DELETE /api/organizations/{'{'}id{'}'}</code> (cascade) o contattando il super admin.
        </p>

        <h2>12. Modifiche al DPA</h2>
        <p>
          QRHub si riserva il diritto di aggiornare il presente DPA per riflettere modifiche normative, dei
          sub-responsabili o delle misure di sicurezza. Le modifiche saranno comunicate tramite il pannello e
          richiederanno una nuova accettazione esplicita prima di proseguire nell'utilizzo della piattaforma.
        </p>

        <h2>13. Legge applicabile e foro competente</h2>
        <p>
          Legge italiana — Regolamento (UE) 2016/679 (GDPR) e D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018.
          Per qualunque controversia non risolvibile in via amichevole si rinvia alle norme di legge in materia di
          foro del consumatore ove applicabili; in difetto, foro di Verona.
        </p>
      </article>

      {!status?.accepted && (
        <div className="mt-5 bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-emerald-900">
            Accettando confermi di aver letto e compreso i termini del DPA versione <strong>{status?.current_version}</strong>.
            La data, l'ora e l'indirizzo IP verranno registrati come prova dell'accettazione.
          </p>
          <Button onClick={handleAccept} disabled={accepting}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white"
                  data-testid="dpa-accept-button">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {accepting ? 'Salvataggio…' : 'Accetto il DPA'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default Dpa;
