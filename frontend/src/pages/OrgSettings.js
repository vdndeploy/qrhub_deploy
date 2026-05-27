import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Save, Upload, X, Plus, Trash2, Globe, Image as ImgIcon,
  CheckCircle2, Clock3, RefreshCw, Copy, AlertCircle, Cookie, ShieldCheck,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Suggested default copy for the per-org "data profiling" statement. The org
// can replace it from the OrgSettings UI; the landing privacy page falls back
// to this same text when the org hasn't customized it yet.
const DEFAULT_PROFILING_TEXT = `Quando interagisci con i pulsanti presenti su questa landing (chiamata WhatsApp, recensione Google, apertura Google Maps, social Instagram/Facebook/TikTok) lasci la nostra pagina ed entri in servizi gestiti da soggetti terzi che operano in autonomia come titolari del trattamento, ciascuno secondo la propria informativa privacy:

• Meta Platforms Ireland (WhatsApp, Instagram, Facebook): contatto, messaggi e profilazione pubblicitaria sulle proprie piattaforme. Privacy: https://www.facebook.com/privacy/policy/
• Google Ireland (Google Maps, Recensioni, Profilo aziendale): geolocalizzazione, contributi recensioni, profilazione search/maps. Privacy: https://policies.google.com/privacy
• TikTok Technology (TikTok): visualizzazione contenuti, raccomandazione e profilazione pubblicitaria. Privacy: https://www.tiktok.com/legal/privacy-policy

I dati che condividi con questi servizi non sono visibili né conservati da noi: viaggiano direttamente dal tuo dispositivo verso le piattaforme citate. Ti consigliamo di leggere le rispettive informative prima di interagire.`;

const DEFAULT_TERMS_TEXT = `L'utilizzo di questa landing presuppone l'accettazione delle seguenti condizioni:

• I contenuti pubblicati sono curati dal venditore e dalla nostra organizzazione, che ne è responsabile a tutti gli effetti.
• Le informazioni di contatto (numero WhatsApp, social, indirizzo) sono fornite per agevolare la comunicazione commerciale: non sostituiscono i canali ufficiali di assistenza clienti.
• Eventuali promozioni, prezzi e disponibilità sono indicativi e possono variare senza preavviso.
• La piattaforma tecnica QRHub fornisce solo il software che ospita la landing: non risponde dei contenuti, della loro accuratezza o della disponibilità del venditore.

Per segnalazioni, esercizio dei diritti GDPR o richieste relative ai contenuti scrivere al contatto privacy indicato nell'informativa.`;

const GDPR_REQUIRED = [
  { key: 'legal_name', label: 'Denominazione legale' },
  { key: 'vat_number', label: 'P.IVA / Codice Fiscale' },
  { key: 'legal_address', label: 'Sede legale' },
  { key: 'privacy_contact_email', label: 'Email contatto privacy' },
];
const GDPR_OPTIONAL = [
  { key: 'privacy_policy_url', label: 'URL policy estesa (bonus)' },
];

