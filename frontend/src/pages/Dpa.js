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
        <p className="text-gray-600">
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
        <p className="text-sm text-gray-500 mt-1">
          Versione corrente: <strong>{status?.current_version || '1.0'}</strong>
          {status?.accepted && (
            <> · <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />Accettato il {status.accepted_at}</span></>
          )}
        </p>
      </header>

      <article className="bg-white border border-gray-200 rounded-xl p-6 prose prose-sm max-w-none">
        <h2>1. Premesse</h2>
        <p>
          Il presente accordo (di seguito <em>"DPA"</em>) disciplina i ruoli e gli obblighi tra:
        </p>
        <ul>
          <li><strong>Titolare del trattamento (Controller)</strong>: l'organizzazione che utilizza QRHub per pubblicare
            landing page e raccogliere metriche aggregate sui propri venditori (di seguito <em>"Tu"</em> o <em>"Cliente"</em>);</li>
          <li><strong>Responsabile del trattamento (Processor)</strong>: <strong>QRHub</strong>, piattaforma open source
            (licenza MIT) creata e mantenuta a titolo personale, senza scopo di lucro.</li>
        </ul>

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

        <h2>6. Diritti dell'interessato</h2>
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

        <h2>7. Notifica violazioni dati (Art. 33 GDPR)</h2>
        <p>
          In caso di violazione di sicurezza, QRHub si impegna a notificare il Cliente entro 72 ore dalla scoperta,
          tramite l'email registrata nel profilo organizzazione.
        </p>

        <h2>8. Durata e cessazione</h2>
        <p>
          Il presente DPA è efficace dalla data di accettazione e rimane in vigore finché il Cliente utilizza la
          piattaforma. Al termine, il Cliente può richiedere la cancellazione totale dei dati tramite l'endpoint
          <code>DELETE /api/organizations/{'{'}id{'}'}</code> (cascade) o contattando il super admin.
        </p>

        <h2>9. Limitazione di responsabilità</h2>
        <p>
          QRHub è fornito <strong>"as-is"</strong> senza garanzie esplicite o implicite, in coerenza con la licenza MIT.
          La responsabilità di QRHub è limitata al massimo consentito dalla legge, considerando la natura non commerciale
          del progetto. Per esigenze business-critical il Cliente è tenuto a valutare backup esterni autonomi.
        </p>

        <h2>10. Legge applicabile</h2>
        <p>Legge italiana — Regolamento (UE) 2016/679 (GDPR) e D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018.</p>
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
