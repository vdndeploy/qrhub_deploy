import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Download, ShieldOff, Trash2, KeyRound } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Section = ({ title, icon: Icon, children, accent = 'orange' }) => {
  const colors = {
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  };
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 mb-4">
      <h2 className={`text-lg font-semibold flex items-center gap-2 mb-2 ${colors[accent]?.split(' ')[2] || ''}`}>
        {Icon && <Icon className="h-5 w-5" />}{title}
      </h2>
      <div className="text-sm text-gray-700 space-y-3">{children}</div>
    </section>
  );
};

const MyAccount = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dpa, setDpa] = useState(null);

  useEffect(() => {
    axios.get(`${API}/me/dpa-status`, { withCredentials: true })
      .then(r => setDpa(r.data)).catch(() => {});
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await axios.get(`${API}/me/data-export`, { withCredentials: true });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qrhub-data-export-${(user?.email || 'me').replace(/[^a-z0-9]/gi, '_')}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Esportazione completata');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore esportazione');
    } finally {
      setExporting(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('Disconnettere TUTTI gli altri dispositivi/sessioni? La sessione attuale rimarrà attiva.')) return;
    setRevoking(true);
    try {
      await axios.post(`${API}/me/revoke-all-sessions`, {}, { withCredentials: true });
      toast.success('Tutte le altre sessioni sono state invalidate');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore');
    } finally {
      setRevoking(false);
    }
  };

  const handleDelete = async () => {
    if (user?.role === 'super_admin') {
      toast.error('Il super admin non può auto-eliminarsi');
      return;
    }
    const phrase = window.prompt(
      'Per confermare la cancellazione del tuo account scrivi:\n\nELIMINA'
    );
    if (phrase !== 'ELIMINA') {
      toast.info('Cancellazione annullata');
      return;
    }
    setDeleting(true);
    try {
      await axios.delete(`${API}/me`, { withCredentials: true });
      toast.success('Account eliminato');
      await logout();
      navigate('/login');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore eliminazione');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-3xl" data-testid="my-account-page">
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold">Il mio account</h1>
        <p className="text-sm text-gray-500 mt-1">Esercita i tuoi diritti GDPR e gestisci la sicurezza del tuo account.</p>
      </header>

      <Section title="Esporta i miei dati (Art. 15 GDPR)" icon={Download} accent="orange">
        <p>Scarica una copia di tutti i dati personali che la piattaforma conserva su di te in formato JSON.</p>
        <Button onClick={handleExport} disabled={exporting} className="bg-[#F96815] hover:bg-[#e05a0f]"
                data-testid="export-data-button">
          <Download className="h-4 w-4 mr-2" />{exporting ? 'Esportazione…' : 'Esporta i miei dati'}
        </Button>
      </Section>

      <Section title="Disconnetti tutte le sessioni" icon={KeyRound} accent="amber">
        <p>
          Invalida ogni token JWT attivo su altri dispositivi/browser. Utile se sospetti che le tue credenziali
          siano state compromesse. La sessione corrente verrà rinnovata e non sarai disconnesso da questa pagina.
        </p>
        <p className="text-xs text-gray-500">
          Nota: se sei anche venditore (vendor login), le sessioni vendor restano separate e devono essere revocate
          dal tuo profilo vendor.
        </p>
        <Button onClick={handleRevoke} disabled={revoking} variant="outline"
                data-testid="revoke-sessions-button"
                className="border-amber-300 text-amber-700 hover:bg-amber-50">
          <ShieldOff className="h-4 w-4 mr-2" />{revoking ? 'Invalidazione…' : 'Disconnetti tutte le altre sessioni'}
        </Button>
      </Section>

      {user?.role !== 'super_admin' && (
        <Section title="Elimina account (Art. 17 GDPR - diritto all'oblio)" icon={Trash2} accent="red">
          <p>
            Eliminazione <strong>definitiva</strong> e <strong>irreversibile</strong> del tuo account utente.
            I dati dell'organizzazione (negozi, venditori, post) NON vengono toccati: rimangono sotto la responsabilità
            del titolare.
          </p>
          <Button onClick={handleDelete} disabled={deleting} variant="outline"
                  data-testid="delete-account-button"
                  className="border-red-300 text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4 mr-2" />{deleting ? 'Eliminazione…' : 'Elimina il mio account'}
          </Button>
        </Section>
      )}

      {dpa && dpa.required && (
        <Section title="Data Processing Agreement (DPA)" icon={KeyRound} accent="emerald">
          <p>
            Stato attuale: {dpa.accepted
              ? <span className="font-semibold text-emerald-700">Accettato (versione {dpa.accepted_version})</span>
              : <span className="font-semibold text-amber-700">Non accettato — richiede la tua firma</span>}.
          </p>
          {dpa.accepted_at && (
            <p className="text-xs text-gray-500">Accettato il: {dpa.accepted_at}</p>
          )}
          <Button onClick={() => navigate('/dashboard/dpa')} variant="outline" data-testid="goto-dpa-button">
            Vedi DPA
          </Button>
        </Section>
      )}
    </div>
  );
};

export default MyAccount;
