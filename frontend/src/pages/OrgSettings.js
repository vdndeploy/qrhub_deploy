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

  const headline = filledRequired === required
    ? (filledOptional === optional ? 'Profilo GDPR completo' : 'Profilo GDPR conforme')
    : `${required - filledRequired} campo${required - filledRequired === 1 ? '' : 'i'} ancora da compilare`;

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
          <div className="h-2 bg-white/80 border border-gray-200 rounded overflow-hidden mb-2">
            <div className={`h-full ${colors.bar} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`text-sm ${colors.text}`}>{cta}</p>
          <ul className="text-xs mt-2 space-y-0.5">
            {GDPR_REQUIRED.map(f => {
              const filled = !!(org[f.key] || '').trim();
              return (
                <li key={f.key} className={filled ? 'text-gray-500' : `${colors.text} font-semibold`}>
                  {filled ? '✓' : '○'} {f.label}
                </li>
              );
            })}
            {GDPR_OPTIONAL.map(f => {
              const filled = !!(org[f.key] || '').trim();
              return (
                <li key={f.key} className={filled ? 'text-gray-500' : 'text-gray-400'}>
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

const DomainCard = ({ d, onRefresh, onVerify, onRemove, busy }) => {
  const verified = !!d.verified;
  const dns = d.dns_instructions || {};

  const copyDns = async () => {
    const txt = `${dns.type}\t${dns.host}\t${dns.value}\t(TTL ${dns.ttl || 3600})`;
    try {
      await navigator.clipboard.writeText(txt);
      toast.success('Record DNS copiato');
    } catch { toast.error('Impossibile copiare'); }
  };

  return (
    <div className="border rounded-lg p-3 sm:p-4 bg-white" data-testid={`domain-card-${d.domain}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a href={`https://${d.domain}`} target="_blank" rel="noreferrer"
                className="font-mono text-sm font-semibold text-gray-900 hover:underline truncate">
              {d.domain}
            </a>
            {verified ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
                <CheckCircle2 className="h-3 w-3 mr-1" />Verificato
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-400 text-amber-700">
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

      {!verified && (
        <div className="mt-3 space-y-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1.5 min-w-0 w-full">
              <p className="font-semibold">Aggiungi questo record DNS sul pannello Aruba:</p>
              <div className="bg-white border rounded p-2 font-mono text-[11px] sm:text-xs overflow-x-auto">
                <div className="grid grid-cols-[60px_1fr] sm:grid-cols-[80px_1fr] gap-x-3 gap-y-0.5">
                  <span className="text-gray-500">Tipo:</span><span className="font-semibold">{dns.type || 'CNAME'}</span>
                  <span className="text-gray-500">Host:</span><span className="font-semibold">{dns.host || '@'}</span>
                  <span className="text-gray-500">Valore:</span><span className="font-semibold break-all">{dns.value}</span>
                  <span className="text-gray-500">TTL:</span><span>{dns.ttl || 3600}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap pt-1">
                <Button variant="outline" size="sm" onClick={copyDns} className="h-7 text-xs"
                        data-testid={`domain-copy-dns-${d.domain}`}>
                  <Copy className="h-3 w-3 mr-1" />Copia record
                </Button>
                <Button size="sm" onClick={() => onVerify(d.domain)} disabled={busy}
                        className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                        data-testid={`domain-verify-${d.domain}`}>
                  {busy === 'verify' ? 'Verifico...' : 'Verifica ora'}
                </Button>
              </div>
              <p className="text-[10px] text-amber-800/80 italic pt-1">
                Dopo aver salvato il record su Aruba, attendi 2-5 minuti e clicca "Verifica ora".
                Il certificato SSL viene emesso automaticamente.
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
      toast.success(data.verified ? 'Dominio verificato' : 'In attesa di propagazione DNS');
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
        cookie_banner_enabled: !!org.cookie_banner_enabled,
        cookie_banner_text: org.cookie_banner_text || '',
        cookie_banner_link: org.cookie_banner_link || '',
        legal_name: org.legal_name || '',
        vat_number: org.vat_number || '',
        legal_address: org.legal_address || '',
        privacy_contact_email: org.privacy_contact_email || '',
        privacy_policy_url: org.privacy_policy_url || '',
      }, { withCredentials: true });
      toast.success('Impostazioni salvate');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-12">Caricamento...</div>;
  if (!org) return <div className="text-center py-12 text-gray-500">Nessuna organizzazione</div>;
  if (org.is_super_admin) return (
    <div className="text-center py-12 text-gray-500">
      Sei super admin. Vai a "Organizzazioni" per gestire i tenant.
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl" data-testid="org-settings-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold">Impostazioni Organizzazione</h2>
          <p className="text-sm text-gray-600 mt-1">Personalizza il brand e i domini di "{org.name}"</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#F96815] hover:bg-[#e05a0f]" data-testid="org-save-button">
          <Save className="h-4 w-4 mr-2" />{saving ? 'Salvataggio...' : 'Salva'}
        </Button>
      </div>

      <GdprCompleteness org={org} />

      <div className="bg-white border rounded-lg p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><ImgIcon className="h-4 w-4 text-[#F96815]" />Brand</h3>
        <div>
          <Label>Nome Organizzazione</Label>
          <Input value={org.name || ''} onChange={(e) => updateField('name', e.target.value)} />
        </div>
        <div>
          <Label>Nome Brand visualizzato</Label>
          <Input value={org.brand_name || ''} onChange={(e) => updateField('brand_name', e.target.value)} placeholder="Es. Brand della tua azienda" />
        </div>
        <div>
          <Label>Colore primario</Label>
          <div className="flex gap-2 items-center">
            <Input type="color" value={org.primary_color || '#F96815'} onChange={(e) => updateField('primary_color', e.target.value)} className="w-16 h-10 cursor-pointer" />
            <Input value={org.primary_color || ''} onChange={(e) => updateField('primary_color', e.target.value)} placeholder="#F96815" className="font-mono" />
          </div>
        </div>
        <div>
          <Label>Logo</Label>
          {org.logo_url ? (
            <div className="flex items-center gap-3 mt-1">
              <img src={org.logo_url} alt="logo" className="h-20 w-20 object-contain border rounded bg-gray-50 p-2" />
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

      <div className="bg-white border rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-[#F96815]" />Domini personalizzati
          </h3>
          {domainsLoading && <RefreshCw className="h-4 w-4 text-gray-400 animate-spin" />}
        </div>
        <p className="text-xs text-gray-500">
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
                  className="bg-[#F96815] hover:bg-[#e05a0f]" data-testid="domain-add-button">
            {adding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        <div className="space-y-2">
          {domains.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nessun dominio configurato</p>
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

      <div className="bg-white border rounded-lg p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Cookie className="h-4 w-4 text-[#F96815]" />Banner cookie sulla landing pubblica
        </h3>
        <p className="text-xs text-gray-500">
          Abilita un banner mostrato sui link pubblici dei tuoi venditori (es. <span className="font-mono">qr.tuodominio.it/v/...</span>).
          <strong> Il testo lo decidi tu</strong>: QRHub fornisce solo lo strumento, la responsabilità del contenuto della landing
          e dell'informativa è del titolare del dominio.
        </p>

        <div className="flex items-center justify-between border rounded-lg p-3">
          <div>
            <p className="text-sm font-medium">Personalizza testo banner</p>
            <p className="text-xs text-gray-500">
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
          <p className="text-[11px] text-gray-400 mt-1">
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
          <p className="text-[11px] text-gray-400 mt-1">
            Se inserito, comparirà un link "Privacy policy" accanto al pulsante "Ho capito".
          </p>
        </div>

        <div className="text-xs text-amber-800 bg-amber-50 border-l-2 border-amber-400 p-3 rounded-r">
          <strong>Importante</strong> — La piattaforma QRHub non memorizza indirizzi IP né cookie di profilazione.
          Salva solo dati aggregati (visite, click per canale, città/paese approssimativi, device family) ai fini
          statistici. Per maggiori dettagli vedi la <a href="/dashboard/legal" className="underline font-semibold">pagina "Note Legali"</a>.
        </div>
      </div>

      {/* GDPR — Titolare del trattamento (art. 13 GDPR) */}
      <div className="bg-white border rounded-lg p-5 space-y-4" data-testid="org-gdpr-controller-section">
        <h3 className="font-semibold flex items-center gap-2">
          <span className="inline-block w-5 h-5 rounded bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center">!</span>
          Dati del titolare del trattamento (GDPR)
        </h3>
        <p className="text-xs text-gray-500">
          Questi dati appaiono nella pagina pubblica <code className="bg-gray-100 px-1 rounded">/v/[id]/privacy</code> di ogni
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
          <p className="text-[11px] text-gray-400 mt-1">
            Se compilato, la pagina informativa rimanderà ANCHE alla tua policy completa.
          </p>
        </div>
      </div>
    </div>
  );
};

export default OrgSettings;
