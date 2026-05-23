import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Sparkles, Copy, Check, X } from 'lucide-react';
import LoginLegalFooter from '@/components/LoginLegalFooter';

// Mailto helper for the "Richiedi accesso" badge — pre-fills subject + body so
// prospects don't have to think about what to write.
const REQUEST_MAIL = 'richiedi@qrhub.it';
const REQUEST_SUBJECT = 'Richiesta accesso piattaforma QRHub';
const REQUEST_BODY = `Salve,

sono interessato all'utilizzo della piattaforma QRHub per la mia organizzazione.

Potete fornirmi qualche informazione su:
- come funziona la piattaforma e cosa offre
- modalità di onboarding e configurazione del dominio
- costi e modalità di collaborazione

I miei riferimenti:
- Nome / Ragione sociale:
- Settore / Attività:
- Numero approssimativo di venditori da gestire:
- Sito web / Riferimenti:

Resto in attesa di un riscontro, grazie!`;

const buildRequestMailto = () => {
  const subject = encodeURIComponent(REQUEST_SUBJECT);
  const body = encodeURIComponent(REQUEST_BODY);
  return `mailto:${REQUEST_MAIL}?subject=${subject}&body=${body}`;
};

const Login = () => {
  const navigate = useNavigate();
  const { login, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Mailto modal: many desktop browsers / kiosk machines don't have a default
  // mail client and `mailto:` silently fails. We try mailto first and, if the
  // user is still on the page after a short delay (or just wants to copy the
  // message manually), they can open the modal with the full text + a Copy
  // button.
  const [mailModalOpen, setMailModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRequestAccess = (e) => {
    // We don't preventDefault the anchor — on devices with a mail client
    // configured it'll open immediately. Then ~700ms later we surface the
    // modal so desktop users without one have an alternative. If the user
    // already left the page (mailto opened the OS handler) they never see it.
    setTimeout(() => {
      if (!document.hidden) {
        setMailModalOpen(true);
      }
    }, 700);
  };

  const handleCopyText = async () => {
    const full = `A: ${REQUEST_MAIL}\nOggetto: ${REQUEST_SUBJECT}\n\n${REQUEST_BODY}`;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      toast.success('Testo copiato — incollalo nel tuo client email');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Copia manuale: seleziona e premi Ctrl+C');
    }
  };

  // Auto-redirect: if the user is already authenticated (cookie still valid)
  // there's no point in re-asking for the password. Bounces straight to the
  // dashboard so navigating Home → back to /login feels seamless.
  useEffect(() => {
    if (!authLoading && user && user.email) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
      toast.success('Login effettuato');
      navigate('/dashboard');
    } catch (error) {
      const msg = error.response?.data?.detail || 'Credenziali non valide';
      toast.error(typeof msg === 'string' ? msg : 'Errore di login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-12 h-12 rounded-xl bg-[#D2FA46] flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="w-7 h-7">
                <rect x="3" y="3" width="7" height="7" rx="1.2"/>
                <rect x="14" y="3" width="7" height="7" rx="1.2"/>
                <rect x="3" y="14" width="7" height="7" rx="1.2"/>
                <line x1="14" y1="14" x2="21" y2="14"/>
                <line x1="14" y1="18" x2="18" y2="18"/>
                <line x1="14" y1="21" x2="21" y2="21"/>
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-gray-900 dark:text-white mb-2">
            QRHub
          </h1>
          <p className="text-gray-600 dark:text-[#8a8a92]">Pannello Amministratore</p>
        </div>

        <div className="bg-white dark:bg-[#131316] rounded-lg border border-gray-200 dark:border-white/10 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email" data-testid="login-email-label">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email-input"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="password" data-testid="login-password-label">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password-input"
                className="mt-2"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
              data-testid="login-submit-button"
            >
              {loading ? 'Accesso...' : 'Accedi'}
            </Button>
          </form>
        </div>

        {/* Onboarding CTA — prospects without credentials can request access
            with a single tap. The mailto pre-fills subject + body so they
            don't have to think about wording. */}
        <a
          href={buildRequestMailto()}
          onClick={handleRequestAccess}
          className="mt-5 group relative block rounded-2xl border border-[#D2FA46]/30 bg-[#D2FA46]/[0.06] hover:bg-[#D2FA46]/[0.12] dark:bg-[#D2FA46]/[0.04] dark:hover:bg-[#D2FA46]/[0.08] transition-all p-4 text-center overflow-hidden cursor-pointer"
          data-testid="login-request-access-cta"
        >
          <span
            aria-hidden="true"
            className="absolute -inset-px rounded-2xl pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity"
            style={{
              background: 'radial-gradient(circle at 30% 0%, rgba(210,250,70,0.25), transparent 60%)',
            }}
          />
          <div className="relative flex items-center justify-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-[#a8c930] dark:text-[#D2FA46]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#a8c930] dark:text-[#D2FA46]">
              Nuovo qui?
            </span>
          </div>
          <p className="relative text-sm font-semibold text-gray-900 dark:text-white">
            Richiedi l'accesso alla piattaforma
          </p>
          <p className="relative text-[12px] text-gray-600 dark:text-[#8a8a92] mt-0.5">
            Ti rispondiamo entro 7 giorni lavorativi · richiedi@qrhub.it
          </p>
        </a>

        <LoginLegalFooter />
      </div>

      {mailModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setMailModalOpen(false)}
          data-testid="mailto-fallback-modal"
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-[#131316] rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 dark:border-white/10">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-[#a8c930] dark:text-[#D2FA46] mb-1">
                  Richiesta accesso
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                  Il client email non si è aperto?
                </h2>
                <p className="text-xs text-gray-600 dark:text-[#8a8a92] mt-1">
                  Nessun problema. Copia il testo qui sotto e inviacelo dal tuo provider preferito (Gmail web, Outlook, ecc.).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMailModalOpen(false)}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 dark:text-[#8a8a92] flex-shrink-0"
                aria-label="Chiudi"
                data-testid="mailto-modal-close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-[#6a6a72]">Destinatario</Label>
                <div className="mt-1 text-sm font-mono text-gray-900 dark:text-white bg-gray-50 dark:bg-[#0a0a0b] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 select-all">
                  {REQUEST_MAIL}
                </div>
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-[#6a6a72]">Oggetto</Label>
                <div className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-[#0a0a0b] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 select-all">
                  {REQUEST_SUBJECT}
                </div>
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-[#6a6a72]">Testo del messaggio</Label>
                <pre className="mt-1 text-[12.5px] leading-relaxed text-gray-900 dark:text-[#d8d8de] whitespace-pre-wrap bg-gray-50 dark:bg-[#0a0a0b] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-3 max-h-60 overflow-y-auto font-sans select-all">{REQUEST_BODY}</pre>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 bg-gray-50 dark:bg-[#0e0e10] border-t border-gray-200 dark:border-white/10">
              <Button
                variant="outline"
                onClick={() => setMailModalOpen(false)}
                data-testid="mailto-modal-cancel"
              >
                Annulla
              </Button>
              <Button
                onClick={handleCopyText}
                className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
                data-testid="mailto-modal-copy"
              >
                {copied ? (
                  <><Check className="h-4 w-4 mr-2" />Copiato!</>
                ) : (
                  <><Copy className="h-4 w-4 mr-2" />Copia tutto</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;