const GdprCompleteness = ({ org }) => {
  const filledRequired = GDPR_REQUIRED.filter(f => !!(org[f.key] || '').trim()).length;
  const filledOptional = GDPR_OPTIONAL.filter(f => !!(org[f.key] || '').trim()).length;
  const required = GDPR_REQUIRED.length;
  const optional = GDPR_OPTIONAL.length;
  // weight: 80% required, 20% optional
  const pct = Math.round(((filledRequired / required) * 0.8 + (filledOptional / optional) * 0.2) * 100);

  let tone = 'red';
  if (filledRequired === required) tone = filledOptional === optional ? 'emerald' : 'green';
  else if (filledRequired >= 2) tone = 'amber';

  const colors = {
    red:     { bar: 'bg-red-500',     box: 'border-red-200 bg-red-50',         text: 'text-red-700',     pill: 'bg-red-100 text-red-700' },
    amber:   { bar: 'bg-amber-500',   box: 'border-amber-200 bg-amber-50',     text: 'text-amber-800',   pill: 'bg-amber-100 text-amber-800' },
    green:   { bar: 'bg-green-500',   box: 'border-green-200 bg-green-50',     text: 'text-green-800',   pill: 'bg-green-100 text-green-800' },
    emerald: { bar: 'bg-emerald-600', box: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-800', pill: 'bg-emerald-100 text-emerald-800' },
  }[tone];

  const remaining = required - filledRequired;
  const headline = filledRequired === required
    ? (filledOptional === optional ? 'Profilo GDPR completo' : 'Profilo GDPR conforme')
    : `${remaining} ${remaining === 1 ? 'campo' : 'campi'} ancora da compilare`;

  const cta = filledRequired === required
    ? 'Tutto in regola — i visitatori delle landing vedranno il tuo nominativo come titolare del trattamento.'
    : "Completa il profilo per essere conforme all'art. 13 GDPR. Senza questi dati i visitatori non sanno chi è il titolare del trattamento e tu rischi una contestazione.";

  return (
    <div className={`border rounded-xl p-4 ${colors.box}`} data-testid="gdpr-completeness-card">
      <div className="flex items-start gap-3 flex-wrap">
        <ShieldCheck className={`h-6 w-6 ${colors.text} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h3 className={`font-semibold ${colors.text}`}>GDPR completeness · {pct}%</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${colors.pill}`}
                  data-testid="gdpr-completeness-status">{headline}</span>
          </div>
          <div className="h-2 bg-white/80 border border-gray-200 dark:border-white/10 rounded overflow-hidden mb-2">
            <div className={`h-full ${colors.bar} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`text-sm ${colors.text}`}>{cta}</p>
          <ul className="text-xs mt-2 space-y-0.5">
            {GDPR_REQUIRED.map(f => {
              const filled = !!(org[f.key] || '').trim();
              return (
                <li key={f.key} className={filled ? 'text-gray-500 dark:text-[#6a6a72]' : `${colors.text} font-semibold`}>
                  {filled ? '✓' : '○'} {f.label}
                </li>
              );
            })}
            {GDPR_OPTIONAL.map(f => {
              const filled = !!(org[f.key] || '').trim();
              return (
                <li key={f.key} className={filled ? 'text-gray-500 dark:text-[#6a6a72]' : 'text-gray-400 dark:text-[#5a5a62]'}>
                  {filled ? '✓' : '○'} {f.label} <span className="text-[10px] uppercase tracking-wide opacity-70">opzionale</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

const CopyableValue = ({ value, testId }) => {
  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copiato negli appunti');
    } catch { toast.error('Impossibile copiare'); }
  };
  return (
    <button type="button" onClick={copy} data-testid={testId}
            className="group inline-flex items-center gap-1.5 font-mono text-[11px] sm:text-xs font-semibold text-gray-900 dark:text-white hover:text-[#D2FA46] break-all text-left">
      <span className="break-all">{value}</span>
      <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100 flex-shrink-0" />
    </button>
  );
};

const DomainCard = ({ d, onRefresh, onVerify, onRemove, busy }) => {
  const ownership = !!d.verified; // Vercel ownership check (TXT record / project assignment)
  const live = d.dns || {};
  const isSubdomain = d.is_subdomain !== undefined ? d.is_subdomain : (d.domain !== (d.apex || d.domain));
  const host = isSubdomain ? d.domain.split('.')[0] : '@';

  // Effective DNS state from Vercel's /v6/domains/{d}/config
  const dnsMisconfigured = live.misconfigured !== false; // default true if unknown
  const fullyOnline = ownership && !dnsMisconfigured;

  // Recommended records (live → fallback to static guidance)
  const recCname = live.recommended_cname || d.dns_instructions?.value || 'cname.vercel-dns.com';
  const recA = (live.recommended_a_values && live.recommended_a_values.length > 0)
    ? live.recommended_a_values
    : [d.dns_instructions?.value || '76.76.21.21'];
  const recordType = isSubdomain ? 'CNAME' : 'A';
  const recordValues = isSubdomain ? [recCname] : recA;

  // Current state from DNS lookup
  const currentCnames = live.current_cnames || [];
  const currentAValues = live.current_a_values || [];
  const conflicts = live.conflicts || [];
  const hasCurrent = currentCnames.length > 0 || currentAValues.length > 0;

  return (
    <div className="border rounded-lg p-3 sm:p-4 bg-white dark:bg-[#131316]" data-testid={`domain-card-${d.domain}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <a href={`https://${d.domain}`} target="_blank" rel="noreferrer"
                className="font-mono text-sm font-semibold text-gray-900 dark:text-white hover:underline truncate">
              {d.domain}
            </a>
            {fullyOnline ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white"
                     data-testid={`domain-status-${d.domain}`}>
                <CheckCircle2 className="h-3 w-3 mr-1" />Online
              </Badge>
            ) : ownership && dnsMisconfigured ? (
              <Badge variant="outline" className="border-amber-500 text-amber-800 bg-amber-50"
                     data-testid={`domain-status-${d.domain}`}>
                <AlertCircle className="h-3 w-3 mr-1" />DNS da configurare
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-400 text-amber-700"
                     data-testid={`domain-status-${d.domain}`}>
                <Clock3 className="h-3 w-3 mr-1" />In attesa DNS
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onRefresh(d.domain)}
                  disabled={busy} data-testid={`domain-refresh-${d.domain}`}>
            <RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onRemove(d.domain)}
                  disabled={busy} data-testid={`domain-remove-${d.domain}`}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      {!fullyOnline && (
        <div className="mt-3 space-y-2 bg-amber-50 border border-amber-200 rounded-lg p-3"
             data-testid={`domain-dns-instructions-${d.domain}`}>
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-2 min-w-0 w-full">
              <p className="font-semibold text-sm">
                {ownership
                  ? 'DNS non ancora attivo — completa la configurazione su Aruba'
                  : 'Aggiungi questo record DNS sul pannello Aruba'}
              </p>
              <p className="text-[11px] text-amber-800/90">
                {isSubdomain
                  ? <>Vai su <strong>Aruba → Pannello Gestione Dominio → DNS / Record DNS</strong> e aggiungi un record <strong>CNAME</strong>:</>
                  : <>Vai su <strong>Aruba → Pannello Gestione Dominio → DNS / Record DNS</strong> e aggiungi {recordValues.length > 1 ? 'questi record' : 'questo record'} <strong>A</strong>:</>}
              </p>

              <div className="bg-white dark:bg-[#131316] border rounded p-2.5 text-[11px] sm:text-xs space-y-1.5">
                <div className="grid grid-cols-[70px_1fr] sm:grid-cols-[90px_1fr] gap-x-3 gap-y-1.5 items-center">
                  <span className="text-gray-500 dark:text-[#6a6a72]">Tipo</span>
                  <span className="font-mono font-semibold">{recordType}</span>

                  <span className="text-gray-500 dark:text-[#6a6a72]">Host / Nome</span>
                  <CopyableValue value={host} testId={`domain-copy-host-${d.domain}`} />

                  <span className="text-gray-500 dark:text-[#6a6a72]">{recordValues.length > 1 ? 'Valori' : 'Valore'}</span>
                  <div className="flex flex-col gap-1">
                    {recordValues.map((v, i) => (
                      <CopyableValue key={v + i} value={v}
                                     testId={`domain-copy-value-${d.domain}-${i}`} />
                    ))}
                  </div>

                  <span className="text-gray-500 dark:text-[#6a6a72]">TTL</span>
                  <span className="font-mono">3600 (o "Auto")</span>
                </div>
              </div>

              {hasCurrent && (
                <details className="text-[11px] bg-white/60 border border-amber-200 rounded p-2">
                  <summary className="cursor-pointer font-semibold text-amber-900">
                    Cosa risulta attualmente nei DNS pubblici di {d.domain}
                  </summary>
                  <div className="mt-2 space-y-1 font-mono text-[10px] sm:text-[11px]">
                    {currentCnames.length > 0 && (
                      <div><span className="text-gray-500 dark:text-[#6a6a72]">CNAME attuali:</span>{' '}
                        <span className="break-all">{currentCnames.join(', ')}</span></div>
                    )}
                    {currentAValues.length > 0 && (
                      <div><span className="text-gray-500 dark:text-[#6a6a72]">A attuali:</span>{' '}
                        <span className="break-all">{currentAValues.join(', ')}</span></div>
                    )}
                  </div>
                </details>
              )}

              {conflicts.length > 0 && (
                <div className="text-[11px] bg-red-50 border border-red-200 text-red-800 rounded p-2"
                     data-testid={`domain-conflicts-${d.domain}`}>
                  <p className="font-semibold mb-1">⚠ Conflitti rilevati</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {conflicts.map((c, i) => (
                      <li key={i} className="break-all">
                        {typeof c === 'object' ? `${c.type || ''} ${c.name || ''} → ${c.value || ''}` : String(c)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1">Rimuovi questi record da Aruba per evitare interferenze.</p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap pt-1">
                <Button size="sm" onClick={() => onRefresh(d.domain)} disabled={busy}
                        className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                        data-testid={`domain-recheck-${d.domain}`}>
                  {busy === 'refresh' ? 'Controllo...' : 'Ricontrolla DNS'}
                </Button>
                {!ownership && (
                  <Button size="sm" variant="outline" onClick={() => onVerify(d.domain)} disabled={busy}
                          className="h-7 text-xs border-amber-500 text-amber-800"
                          data-testid={`domain-verify-${d.domain}`}>
                    {busy === 'verify' ? 'Verifico...' : 'Verifica proprietà'}
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-amber-800/80 italic pt-1">
                Dopo aver salvato il record su Aruba, attendi 2-10 minuti per la propagazione DNS e clicca "Ricontrolla DNS".
                Il certificato SSL viene emesso automaticamente da Vercel appena i record sono corretti.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const OrgSettings = () => {
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [domains, setDomains] = useState([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyDomain, setBusyDomain] = useState({}); // {[domain]: 'refresh'|'verify'|'remove'}

  useEffect(() => {
    axios.get(`${API}/my-organization`, { withCredentials: true })
      .then(({ data }) => setOrg(data))
      .catch(() => toast.error('Errore caricamento'))
      .finally(() => setLoading(false));
  }, []);

  const loadDomains = useCallback(async (orgId) => {
    setDomainsLoading(true);
    try {
      const { data } = await axios.get(`${API}/organizations/${orgId}/domains`,
        { withCredentials: true });
      setDomains(data);
    } catch {
      // silent
    } finally { setDomainsLoading(false); }
  }, []);

  useEffect(() => { if (org?.id && !org.is_super_admin) loadDomains(org.id); }, [org, loadDomains]);

  const updateField = (k, v) => setOrg(prev => ({ ...prev, [k]: v }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'uploads');
    try {
      const { data } = await axios.post(`${API}/upload`, fd, { withCredentials: true });
      setOrg(prev => ({ ...prev, logo_url: data.url, logo_public_id: data.public_id }));
      toast.success('Logo caricato. Ricorda di salvare.');
    } catch {
      toast.error('Errore upload');
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = () => setOrg(prev => ({ ...prev, logo_url: '', logo_public_id: '' }));

  const handleLegalLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'uploads');
    try {
      const { data } = await axios.post(`${API}/upload`, fd, { withCredentials: true });
      setOrg(prev => ({ ...prev, legal_logo_url: data.url, legal_logo_public_id: data.public_id }));
      toast.success('Logo legale caricato. Ricorda di salvare.');
    } catch {
      toast.error('Errore upload');
    } finally {
      setUploading(false);
    }
  };

  const removeLegalLogo = () => setOrg(prev => ({ ...prev, legal_logo_url: '', legal_logo_public_id: '' }));

  const handlePwaIconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'uploads');
    try {
      const { data } = await axios.post(`${API}/upload`, fd, { withCredentials: true });
      setOrg(prev => ({ ...prev, pwa_icon_url: data.url, pwa_icon_public_id: data.public_id }));
      toast.success('Icona app caricata. Ricorda di salvare.');
    } catch {
      toast.error('Errore upload');
    } finally {
      setUploading(false);
    }
  };

  const removePwaIcon = () => setOrg(prev => ({ ...prev, pwa_icon_url: '', pwa_icon_public_id: '' }));

  const addDomain = async () => {
    const d = (newDomain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!d) return;
    if (domains.some(x => x.domain === d)) {
      toast.error('Dominio già presente'); return;
    }
    setAdding(true);
    try {
      const { data } = await axios.post(`${API}/organizations/${org.id}/domains`,
        { domain: d }, { withCredentials: true });
      setDomains(prev => [...prev.filter(x => x.domain !== data.domain), data].sort((a, b) => a.domain.localeCompare(b.domain)));
      setNewDomain('');
      toast.success(`${d} aggiunto a Vercel. Configura il DNS su Aruba.`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore aggiunta dominio');
    } finally { setAdding(false); }
  };

  const refreshDomain = async (domain) => {
    setBusyDomain(b => ({ ...b, [domain]: 'refresh' }));
    try {
      const { data } = await axios.get(`${API}/organizations/${org.id}/domains/${domain}/status`,
        { withCredentials: true });
      setDomains(prev => prev.map(x => x.domain === domain ? { ...x, ...data } : x));
      const dnsOk = data?.dns && data.dns.misconfigured === false;
      if (data.verified && dnsOk) toast.success(`${domain} è online`);
      else if (data.verified && !dnsOk) toast.message('Proprietà verificata, ma DNS non ancora attivo');
      else toast.message('In attesa di propagazione DNS');
    } catch (e) {
      if (e.response?.status === 404) {
        setDomains(prev => prev.filter(x => x.domain !== domain));
        toast.message('Dominio non più presente su Vercel — rimosso');
      } else {
        toast.error(e.response?.data?.detail || 'Errore verifica');
      }
    } finally { setBusyDomain(b => ({ ...b, [domain]: null })); }
  };

  const verifyDomain = async (domain) => {
    setBusyDomain(b => ({ ...b, [domain]: 'verify' }));
    try {
      const { data } = await axios.post(`${API}/organizations/${org.id}/domains/${domain}/verify`,
        {}, { withCredentials: true });
      setDomains(prev => prev.map(x => x.domain === domain ? { ...x, ...data } : x));
      if (data.verified) toast.success(`${domain} è online! Certificato SSL in emissione.`);
      else toast.message('DNS non ancora propagato. Riprova tra 1-2 minuti.');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore verifica');
    } finally { setBusyDomain(b => ({ ...b, [domain]: null })); }
  };

  const removeDomain = async (domain) => {
    if (!window.confirm(`Rimuovere ${domain}?`)) return;
    setBusyDomain(b => ({ ...b, [domain]: 'remove' }));
    try {
      await axios.delete(`${API}/organizations/${org.id}/domains/${domain}`,
        { withCredentials: true });
      setDomains(prev => prev.filter(x => x.domain !== domain));
      toast.success('Dominio rimosso');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore rimozione');
    } finally { setBusyDomain(b => ({ ...b, [domain]: null })); }
  };

  const handleSave = async () => {
    if (!org?.id) return;
    setSaving(true);
    try {
      await axios.put(`${API}/organizations/${org.id}`, {
        name: org.name,
        brand_name: org.brand_name,
        primary_color: org.primary_color,
        logo_url: org.logo_url,
        logo_public_id: org.logo_public_id,
        landing_headline: org.landing_headline || '',
        cookie_banner_enabled: !!org.cookie_banner_enabled,
        cookie_banner_text: org.cookie_banner_text || '',
        cookie_banner_link: org.cookie_banner_link || '',
        legal_name: org.legal_name || '',
        vat_number: org.vat_number || '',
        legal_address: org.legal_address || '',
        privacy_contact_email: org.privacy_contact_email || '',
        privacy_policy_url: org.privacy_policy_url || '',
        legal_logo_url: org.legal_logo_url || '',
        legal_logo_public_id: org.legal_logo_public_id || '',
        pwa_icon_url: org.pwa_icon_url || '',
        pwa_icon_public_id: org.pwa_icon_public_id || '',
        data_profiling_text: org.data_profiling_text || '',
        terms_text: org.terms_text || '',
      }, { withCredentials: true });
      toast.success('Impostazioni salvate');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-12">Caricamento...</div>;
  if (!org) return <div className="text-center py-12 text-gray-500 dark:text-[#6a6a72]">Nessuna organizzazione</div>;
  if (org.is_super_admin) return (
    <div className="text-center py-12 text-gray-500 dark:text-[#6a6a72]">
      Sei super admin. Vai a "Organizzazioni" per gestire i tenant.
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl" data-testid="org-settings-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold">Impostazioni Organizzazione</h2>
          <p className="text-sm text-gray-600 dark:text-[#8a8a92] mt-1">Personalizza il brand e i domini di "{org.name}"</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]" data-testid="org-save-button">
          <Save className="h-4 w-4 mr-2" />{saving ? 'Salvataggio...' : 'Salva'}
        </Button>
      </div>

      <GdprCompleteness org={org} />

      <div className="bg-white dark:bg-[#131316] border rounded-lg p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><ImgIcon className="h-4 w-4 text-[#D2FA46]" />Brand</h3>
        <div>
          <Label>Nome Organizzazione</Label>
          <Input value={org.name || ''} onChange={(e) => updateField('name', e.target.value)} />
        </div>
        <div>
          <Label>Nome Brand visualizzato</Label>
          <Input value={org.brand_name || ''} onChange={(e) => updateField('brand_name', e.target.value)} placeholder="Es. Brand della tua azienda" />
        </div>
        <div>
          <Label>Intestazione landing pubblica</Label>
          <Input
            value={org.landing_headline || ''}
            onChange={(e) => updateField('landing_headline', e.target.value)}
            placeholder="Es. Il tuo consulente di fiducia"
            data-testid="org-landing-headline-input"
            maxLength={140}
          />
          <p className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-1">
            Compare in piccolo sopra il titolo della landing del venditore (es. <span className="font-mono">/v/&hellip;</span>).
            Lascia vuoto per usare il default "Il tuo consulente di fiducia".
          </p>
        </div>
        <div>
          <Label>Colore primario</Label>
          <div className="flex gap-2 items-center">
            <Input type="color" value={org.primary_color || '#D2FA46'} onChange={(e) => updateField('primary_color', e.target.value)} className="w-16 h-10 cursor-pointer" />
            <Input value={org.primary_color || ''} onChange={(e) => updateField('primary_color', e.target.value)} placeholder="#D2FA46" className="font-mono" />
          </div>
        </div>
        <div>
          <Label>Logo</Label>
          {org.logo_url ? (
            <div className="flex items-center gap-3 mt-1">
              <img src={org.logo_url} alt="logo" className="h-20 w-20 object-contain border rounded bg-gray-50 dark:bg-[#0a0a0b] p-2" />
              <Button variant="outline" size="sm" onClick={removeLogo}><X className="h-4 w-4 mr-1" />Rimuovi</Button>
            </div>
          ) : (
            <div>
              <Button type="button" variant="outline" onClick={() => document.getElementById('logo-upload').click()} disabled={uploading}>
                <Upload className="h-4 w-4 mr-2" />{uploading ? 'Caricamento...' : 'Carica Logo'}
              </Button>
              <input id="logo-upload" type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-[#131316] border rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-[#D2FA46]" />Domini personalizzati
          </h3>
          {domainsLoading && <RefreshCw className="h-4 w-4 text-gray-400 dark:text-[#5a5a62] animate-spin" />}
        </div>
        <p className="text-xs text-gray-500 dark:text-[#6a6a72]">
          Aggiungi il sottodominio (es. <span className="font-mono">qr.tuodominio.it</span>) che vuoi usare per le landing page.
          <strong> Verrà collegato in automatico</strong> al sito — non devi entrare su nessuna piattaforma esterna.
          Ti diremo solo quale record DNS aggiungere sul tuo pannello Aruba.
        </p>

        <div className="flex gap-2">
          <Input value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="qr.tuodominio.it"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDomain())}
                  data-testid="domain-input" />
          <Button onClick={addDomain} disabled={adding}
                  className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]" data-testid="domain-add-button">
            {adding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        <div className="space-y-2">
          {domains.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-[#5a5a62] text-center py-4">Nessun dominio configurato</p>
          ) : (
            domains.map(d => (
              <DomainCard
                key={d.domain}
                d={d}
                onRefresh={refreshDomain}
                onVerify={verifyDomain}
                onRemove={removeDomain}
                busy={busyDomain[d.domain]}
              />
            ))
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-[#131316] border rounded-lg p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Cookie className="h-4 w-4 text-[#D2FA46]" />Banner cookie sulla landing pubblica
        </h3>
        <p className="text-xs text-gray-500 dark:text-[#6a6a72]">
          Abilita un banner mostrato sui link pubblici dei tuoi venditori (es. <span className="font-mono">qr.tuodominio.it/v/...</span>).
          <strong> Il testo lo decidi tu</strong>: QRHub fornisce solo lo strumento, la responsabilità del contenuto della landing
          e dell'informativa è del titolare del dominio.
        </p>

        <div className="flex items-center justify-between border rounded-lg p-3">
          <div>
            <p className="text-sm font-medium">Personalizza testo banner</p>
            <p className="text-xs text-gray-500 dark:text-[#6a6a72]">
              Il banner è sempre attivo per legge (informativa art. 13 GDPR).
              Con questo switch decidi se mostrare un testo tuo o quello di default.
            </p>
          </div>
          <Switch
            checked={!!org.cookie_banner_enabled}
            onCheckedChange={(v) => updateField('cookie_banner_enabled', v)}
            data-testid="cookie-banner-switch"
          />
        </div>

        <div>
          <Label>Testo del banner</Label>
          <Textarea
            rows={4}
            value={org.cookie_banner_text || ''}
            onChange={(e) => updateField('cookie_banner_text', e.target.value)}
            placeholder="Es. Questa pagina raccoglie dati aggregati per migliorare il servizio. Continuando accetti la nostra privacy policy."
            data-testid="cookie-banner-text-input"
            maxLength={1000}
          />
          <p className="text-[11px] text-gray-400 dark:text-[#5a5a62] mt-1">
            {(org.cookie_banner_text || '').length}/1000 · Se vuoto verrà mostrato un testo default
          </p>
        </div>

        <div>
          <Label>Link alla tua privacy policy (opzionale)</Label>
          <Input
            value={org.cookie_banner_link || ''}
            onChange={(e) => updateField('cookie_banner_link', e.target.value)}
            placeholder="https://tuodominio.it/privacy"
            className="font-mono"
            data-testid="cookie-banner-link-input"
          />
          <p className="text-[11px] text-gray-400 dark:text-[#5a5a62] mt-1">
            Se inserito, comparirà un link "Privacy policy" accanto al pulsante "Ho capito".
          </p>
        </div>

        <div className="text-xs text-amber-800 bg-amber-50 border-l-2 border-amber-400 p-3 rounded-r">
          <strong>Importante</strong> — La piattaforma QRHub non memorizza indirizzi IP né cookie di profilazione.
          Salva solo dati aggregati (visite, click per canale, città/paese approssimativi, device family) ai fini
          statistici. Per maggiori dettagli vedi la <a href="/dashboard/legal" className="underline font-semibold">pagina "Note Legali"</a>.
        </div>
      </div>

      {/* Profilazione dati raccolti dai canali terzi (Meta, Google, TikTok) */}
      <div className="bg-white dark:bg-[#131316] border rounded-lg p-5 space-y-4" data-testid="org-data-profiling-section">
        <h3 className="font-semibold flex items-center gap-2">
          <span className="inline-block w-5 h-5 rounded bg-sky-100 text-sky-700 text-[11px] font-bold flex items-center justify-center">i</span>
          Profilazione dati raccolti dai canali terzi
        </h3>
        <p className="text-xs text-gray-500 dark:text-[#6a6a72]">
          Quando un visitatore tocca i pulsanti WhatsApp, Instagram, Facebook, TikTok, Google Maps o Recensioni Google,
          esce dalla landing ed entra in un servizio terzo che può profilarlo. Sei tu (in qualità di organizzazione titolare
          del dominio) che devi dichiararlo nella tua informativa. QRHub fornisce un testo predefinito che puoi adattare.
        </p>
        <div>
          <Label>Testo informativa profilazione</Label>
          <Textarea
            rows={8}
            value={org.data_profiling_text || ''}
            onChange={(e) => updateField('data_profiling_text', e.target.value)}
            placeholder={DEFAULT_PROFILING_TEXT}
            data-testid="org-data-profiling-input"
            maxLength={4000}
          />
          <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
            <p className="text-[11px] text-gray-400 dark:text-[#5a5a62]">
              {(org.data_profiling_text || '').length}/4000 · Compare nella pagina <code className="bg-gray-100 dark:bg-[#1a1a1c] px-1 rounded">/v/[id]/privacy</code>
            </p>
            <button
              type="button"
              onClick={() => updateField('data_profiling_text', DEFAULT_PROFILING_TEXT)}
              className="text-[11px] text-[#D2FA46] hover:text-[#bce63d] font-medium"
              data-testid="reset-profiling-default"
            >
              Usa testo predefinito
            </button>
          </div>
        </div>

        <div>
          <Label>Termini e Condizioni d'uso della landing (opzionale)</Label>
          <Textarea
            rows={6}
            value={org.terms_text || ''}
            onChange={(e) => updateField('terms_text', e.target.value)}
            placeholder={DEFAULT_TERMS_TEXT}
            data-testid="org-terms-input"
            maxLength={8000}
          />
          <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
            <p className="text-[11px] text-gray-400 dark:text-[#5a5a62]">
              {(org.terms_text || '').length}/8000 · Compare insieme all'informativa
            </p>
            <button
              type="button"
              onClick={() => updateField('terms_text', DEFAULT_TERMS_TEXT)}
              className="text-[11px] text-[#D2FA46] hover:text-[#bce63d] font-medium"
              data-testid="reset-terms-default"
            >
              Usa testo predefinito
            </button>
          </div>
        </div>
      </div>

      {/* GDPR — Titolare del trattamento (art. 13 GDPR) */}
      <div className="bg-white dark:bg-[#131316] border rounded-lg p-5 space-y-4" data-testid="org-gdpr-controller-section">
        <h3 className="font-semibold flex items-center gap-2">
          <span className="inline-block w-5 h-5 rounded bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center">!</span>
          Dati del titolare del trattamento (GDPR)
        </h3>
        <p className="text-xs text-gray-500 dark:text-[#6a6a72]">
          Questi dati appaiono nella pagina pubblica <code className="bg-gray-100 dark:bg-[#1a1a1c] px-1 rounded">/v/[id]/privacy</code> di ogni
          tuo venditore, accessibile dal link <em>"Informativa privacy"</em> in fondo a ogni landing.
          Sono <strong>obbligatori</strong> per identificarti come titolare ai sensi dell'art. 13 GDPR.
        </p>

        <div>
          <Label>Denominazione legale</Label>
          <Input
            value={org.legal_name || ''}
            onChange={(e) => updateField('legal_name', e.target.value)}
            placeholder="Es. Mario Rossi S.r.l."
            data-testid="org-legal-name-input"
            maxLength={200}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>P.IVA / Codice Fiscale</Label>
            <Input
              value={org.vat_number || ''}
              onChange={(e) => updateField('vat_number', e.target.value)}
              placeholder="IT01234567890"
              data-testid="org-vat-input"
              maxLength={50}
            />
          </div>
          <div>
            <Label>Email contatto privacy</Label>
            <Input
              type="email"
              value={org.privacy_contact_email || ''}
              onChange={(e) => updateField('privacy_contact_email', e.target.value)}
              placeholder="privacy@tuodominio.it"
              data-testid="org-privacy-email-input"
              maxLength={200}
            />
          </div>
        </div>

        <div>
          <Label>Sede legale</Label>
          <Input
            value={org.legal_address || ''}
            onChange={(e) => updateField('legal_address', e.target.value)}
            placeholder="Es. Via Roma 1, 20100 Milano (MI)"
            data-testid="org-legal-address-input"
            maxLength={500}
          />
        </div>

        <div className="border border-gray-200 dark:border-white/10 rounded-lg p-4 bg-gray-50/60 dark:bg-[#0f0f12]">
          <Label className="font-semibold text-gray-800 dark:text-[#e6e6ea] flex items-center gap-2">
            <ImgIcon className="h-4 w-4 text-[#D2FA46]" />
            Logo titolare (per pagina privacy)
          </Label>
          <p className="text-xs text-gray-600 dark:text-[#8a8a92] mt-1 mb-3">
            Logo dell'azienda <strong>vera e propria</strong> (titolare del trattamento) che compare
            nella pagina <code className="bg-gray-100 dark:bg-[#1a1a1c] px-1 rounded">/v/[id]/privacy</code> al
            posto del logo del franchising. Es. carica qui il logo di <em>"VDN SRL"</em>, non quello di WindTre o TIM.
            Se vuoto, viene usato il logo del brand qui sopra.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {org.legal_logo_url ? (
              <>
                <img
                  src={org.legal_logo_url}
                  alt="logo legale"
                  className="h-20 w-20 object-contain border rounded bg-white dark:bg-[#0a0a0b] p-2"
                  data-testid="org-legal-logo-preview"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={removeLegalLogo}
                  data-testid="org-legal-logo-remove"
                >
                  <X className="h-4 w-4 mr-1" />Rimuovi
                </Button>
              </>
            ) : (
              <label
                htmlFor="legal-logo-upload"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border-2 border-dashed border-[#D2FA46] bg-white dark:bg-[#0a0a0b] hover:bg-[#D2FA46]/10 cursor-pointer text-[#D2FA46] text-sm font-medium"
                data-testid="org-legal-logo-upload-label"
              >
                <Upload className={`h-4 w-4 ${uploading ? 'animate-pulse' : ''}`} />
                {uploading ? 'Caricamento…' : 'Carica logo titolare'}
                <input
                  id="legal-logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleLegalLogoUpload}
                  className="hidden"
                  disabled={uploading}
                  data-testid="org-legal-logo-input"
                />
              </label>
            )}
          </div>
        </div>

        <div className="border border-gray-200 dark:border-white/10 rounded-lg p-4 bg-gray-50/60 dark:bg-[#0f0f12]">
          <Label className="font-semibold text-gray-800 dark:text-[#e6e6ea] flex items-center gap-2">
            <ImgIcon className="h-4 w-4 text-[#D2FA46]" />
            Icona app (salva sul telefono)
          </Label>
          <p className="text-xs text-gray-600 dark:text-[#8a8a92] mt-1 mb-3">
            Icona che apparirà sulla home dei telefoni dei clienti quando salvano la
            landing del venditore come app (PWA). Consigliato: <strong>PNG quadrato 512×512 px</strong>{' '}
            su sfondo opaco. Se vuoto viene usato il logo brand qui sopra.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {org.pwa_icon_url ? (
              <>
                <img
                  src={org.pwa_icon_url}
                  alt="icona PWA"
                  className="h-20 w-20 object-contain border rounded-2xl bg-white dark:bg-[#0a0a0b] p-2"
                  data-testid="org-pwa-icon-preview"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={removePwaIcon}
                  data-testid="org-pwa-icon-remove"
                >
                  <X className="h-4 w-4 mr-1" />Rimuovi
                </Button>
              </>
            ) : (
              <label
                htmlFor="pwa-icon-upload"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border-2 border-dashed border-[#D2FA46] bg-white dark:bg-[#0a0a0b] hover:bg-[#D2FA46]/10 cursor-pointer text-[#D2FA46] text-sm font-medium"
                data-testid="org-pwa-icon-upload-label"
              >
                <Upload className={`h-4 w-4 ${uploading ? 'animate-pulse' : ''}`} />
                {uploading ? 'Caricamento…' : 'Carica icona app'}
                <input
                  id="pwa-icon-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePwaIconUpload}
                  className="hidden"
                  disabled={uploading}
                  data-testid="org-pwa-icon-input"
                />
              </label>
            )}
          </div>
        </div>

        <div>
          <Label>Privacy policy estesa (URL opzionale)</Label>
          <Input
            value={org.privacy_policy_url || ''}
            onChange={(e) => updateField('privacy_policy_url', e.target.value)}
            placeholder="https://tuodominio.it/privacy"
            className="font-mono"
            data-testid="org-privacy-policy-url-input"
            maxLength={500}
          />
          <p className="text-[11px] text-gray-400 dark:text-[#5a5a62] mt-1">
            Se compilato, la pagina informativa rimanderà ANCHE alla tua policy completa.
          </p>
        </div>
      </div>
    </div>
  );
};

export default OrgSettings;
