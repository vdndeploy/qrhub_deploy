import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Save, Lock, Rocket, Globe2, Github, KeyRound,
  Cloud, Copy, Eye, EyeOff, ShieldCheck, ExternalLink,
  Zap, RefreshCw, Activity, RotateCw, AlertTriangle,
  HeartPulse, CheckCircle2, XCircle, Crown, Trash2,
  Database, Download, Gauge,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EMPTY = {
  flyio_api_key: '', flyio_app_name: '', flyio_region: 'fra', flyio_app_url: '',
  vercel_token: '', vercel_project_id: '', vercel_org_id: '', vercel_app_url: '',
  vercel_deploy_hook: '',
  github_repo: '', github_token: '',
  prod_mongo_url: '', prod_db_name: 'qrhub_db', prod_jwt_secret: '',
  prod_superadmin_email: '', prod_superadmin_password: '',
  prod_frontend_url: '', prod_cors_origins: '',
  cloudinary_url: '',
  cloudinary_cloud_name: '', cloudinary_api_key: '', cloudinary_api_secret: '',
  aruba_dns_zone: '', aruba_notes: '',
  atlas_public_key: '', atlas_private_key: '', atlas_group_id: '',
};

const Section = ({ icon: Icon, title, desc, children, accent = '#D2FA46' }) => (
  <div className="bg-white dark:bg-[#131316] border border-gray-200 dark:border-white/10 rounded-xl p-5 sm:p-6 shadow-sm">
    <div className="flex items-start gap-3 mb-5">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${accent}14`, color: accent }}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
        {desc && <p className="text-xs text-gray-500 dark:text-[#6a6a72] mt-0.5">{desc}</p>}
      </div>
    </div>
    <div className="space-y-4">{children}</div>
  </div>
);

const SecretInput = ({ id, label, value, onChange, placeholder, testid, hint }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10 font-mono text-sm"
          data-testid={testid}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#6a6a72] hover:text-gray-900 dark:text-white"
          tabIndex={-1}
          aria-label={show ? 'Nascondi' : 'Mostra'}
          data-testid={`${testid}-toggle`}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-1">{hint}</p>}
    </div>
  );
};

const TextField = ({ id, label, value, onChange, placeholder, testid, hint, mono = false }) => (
  <div>
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={mono ? 'font-mono text-sm' : ''}
      data-testid={testid}
    />
    {hint && <p className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-1">{hint}</p>}
  </div>
);

const CommandBlock = ({ label, command, testid }) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success('Copiato negli appunti');
    } catch { toast.error('Impossibile copiare'); }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs text-gray-600 dark:text-[#8a8a92]">{label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={copy} data-testid={testid}>
          <Copy className="h-3.5 w-3.5 mr-1" />Copia
        </Button>
      </div>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-[11px] sm:text-xs overflow-x-auto whitespace-pre-wrap break-all">
{command}
      </pre>
    </div>
  );
};

const Settings = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchConfig(); }, []);

  const fetchConfig = async () => {
    try {
      const { data } = await axios.get(`${API}/config`, { withCredentials: true });
      setConfig({ ...EMPTY, ...data });
    } catch (e) {
      if (e.response?.status === 403) {
        toast.error('Accesso riservato al super admin');
      } else {
        toast.error('Errore nel caricamento configurazione');
      }
    } finally { setLoading(false); }
  };

  const update = (k) => (v) => setConfig(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    // Detect whether the super admin password was actually rotated this save:
    // we compare against the value just fetched from the server. If different,
    // the backend will bump token_version and refresh our cookie — surface
    // an explicit toast so the user knows other tabs were signed out.
    const savedPwd = (config.prod_superadmin_password || '').trim();
    let pwdRotated = false;
    try {
      if (savedPwd) {
        const { data: current } = await axios.get(`${API}/config`, { withCredentials: true });
        pwdRotated = ((current?.prod_superadmin_password || '').trim() !== savedPwd);
      }
    } catch { /* best-effort detection — not a blocker */ }
    try {
      await axios.put(`${API}/config`, config, { withCredentials: true });
      if (pwdRotated) {
        toast.success('Password super admin aggiornata · le altre sessioni aperte sono state disconnesse', {
          duration: 6000,
        });
      } else {
        toast.success('Configurazione salvata');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore nel salvataggio');
    } finally { setSaving(false); }
  };

  const flySecretsCmd = useMemo(() => {
    const app = config.flyio_app_name || '<app-name>';
    const lines = [
      `fly secrets set --app ${app} \\`,
      `  MONGO_URL="${config.prod_mongo_url || '<mongodb-srv-url>'}" \\`,
      `  DB_NAME="${config.prod_db_name || 'qrhub_db'}" \\`,
      `  JWT_SECRET="${config.prod_jwt_secret || '<random-secret>'}" \\`,
      `  SUPERADMIN_EMAIL="${config.prod_superadmin_email || 'superadmin@qrhub.it'}" \\`,
      `  SUPERADMIN_PASSWORD="${config.prod_superadmin_password || '<pwd>'}" \\`,
      `  FRONTEND_URL="${config.prod_frontend_url || config.vercel_app_url || '<vercel-url>'}" \\`,
      `  CORS_ORIGINS="${config.prod_cors_origins || config.vercel_app_url || '<vercel-url>'}" \\`,
      `  CLOUDINARY_CLOUD_NAME="${config.cloudinary_cloud_name}" \\`,
      `  CLOUDINARY_API_KEY="${config.cloudinary_api_key}" \\`,
      `  CLOUDINARY_API_SECRET="${config.cloudinary_api_secret}"`,
    ];
    return lines.join('\n');
  }, [config]);

  const flyDeployCmd = useMemo(() => {
    const app = config.flyio_app_name || '<app-name>';
    const region = config.flyio_region || 'fra';
    return [
      `# 1) Login (una volta)`,
      `fly auth login`,
      ``,
      `# 2) Setup app (prima volta)`,
      `cd backend`,
      `fly launch --no-deploy --copy-config --name ${app} --region ${region}`,
      `fly volumes create app_uploads --size 1 --region ${region}`,
      ``,
      `# 3) Imposta i secrets (vedi pannello sopra)`,
      ``,
      `# 4) Deploy`,
      `fly deploy --app ${app}`,
    ].join('\n');
  }, [config]);

  const vercelEnvCmd = useMemo(() => {
    const backend = config.flyio_app_url || (config.flyio_app_name ? `https://${config.flyio_app_name}.fly.dev` : '<fly-url>');
    return [
      `# Imposta REACT_APP_BACKEND_URL su Vercel`,
      `# Settings → Environment Variables → Add per Production/Preview/Development:`,
      `REACT_APP_BACKEND_URL=${backend}`,
      ``,
      `# Oppure via CLI:`,
      `vercel env add REACT_APP_BACKEND_URL production`,
      `# (incolla il valore quando richiesto)`,
    ].join('\n');
  }, [config]);

  const generateJwt = () => {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const hex = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    update('prod_jwt_secret')(hex);
    toast.success('JWT_SECRET generato');
  };

  // ── Live deploy operations ─────────────────────────────────────
  const [opsLoading, setOpsLoading] = useState({});
  const [flyStatus, setFlyStatus] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const callOp = async (key, method, path, body) => {
    setOpsLoading(prev => ({ ...prev, [key]: true }));
    try {
      const { data } = await axios({ method, url: `${API}${path}`, data: body, withCredentials: true });
      setLastResult({ key, ok: true, data });
      toast.success(data?.message || 'Operazione completata');
      return data;
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      setLastResult({ key, ok: false, error: msg });
      toast.error(msg);
      throw err;
    } finally {
      setOpsLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const applyFlySecrets = () => callOp('fly-secrets', 'POST', '/deploy/fly/apply-secrets');
  const refreshFlyStatus = async () => {
    const data = await callOp('fly-status', 'GET', '/deploy/fly/status').catch(() => null);
    if (data) setFlyStatus(data);
  };
  const redeployFly = () => callOp('fly-redeploy', 'POST', '/deploy/fly/redeploy', {});
  const updateFlyImage = () => callOp('fly-update-image', 'POST', '/deploy/fly/update-image', {});
  const triggerVercel = () => callOp('vercel-trigger', 'POST', '/deploy/vercel/trigger');

  // ── Rotate credentials ─────────────────────────────────────────
  const [rotate, setRotate] = useState({
    rotate_jwt: true,
    rotate_superadmin_password: false,
    new_superadmin_password: '',
    apply_to_fly: true,
  });
  const [rotateResult, setRotateResult] = useState(null);

  const doRotate = async () => {
    try {
      const data = await callOp('rotate', 'POST', '/deploy/rotate-credentials', rotate);
      setRotateResult(data);
      // Refresh config to reflect new values
      fetchConfig();
    } catch { /* toast already shown */ }
  };

  // ── Uptime monitor ─────────────────────────────────────────────
  const [uptime, setUptime] = useState(null);
  const [uptimeLoading, setUptimeLoading] = useState(false);
  const loadUptime = async () => {
    setUptimeLoading(true);
    try {
      const { data } = await axios.get(`${API}/deploy/uptime/summary`, { withCredentials: true });
      setUptime(data);
    } catch (e) {
      // silent — page may have been opened before any config
    } finally { setUptimeLoading(false); }
  };
  useEffect(() => { loadUptime(); }, []);
  // Auto-refresh every 60s while user stays on page
  useEffect(() => {
    const t = setInterval(() => loadUptime(), 60_000);
    return () => clearInterval(t);
  }, []);

  const checkNow = async () => {
    try {
      await callOp('uptime-check', 'POST', '/deploy/uptime/check-now');
      await loadUptime();
    } catch { /* ignore */ }
  };

  if (loading) return <div className="text-center py-12 text-gray-500 dark:text-[#6a6a72]">Caricamento...</div>;

  if (user?.role !== 'super_admin') {
    return (
      <div className="bg-white dark:bg-[#131316] border border-gray-200 dark:border-white/10 rounded-xl p-8 text-center" data-testid="settings-forbidden">
        <Lock className="h-10 w-10 mx-auto text-gray-400 dark:text-[#5a5a62] mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Accesso riservato</h3>
        <p className="text-sm text-gray-500 dark:text-[#6a6a72] mt-1">Solo il super admin può configurare il deploy.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div className="flex items-start sm:items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Configurazione Deploy
          </h2>
          <p className="text-sm text-gray-500 dark:text-[#6a6a72] mt-1 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Solo super admin · Le credenziali sono cifrate in MongoDB
          </p>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
          data-testid="save-config-button"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Salvataggio...' : 'Salva tutto'}
        </Button>
      </div>

      <Tabs defaultValue="domain" className="w-full">
        <div className="-mx-3 sm:mx-0 overflow-x-auto pb-1">
          <TabsList className="flex sm:grid sm:grid-cols-8 w-max sm:w-auto min-w-full sm:min-w-0 px-3 sm:px-0 whitespace-nowrap">
            <TabsTrigger value="domain" data-testid="tab-domain" className="flex-shrink-0">
              <Crown className="h-4 w-4 mr-1.5" /> Dominio
            </TabsTrigger>
            <TabsTrigger value="flyio" data-testid="tab-flyio" className="flex-shrink-0">
              <Rocket className="h-4 w-4 mr-1.5" /> Fly.io
            </TabsTrigger>
            <TabsTrigger value="vercel" data-testid="tab-vercel" className="flex-shrink-0">
              <Globe2 className="h-4 w-4 mr-1.5" /> Vercel
            </TabsTrigger>
            <TabsTrigger value="secrets" data-testid="tab-secrets" className="flex-shrink-0">
              <KeyRound className="h-4 w-4 mr-1.5" /> Secrets
            </TabsTrigger>
            <TabsTrigger value="monitor" data-testid="tab-monitor" className="flex-shrink-0">
              <HeartPulse className="h-4 w-4 mr-1.5" /> Monitor
            </TabsTrigger>
            <TabsTrigger value="cloudinary" data-testid="tab-cloudinary" className="flex-shrink-0">
              <Cloud className="h-4 w-4 mr-1.5" /> Cloudinary
            </TabsTrigger>
            <TabsTrigger value="github" data-testid="tab-github" className="flex-shrink-0">
              <Database className="h-4 w-4 mr-1.5" /> Backup
            </TabsTrigger>
            <TabsTrigger value="usage" data-testid="tab-usage" className="flex-shrink-0">
              <Gauge className="h-4 w-4 mr-1.5" /> Usage
            </TabsTrigger>
          </TabsList>
        </div>

        {/* PLATFORM PRIMARY DOMAIN */}
        <TabsContent value="domain" className="space-y-6 mt-5">
          <PlatformDomainSection />
        </TabsContent>

        {/* FLY.IO */}
        <TabsContent value="flyio" className="space-y-6 mt-5">
          <Section icon={Rocket} title="Fly.io — Backend FastAPI"
                    desc="Token e nome app per il deploy del backend in Europa (region fra).">
            <SecretInput id="flyio_api_key" label="Fly API Token"
              value={config.flyio_api_key} onChange={update('flyio_api_key')}
              placeholder="fo1_xxx..."
              testid="flyio-api-key-input"
              hint="Ottieni il token: flyctl auth login → flyctl auth token  (o crealo su https://fly.io/user/personal_access_tokens)" />
            <div className="grid sm:grid-cols-2 gap-4">
              <TextField id="flyio_app_name" label="Nome App Fly.io"
                value={config.flyio_app_name} onChange={update('flyio_app_name')}
                placeholder="qrhub-backend" mono
                testid="flyio-app-name-input"
                hint="Sarà raggiungibile su https://<app>.fly.dev" />
              <TextField id="flyio_region" label="Region"
                value={config.flyio_region} onChange={update('flyio_region')}
                placeholder="fra"
                testid="flyio-region-input"
                hint="fra (Francoforte), cdg (Parigi), mad (Madrid)..." />
            </div>
            <TextField id="flyio_app_url" label="URL Backend Pubblico (auto-compilato)"
              value={config.flyio_app_url} onChange={update('flyio_app_url')}
              placeholder="https://qrhub-backend.fly.dev" mono
              testid="flyio-app-url-input"
              hint="Lascia vuoto se vuoi che venga calcolato da nome app + .fly.dev" />

            <a href="https://fly.io/user/personal_access_tokens" target="_blank" rel="noreferrer"
                className="inline-flex items-center text-xs text-[#D2FA46] hover:underline">
              Crea token Fly.io <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Section>

          <Section icon={Rocket} title="Comandi pronti" desc="Copia e incolla in terminale (richiede flyctl installato)."
                    accent="#1A1A1A">
            <CommandBlock label="Setup & Deploy" command={flyDeployCmd} testid="copy-fly-deploy" />
            <CommandBlock label="Imposta i secrets" command={flySecretsCmd} testid="copy-fly-secrets" />
          </Section>

          <Section icon={Zap} title="Esegui ora dal pannello"
                    desc="Tutte le operazioni Fly.io direttamente da qui — niente terminale."
                    accent="#10B981">
            <div className="flex flex-wrap gap-2">
              <Button onClick={applyFlySecrets} disabled={opsLoading['fly-secrets']}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      data-testid="btn-fly-apply-secrets">
                <KeyRound className="h-4 w-4 mr-2" />
                {opsLoading['fly-secrets'] ? 'Applico...' : 'Applica Secrets a Fly.io'}
              </Button>
              <Button onClick={redeployFly} disabled={opsLoading['fly-redeploy']}
                      className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
                      data-testid="btn-fly-redeploy">
                <Rocket className="h-4 w-4 mr-2" />
                {opsLoading['fly-redeploy'] ? 'Avvio...' : 'Redeploy immagine attuale'}
              </Button>
              <Button onClick={updateFlyImage} disabled={opsLoading['fly-update-image']}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      data-testid="btn-fly-update-image"
                      title="Aggiorna ogni machine all'ultima image pushata su registry.fly.io (dopo un fly deploy da CLI/CI)">
                <RefreshCw className={`h-4 w-4 mr-2 ${opsLoading['fly-update-image'] ? 'animate-spin' : ''}`} />
                {opsLoading['fly-update-image'] ? 'Aggiorno...' : 'Force update image'}
              </Button>
              <Button onClick={refreshFlyStatus} disabled={opsLoading['fly-status']}
                      variant="outline" data-testid="btn-fly-status">
                <RefreshCw className={`h-4 w-4 mr-2 ${opsLoading['fly-status'] ? 'animate-spin' : ''}`} />
                Aggiorna stato
              </Button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-[#6a6a72]">
              Il <strong>primo deploy</strong> dell'immagine deve essere fatto una volta con <code className="bg-gray-100 dark:bg-[#1a1a1c] px-1 rounded">fly deploy</code> (per buildare e pushare su <code className="bg-gray-100 dark:bg-[#1a1a1c] px-1 rounded">registry.fly.io</code>). Dopo, redeploy e secret-apply funzionano da qui.
            </p>

            {flyStatus && (
              <div className="border rounded-lg p-3 bg-gray-50 dark:bg-[#0a0a0b] space-y-2 text-sm" data-testid="fly-status-panel">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="font-semibold">App: <span className="font-mono">{flyStatus.app}</span></span>
                  <Badge variant={flyStatus.deployed ? 'default' : 'secondary'}
                          className={flyStatus.deployed ? 'bg-emerald-600' : ''}>
                    {flyStatus.deployed ? 'deployed' : (flyStatus.app_status || 'unknown')}
                  </Badge>
                </div>
                {flyStatus.release && (
                  <div className="text-xs text-gray-700 dark:text-[#a8a8b0]">
                    <div>Release: <span className="font-mono">v{flyStatus.release.version}</span> — {flyStatus.release.status}</div>
                    <div className="font-mono text-[10px] text-gray-500 dark:text-[#6a6a72] break-all">{flyStatus.release.imageRef}</div>
                  </div>
                )}
                <div className="space-y-1">
                  {(flyStatus.machines || []).map(m => (
                    <div key={m.id} className="flex items-center justify-between text-xs border-t pt-1">
                      <span className="font-mono">{m.id} · {m.region}</span>
                      <Badge variant="outline" className={
                        m.state === 'started' ? 'border-emerald-500 text-emerald-700' :
                        m.state === 'stopped' ? 'border-gray-400 text-gray-600 dark:text-[#8a8a92]' :
                        'border-amber-400 text-amber-700'
                      }>{m.state}</Badge>
                    </div>
                  ))}
                  {(!flyStatus.machines || flyStatus.machines.length === 0) && (
                    <p className="text-xs text-gray-500 dark:text-[#6a6a72] italic">Nessuna machine attiva.</p>
                  )}
                </div>
              </div>
            )}
          </Section>
        </TabsContent>

        {/* VERCEL */}
        <TabsContent value="vercel" className="space-y-6 mt-5">
          <Section icon={Globe2} title="Vercel — Frontend React"
                    desc="Token e project ID per il deploy del frontend statico.">
            <SecretInput id="vercel_token" label="Vercel Token"
              value={config.vercel_token} onChange={update('vercel_token')}
              placeholder="vc_xxx..."
              testid="vercel-token-input"
              hint="Vai su https://vercel.com/account/tokens → Create" />
            <div className="grid sm:grid-cols-2 gap-4">
              <TextField id="vercel_project_id" label="Project ID"
                value={config.vercel_project_id} onChange={update('vercel_project_id')}
                placeholder="prj_xxx..." mono
                testid="vercel-project-id-input"
                hint="Vercel Project → Settings → General → Project ID" />
              <TextField id="vercel_org_id" label="Team / Org ID (opzionale)"
                value={config.vercel_org_id} onChange={update('vercel_org_id')}
                placeholder="team_xxx..." mono
                testid="vercel-org-id-input" />
            </div>
            <TextField id="vercel_app_url" label="URL Frontend di produzione"
              value={config.vercel_app_url} onChange={update('vercel_app_url')}
              placeholder="https://qrhub-frontend.vercel.app" mono
              testid="vercel-app-url-input" />

            <SecretInput id="vercel_deploy_hook" label="Vercel Deploy Hook URL (consigliato)"
              value={config.vercel_deploy_hook} onChange={update('vercel_deploy_hook')}
              placeholder="https://api.vercel.com/v1/integrations/deploy/prj_xxx/yyy"
              testid="vercel-deploy-hook-input"
              hint="Vercel Project → Settings → Git → Deploy Hooks. Permette di triggerare deploy senza esporre il token." />

            <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer"
                className="inline-flex items-center text-xs text-[#D2FA46] hover:underline">
              Crea token Vercel <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Section>

          <Section icon={Globe2} title="Comandi pronti" accent="#1A1A1A">
            <CommandBlock label="Env Vercel (lega frontend ↔ backend)" command={vercelEnvCmd} testid="copy-vercel-env" />
          </Section>

          <Section icon={Zap} title="Esegui ora dal pannello"
                    desc="Triggera un nuovo deploy Vercel — usa il Deploy Hook se configurato."
                    accent="#10B981">
            <Button onClick={triggerVercel} disabled={opsLoading['vercel-trigger']}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    data-testid="btn-vercel-trigger">
              <Rocket className="h-4 w-4 mr-2" />
              {opsLoading['vercel-trigger'] ? 'Avvio...' : 'Triggera Deploy Vercel'}
            </Button>
            <p className="text-[11px] text-gray-500 dark:text-[#6a6a72]">
              Per il primo deploy collega il repo a Vercel manualmente (vercel.com → Add New → Project),
              poi qui puoi ri-distribuire ad ogni cambio. Con Deploy Hook anche senza token.
            </p>
          </Section>
        </TabsContent>

        {/* SECRETS PROD */}
        <TabsContent value="secrets" className="space-y-6 mt-5">
          <Section icon={KeyRound} title="Backend Secrets (produzione)"
                    desc="Saranno applicati al deploy Fly.io tramite `fly secrets set`.">
            <SecretInput id="prod_mongo_url" label="MONGO_URL"
              value={config.prod_mongo_url} onChange={update('prod_mongo_url')}
              placeholder="mongodb+srv://user:pwd@cluster.xxxxx.mongodb.net/..."
              testid="prod-mongo-url-input"
              hint="Connection string MongoDB Atlas" />
            <div className="grid sm:grid-cols-2 gap-4">
              <TextField id="prod_db_name" label="DB_NAME"
                value={config.prod_db_name} onChange={update('prod_db_name')}
                placeholder="qrhub_db" mono
                testid="prod-db-name-input" />
              <div>
                <Label htmlFor="prod_jwt_secret">JWT_SECRET</Label>
                <div className="flex gap-2">
                  <SecretInput id="prod_jwt_secret" label=""
                    value={config.prod_jwt_secret} onChange={update('prod_jwt_secret')}
                    placeholder="64-hex-chars"
                    testid="prod-jwt-secret-input" />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={generateJwt}
                        className="mt-1.5" data-testid="generate-jwt-button">
                  Genera JWT casuale
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-sky-200/60 dark:border-sky-500/20 bg-sky-50/50 dark:bg-sky-500/[0.04] p-3 text-xs text-sky-900 dark:text-sky-200 flex gap-2" data-testid="admin-info-note">
              <span className="font-bold flex-shrink-0">ℹ</span>
              <span>
                Da questa sezione gestisci solo le credenziali <strong>infrastrutturali</strong> (Mongo, JWT, super admin, CORS, frontend URL). Il <strong>super admin</strong> viene seedato automaticamente al boot del backend tramite queste variabili. Gli <strong>org admin</strong> e tutti gli altri utenti operativi si creano direttamente dal pannello "Modifica utenti" della rispettiva organizzazione — non esiste più un seed legacy via env.
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <TextField id="prod_superadmin_email" label="SUPERADMIN_EMAIL"
                value={config.prod_superadmin_email} onChange={update('prod_superadmin_email')}
                placeholder="superadmin@qrhub.it"
                testid="prod-superadmin-email-input" />
              <SecretInput id="prod_superadmin_password" label="SUPERADMIN_PASSWORD"
                value={config.prod_superadmin_password} onChange={update('prod_superadmin_password')}
                placeholder="••••••"
                testid="prod-superadmin-password-input" />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <TextField id="prod_frontend_url" label="FRONTEND_URL"
                value={config.prod_frontend_url} onChange={update('prod_frontend_url')}
                placeholder="https://qrhub-frontend.vercel.app" mono
                testid="prod-frontend-url-input"
                hint="Usato per generare i link QR e i CORS" />
              <TextField id="prod_cors_origins" label="CORS_ORIGINS"
                value={config.prod_cors_origins} onChange={update('prod_cors_origins')}
                placeholder="https://qrhub-frontend.vercel.app,https://qr.tuodominio.it" mono
                testid="prod-cors-origins-input"
                hint="Lista separata da virgole" />
            </div>
          </Section>

          <Section icon={RotateCw} title="Ruota credenziali ora"
                    desc="Genera nuovo JWT_SECRET e/o nuove password. Aggiorna il DB locale e (opzionale) Fly.io secrets."
                    accent="#DC2626">
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <p className="text-sm font-medium">Ruota JWT_SECRET</p>
                <p className="text-xs text-gray-500 dark:text-[#6a6a72]">Nuovo token casuale 64 hex chars. Tutti gli utenti dovranno rifare login.</p>
              </div>
              <Switch checked={rotate.rotate_jwt}
                      onCheckedChange={(v) => setRotate(r => ({ ...r, rotate_jwt: v }))}
                      data-testid="switch-rotate-jwt" />
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Ruota password Super Admin</p>
                  <p className="text-xs text-gray-500 dark:text-[#6a6a72]">{config.prod_superadmin_email || 'superadmin@qrhub.it'}</p>
                </div>
                <Switch checked={rotate.rotate_superadmin_password}
                        onCheckedChange={(v) => setRotate(r => ({ ...r, rotate_superadmin_password: v }))}
                        data-testid="switch-rotate-superadmin" />
              </div>
              {rotate.rotate_superadmin_password && (
                <Input value={rotate.new_superadmin_password}
                        onChange={(e) => setRotate(r => ({ ...r, new_superadmin_password: e.target.value }))}
                        placeholder="Lascia vuoto per generare automaticamente"
                        className="font-mono"
                        data-testid="input-new-superadmin-pwd" />
              )}
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3 bg-amber-50">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-600" />Applica anche su Fly.io</p>
                <p className="text-xs text-gray-600 dark:text-[#8a8a92]">Richiede Fly Token + Nome App. I secrets vengono inviati a Fly subito.</p>
              </div>
              <Switch checked={rotate.apply_to_fly}
                      onCheckedChange={(v) => setRotate(r => ({ ...r, apply_to_fly: v }))}
                      data-testid="switch-apply-to-fly" />
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-red-600 hover:bg-red-700 text-white" data-testid="btn-rotate-open">
                  <RotateCw className="h-4 w-4 mr-2" />
                  Ruota credenziali ora
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid="rotate-dialog">
                <AlertDialogHeader>
                  <AlertDialogTitle>Confermi la rotazione?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Le nuove credenziali sostituiranno quelle attuali. Salva le nuove password mostrate dopo la rotazione: <strong>non saranno più recuperabili in chiaro</strong>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="rotate-cancel">Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={doRotate} className="bg-red-600 hover:bg-red-700"
                                      disabled={opsLoading['rotate']}
                                      data-testid="rotate-confirm">
                    {opsLoading['rotate'] ? 'Rotazione...' : 'Conferma rotazione'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {rotateResult && (
              <div className="border-2 border-emerald-500 rounded-lg p-4 bg-emerald-50 space-y-2"
                    data-testid="rotate-result">
                <p className="font-semibold text-emerald-800 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />Rotazione completata
                </p>
                {rotateResult.new_jwt_secret_preview && (
                  <div className="text-sm">JWT_SECRET: <span className="font-mono">{rotateResult.new_jwt_secret_preview}</span></div>
                )}
                {rotateResult.new_superadmin_password && (
                  <div className="text-sm font-mono bg-white dark:bg-[#131316] border p-2 rounded">
                    <strong>Super pwd:</strong> {rotateResult.new_superadmin_password}
                  </div>
                )}
                {rotateResult.fly && (
                  <div className="text-xs text-gray-700 dark:text-[#a8a8b0]">
                    Fly release: v{rotateResult.fly.release_version} — secrets aggiornati
                    ({(rotateResult.fly.applied_keys || []).length})
                  </div>
                )}
              </div>
            )}
          </Section>
        </TabsContent>

        {/* MONITOR */}
        <TabsContent value="monitor" className="space-y-6 mt-5">
          <Section icon={HeartPulse} title="Uptime backend in produzione"
                    desc="Ping automatico ogni 60s sul tuo backend Fly.io. Storico 24h."
                    accent="#10B981">
            {!uptime ? (
              <p className="text-sm text-gray-500 dark:text-[#6a6a72]">Caricamento...</p>
            ) : !uptime.has_data ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-[#8a8a92]">{uptime.message}</p>
                <div className="text-xs text-gray-500 dark:text-[#6a6a72]">
                  Target: <span className="font-mono">{uptime.target || '— non configurato —'}</span>
                </div>
                <Button onClick={checkNow} disabled={opsLoading['uptime-check']}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="btn-uptime-check">
                  <RefreshCw className={`h-4 w-4 mr-2 ${opsLoading['uptime-check'] ? 'animate-spin' : ''}`} />
                  Esegui check ora
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Status cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`rounded-xl border p-4 ${
                    uptime.current_status === 'up'
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-red-200 bg-red-50'
                  }`} data-testid="uptime-status-card">
                    <div className="flex items-center gap-2">
                      {uptime.current_status === 'up'
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        : <XCircle className="h-5 w-5 text-red-600" />}
                      <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-[#6a6a72]">Stato</span>
                    </div>
                    <div className={`text-2xl font-bold mt-1 ${
                      uptime.current_status === 'up' ? 'text-emerald-700' : 'text-red-700'
                    }`}>
                      {uptime.current_status === 'up' ? 'Online' : 'Offline'}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-0.5">
                      HTTP {uptime.last_check?.status_code || '—'}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-white dark:bg-[#131316] p-4">
                    <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-[#6a6a72]">Uptime 24h</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                      {uptime.uptime_pct_24h}%
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-0.5">
                      {uptime.total_checks - uptime.down_count}/{uptime.total_checks} check OK
                    </div>
                  </div>

                  <div className="rounded-xl border bg-white dark:bg-[#131316] p-4">
                    <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-[#6a6a72]">Latenza media</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                      {uptime.avg_latency_ms}<span className="text-sm text-gray-500 dark:text-[#6a6a72] font-normal"> ms</span>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-0.5">
                      ultimo: {uptime.last_check?.latency_ms || 0} ms
                    </div>
                  </div>

                  <div className="rounded-xl border bg-white dark:bg-[#131316] p-4">
                    <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-[#6a6a72]">Downtime</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                      {uptime.down_count}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-0.5">incidenti 24h</div>
                  </div>
                </div>

                {/* Chart */}
                <div className="bg-white dark:bg-[#131316] border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-emerald-600" /> Latenza per ora (ms)
                    </h4>
                    <Button onClick={loadUptime} disabled={uptimeLoading} variant="ghost" size="sm"
                            data-testid="btn-uptime-refresh">
                      <RefreshCw className={`h-3.5 w-3.5 ${uptimeLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer>
                      <LineChart data={uptime.chart} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          labelStyle={{ color: '#6b7280' }}
                          formatter={(v) => [`${v} ms`, 'latenza media']}
                        />
                        <Line type="monotone" dataKey="avg_latency" stroke="#10b981"
                                strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-1">
                    Target: <span className="font-mono">{uptime.target}</span> · intervallo {uptime.interval_sec}s
                  </p>
                </div>

                {/* Recent log */}
                <div className="bg-white dark:bg-[#131316] border rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b bg-gray-50 dark:bg-[#0a0a0b] text-xs font-semibold text-gray-700 dark:text-[#a8a8b0]">
                    Ultimi 15 check
                  </div>
                  <div className="divide-y max-h-72 overflow-y-auto">
                    {uptime.recent.map((c, i) => (
                      <div key={i} className="px-4 py-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          {c.up
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                            : <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />}
                          <span className="text-gray-700 dark:text-[#a8a8b0] font-mono truncate">
                            {c.timestamp.slice(11, 19)} UTC
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-gray-600 dark:text-[#8a8a92]">
                          <span className="font-mono">HTTP {c.status_code || '—'}</span>
                          <span className="font-mono">{c.latency_ms} ms</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button onClick={checkNow} disabled={opsLoading['uptime-check']}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          data-testid="btn-uptime-check">
                    <RefreshCw className={`h-4 w-4 mr-2 ${opsLoading['uptime-check'] ? 'animate-spin' : ''}`} />
                    Esegui check ora
                  </Button>
                  {uptime.target && (
                    <a href={uptime.target.replace(/\/api\/.*$/, '')} target="_blank" rel="noreferrer">
                      <Button variant="outline" type="button">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Apri backend
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            )}
          </Section>

          <Section icon={Activity} title="Configurazione monitor" desc="Path e intervallo del check.">
            <div className="grid sm:grid-cols-2 gap-4">
              <TextField id="uptime_health_path" label="Health path"
                value={config.uptime_health_path} onChange={update('uptime_health_path')}
                placeholder="/api/auth/me" mono
                testid="uptime-health-path-input"
                hint="401 / 200 / 403 = backend online. Default /api/auth/me" />
              <TextField id="uptime_interval_sec" label="Intervallo (secondi)"
                value={config.uptime_interval_sec} onChange={(v) => update('uptime_interval_sec')(Number(v) || 60)}
                placeholder="60"
                testid="uptime-interval-input"
                hint="Minimo 30s — applicato al prossimo ciclo dopo il salvataggio" />
            </div>
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <p className="text-sm font-medium">Monitor abilitato</p>
                <p className="text-xs text-gray-500 dark:text-[#6a6a72]">Disattiva per fermare il loop background.</p>
              </div>
              <Switch checked={config.uptime_enabled !== false}
                      onCheckedChange={(v) => update('uptime_enabled')(v)}
                      data-testid="switch-uptime-enabled" />
            </div>
          </Section>
        </TabsContent>

        {/* CLOUDINARY */}
        <TabsContent value="cloudinary" className="space-y-6 mt-5">
          <Section icon={Cloud} title="Cloudinary URL (consigliato)"
                    desc="Formato ufficiale: copia il valore singolo dal dashboard Cloudinary."
                    accent="#3B82F6">
            <SecretInput id="cloudinary_url" label="CLOUDINARY_URL"
              value={config.cloudinary_url} onChange={update('cloudinary_url')}
              placeholder="cloudinary://API_KEY:API_SECRET@CLOUD_NAME"
              testid="cloudinary-url-input"
              hint="Cloudinary Dashboard → Settings → API Keys → copia 'API Environment variable'" />
            <p className="text-[11px] text-gray-500 dark:text-[#6a6a72]">
              Se compili questo campo, i 3 valori separati qui sotto vengono ignorati. È il modo più semplice e sicuro.
            </p>
            <a href="https://console.cloudinary.com/console/settings/api-keys" target="_blank" rel="noreferrer"
                className="inline-flex items-center text-xs text-[#D2FA46] hover:underline">
              Apri API Keys Cloudinary <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Section>

          <Section icon={Cloud} title="Cloudinary — Storage media (formato esteso)"
                    desc="In alternativa, compila i 3 valori separati (solo se non usi CLOUDINARY_URL sopra).">
            <TextField id="cloudinary_cloud_name" label="Cloud Name"
              value={config.cloudinary_cloud_name} onChange={update('cloudinary_cloud_name')}
              placeholder="es. mycloud123" mono
              testid="cloudinary-cloud-name-input" />
            <SecretInput id="cloudinary_api_key" label="API Key"
              value={config.cloudinary_api_key} onChange={update('cloudinary_api_key')}
              placeholder="es. 123456789012345"
              testid="cloudinary-api-key-input" />
            <SecretInput id="cloudinary_api_secret" label="API Secret"
              value={config.cloudinary_api_secret} onChange={update('cloudinary_api_secret')}
              placeholder="••••••"
              testid="cloudinary-api-secret-input" />
          </Section>
        </TabsContent>

        {/* BACKUP (riusa la chiave 'github' per non rompere lo state) */}
        <TabsContent value="github" className="space-y-6 mt-5">
          <BackupSection />

          <Section icon={Github} title="Repository GitHub"
                    desc="Configura il repository sorgente per consentire il backup snapshot del codice.">
            <TextField id="github_repo" label="Repository"
              value={config.github_repo} onChange={update('github_repo')}
              placeholder="owner/repo-name" mono
              testid="github-repo-input" />
            <SecretInput id="github_token" label="Personal Access Token"
              value={config.github_token} onChange={update('github_token')}
              placeholder="ghp_xxx..."
              testid="github-token-input"
              hint="https://github.com/settings/tokens — scope minimo: 'repo' read-only" />
          </Section>
        </TabsContent>

        {/* USAGE / FREE-TIER MONITOR */}
        <TabsContent value="usage" className="space-y-6 mt-5">
          <UsageSection
            atlasFields={{
              public_key: config.atlas_public_key,
              private_key: config.atlas_private_key,
              group_id: config.atlas_group_id,
            }}
            updateAtlas={update}
          />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
          data-testid="save-config-button-bottom"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Salvataggio...' : 'Salva tutto'}
        </Button>
      </div>
    </div>
  );
};

export default Settings;

// ──────────────────────────────────────────────────────────────────
// Backup — DB JSON + GitHub repo zipball.
// Streams directly from the backend so the GitHub token never reaches
// the browser. No credentials are stored in localStorage.
// ──────────────────────────────────────────────────────────────────
const BackupSection = () => {
  const [busy, setBusy] = useState('');

  const downloadBlob = async (path, defaultName) => {
    setBusy(path);
    try {
      const res = await axios.get(`${API}${path}`, {
        withCredentials: true,
        responseType: 'blob',
      });
      // Build a friendly filename from Content-Disposition if available.
      let fname = defaultName;
      const dispo = res.headers['content-disposition'] || '';
      const m = dispo.match(/filename="?([^"]+)"?/);
      if (m) fname = m[1];
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Download avviato: ${fname}`);
    } catch (e) {
      // The backend returns a JSON error inside the blob → read it.
      let msg = e.response?.statusText || 'Errore download';
      try {
        const txt = await e.response?.data?.text?.();
        if (txt) {
          const j = JSON.parse(txt);
          msg = j.detail || msg;
        }
      } catch { /* ignore */ }
      toast.error(msg);
    } finally {
      setBusy('');
    }
  };

  return (
    <Section icon={Database} title="Backup Database & Repository"
              desc="Snapshot completi scaricabili in qualunque momento. Eseguili regolarmente: la piattaforma free non ha backup automatici."
              accent="#D2FA46">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 bg-gray-50/50 dark:bg-[#0f0f12]">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-emerald-600" />
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Database (MongoDB)</h4>
          </div>
          <p className="text-xs text-gray-600 dark:text-[#8a8a92] mb-3 leading-relaxed">
            ZIP con tutte le collection in formato JSON (Extended). Include un manifest e
            un README con i comandi <code>mongoimport</code> per il restore.
          </p>
          <Button
            onClick={() => downloadBlob('/super-admin/backup/db', 'qrhub-db-backup.zip')}
            disabled={busy === '/super-admin/backup/db'}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="backup-db-button"
          >
            <Download className="h-4 w-4 mr-2" />
            {busy === '/super-admin/backup/db' ? 'Generazione…' : 'Scarica backup DB'}
          </Button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 bg-gray-50/50 dark:bg-[#0f0f12]">
          <div className="flex items-center gap-2 mb-2">
            <Github className="h-4 w-4 text-gray-900 dark:text-white" />
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Repository GitHub</h4>
          </div>
          <p className="text-xs text-gray-600 dark:text-[#8a8a92] mb-3 leading-relaxed">
            ZIP del branch <code>main</code> (zipball ufficiale GitHub). Richiede repository
            + token configurati qui sotto.
          </p>
          <Button
            onClick={() => downloadBlob('/super-admin/backup/github', 'qrhub-repo.zip')}
            disabled={busy === '/super-admin/backup/github'}
            className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100"
            data-testid="backup-github-button"
          >
            <Download className="h-4 w-4 mr-2" />
            {busy === '/super-admin/backup/github' ? 'Scaricamento…' : 'Scarica snapshot repo'}
          </Button>
        </div>
      </div>

      <div className="text-xs text-gray-600 dark:text-[#8a8a92] bg-amber-50 border-l-2 border-amber-400 p-3 rounded-r mt-3">
        <strong>Suggerimento:</strong> esegui un backup DB <strong>prima</strong> di ogni deploy
        importante o modifica massiva. Conserva almeno gli ultimi 7 backup su disco/cloud personale.
      </div>
    </Section>
  );
};

// ──────────────────────────────────────────────────────────────────
// Usage / Free-tier monitor — fetches /super-admin/usage and renders
// a card per provider with a progress bar + "% used" indicator.
// ──────────────────────────────────────────────────────────────────
const UsageSection = ({ atlasFields, updateAtlas }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get(`${API}/super-admin/usage`, { withCredentials: true });
      setData(data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Errore');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  return (
    <>
      <Section icon={Gauge} title="Monitor consumo Free-Tier"
                desc="Verifica in un colpo d'occhio se sei dentro i limiti gratuiti dei provider."
                accent="#10B981">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500 dark:text-[#6a6a72]">
            {data?.fetched_at && (
              <>Ultimo aggiornamento: {new Date(data.fetched_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</>
            )}
          </p>
          <Button
            onClick={refresh}
            disabled={loading}
            size="sm"
            variant="outline"
            data-testid="usage-refresh-button"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Aggiorna
          </Button>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border-l-2 border-red-400 p-3 rounded-r">{error}</div>
        )}

        {loading && !data && (
          <div className="text-sm text-gray-500 dark:text-[#6a6a72] py-6 text-center">Caricamento…</div>
        )}

        {data?.billing && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/[0.08] dark:border-emerald-500/20 p-4 mb-3 flex items-center justify-between gap-3 flex-wrap"
                data-testid="billing-banner">
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold text-emerald-700 dark:text-emerald-400">Costo questo mese (provider noti)</p>
              <p className="text-2xl font-black tracking-tight text-emerald-900 dark:text-emerald-100 leading-tight">
                ${data.billing.known_cost_usd_month.toFixed(2)}
                <span className="text-xs font-medium text-emerald-700/70 dark:text-emerald-300/70 ml-2">/ mese</span>
              </p>
              {data.billing.unknown_providers?.length > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                  + uso effettivo Fly (pay-as-you-go, non esposto da API): verifica nel dashboard Fly →
                  <a href={data.fly?.dashboard_url} target="_blank" rel="noreferrer" className="underline ml-1">apri Billing</a>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[11px] text-emerald-700/70 dark:text-emerald-300/70">Stato fatturazione</p>
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                {data.fly?.billing_status === 'CURRENT' ? '✓ In regola' : (data.fly?.billing_status || '—')}
              </p>
            </div>
          </div>
        )}

        {data && (
          <div className="grid sm:grid-cols-2 gap-3" data-testid="usage-grid">
            <UsageCard provider="Fly.io" color="#7d2ae8" data={data.fly}
                        bars={(d) => [
                          { label: 'Machine attive', used: d.machines_used, limit: d.machines_limit, unit: '' },
                          { label: 'Volume storage', used: d.volume_gb_used, limit: d.volume_gb_limit, unit: 'GB' },
                        ]}
                        extras={(d) => d.cost_note || ''} />
            <UsageCard provider="MongoDB Atlas" color="#13aa52" data={data.mongodb_atlas}
                        bars={(d) => d.storage_used_mb != null
                          ? [{ label: 'Storage DB', used: d.storage_used_mb, limit: d.storage_limit_mb, unit: 'MB' }]
                          : []}
                        extras={(d) => {
                          const parts = [];
                          if (d.clusters?.length) parts.push(d.clusters.map(c => `${c.name} · ${c.instance_size} · ${c.state}`).join(' • '));
                          if (d.status === 'partial') parts.push('Stato cluster: aggiungi le chiavi Atlas qui sotto.');
                          if (d.hint && d.status !== 'partial') parts.push(d.hint);
                          return parts.join(' — ');
                        }} />
            <UsageCard provider="Cloudinary" color="#3448c5" data={data.cloudinary}
                        bars={(d) => [
                          { label: 'Crediti / mese', used: d.credits_used, limit: d.credits_limit, unit: '' },
                        ]}
                        extras={(d) => `Plan: ${d.plan} · ${(d.bandwidth_bytes / 1e9).toFixed(2)} GB banda · ${(d.storage_bytes / 1e6).toFixed(1)} MB storage`} />
            <UsageCard provider="Vercel" color="#000" data={data.vercel}
                        bars={(d) => [
                          { label: 'Deploy nelle ultime 24h', used: d.deployments_24h, limit: d.deployments_24h_limit, unit: '' },
                        ]}
                        extras={(d) => `Deploy ultimi 30gg: ${d.deployments_30d} · Stato ultimo: ${d.latest_state}`} />
          </div>
        )}
      </Section>

      <Section icon={Database} title="MongoDB Atlas — credenziali API (opzionale)"
                desc="Servono solo per il monitor del consumo cluster. Read-only key 'Project Read Only'."
                accent="#13aa52">
        <TextField id="atlas_public_key" label="Public Key"
          value={atlasFields.public_key} onChange={updateAtlas('atlas_public_key')}
          placeholder="abcdefgh" mono
          testid="atlas-public-key-input" />
        <SecretInput id="atlas_private_key" label="Private Key"
          value={atlasFields.private_key} onChange={updateAtlas('atlas_private_key')}
          placeholder="00000000-0000-0000-0000-000000000000"
          testid="atlas-private-key-input"
          hint="Atlas → Organization → Access Manager → API Keys" />
        <TextField id="atlas_group_id" label="Project ID (Group ID)"
          value={atlasFields.group_id} onChange={updateAtlas('atlas_group_id')}
          placeholder="68xxxxx..." mono
          testid="atlas-group-id-input" />
        <div className="text-xs text-gray-600 dark:text-[#8a8a92] bg-emerald-50 border-l-2 border-emerald-400 p-3 rounded-r">
          Senza queste chiavi il monitor mostra "non configurato" per MongoDB ma <strong>continua a funzionare</strong>
          per gli altri provider. Crea una key con ruolo <code>Project Read Only</code> in Atlas.
        </div>
      </Section>
    </>
  );
};

const UsageCard = ({ provider, color, data, bars, extras }) => {
  const isOk = data?.status === 'ok';
  const isPartial = data?.status === 'partial';
  const isErr = data?.status === 'error';
  const isMissing = data?.status === 'not_configured';

  const pct = (used, limit) => {
    if (used == null || !limit) return 0;
    return Math.min(100, Math.round((Number(used) / Number(limit)) * 100));
  };
  const tone = (p) => (p >= 90 ? '#dc2626' : p >= 70 ? '#f97316' : color);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 bg-white dark:bg-[#131316]"
          data-testid={`usage-card-${provider.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{provider}</h4>
        </div>
        <div className="flex items-center gap-1.5">
          {isOk && data?.cost_usd_month != null && (
            <Badge className={data.cost_usd_month === 0
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-800'}>
              ${data.cost_usd_month.toFixed(2)}/mese
            </Badge>
          )}
          {isOk && data?.cost_usd_month == null && data?.plan && (
            <Badge className="bg-blue-100 text-blue-700">{data.plan}</Badge>
          )}
          {isOk && <Badge className="bg-emerald-100 text-emerald-700">OK</Badge>}
          {isPartial && <Badge className="bg-amber-100 text-amber-800">Parziale</Badge>}
          {isErr && <Badge className="bg-red-100 text-red-700">Errore</Badge>}
          {isMissing && <Badge className="bg-gray-200 text-gray-700">Non configurato</Badge>}
        </div>
      </div>

      {isErr && (
        <p className="text-xs text-red-700 bg-red-50 border-l-2 border-red-400 p-2 rounded-r">
          {data.error}
        </p>
      )}

      {isMissing && data?.hint && (
        <p className="text-xs text-gray-600 dark:text-[#8a8a92]">{data.hint}</p>
      )}

      {(isOk || isPartial) && bars && (
        <div className="space-y-2">
          {bars(data).map((b, i) => {
            const p = pct(b.used, b.limit);
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-600 dark:text-[#a8a8b0]">{b.label}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {Number(b.used ?? 0).toLocaleString('it-IT', { maximumFractionDigits: 2 })}
                    {b.unit && ` ${b.unit}`}
                    <span className="text-gray-400 dark:text-[#5a5a62]"> / {b.limit}{b.unit && ` ${b.unit}`}</span>
                    <span className="text-gray-400 dark:text-[#5a5a62] ml-1">({p}%)</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${p}%`, background: tone(p) }} />
                </div>
              </div>
            );
          })}
          {extras && (
            <p className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-2 pt-2 border-t border-gray-100 dark:border-white/5 leading-relaxed">
              {extras(data)}
            </p>
          )}
          {data?.dashboard_url && (
            <a href={data.dashboard_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] mt-2 text-gray-500 hover:text-gray-900 dark:text-[#8a8a92] dark:hover:text-white hover:underline">
              <ExternalLink className="h-3 w-3" />
              Apri billing dashboard
            </a>
          )}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// Platform Primary Domain — super admin section.
// Mirrors the tenant Domain UX (verify + DNS instructions) but for the
// canonical admin host (e.g. qrhub.it). When set, custom tenant domains
// (e.g. app.tenant-example.com) automatically redirect non-landing traffic here.
// ──────────────────────────────────────────────────────────────────
const PlatformDomainSection = () => {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = async () => {
    try {
      const { data } = await axios.get(`${API}/platform/primary-domain`, { withCredentials: true });
      setDoc(data?.domain ? data : null);
    } catch (e) {
      // No domain set yet = 200 with {domain:null}; only show error for real failures.
      console.warn('platform domain fetch:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const submit = async (e) => {
    e?.preventDefault?.();
    const domain = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!domain || !domain.includes('.')) {
      toast.error('Dominio non valido (es. qrhub.it)');
      return;
    }
    setBusy('set');
    try {
      await axios.put(`${API}/platform/primary-domain`, { domain }, { withCredentials: true });
      toast.success(`Dominio "${domain}" registrato su Vercel`);
      setInput('');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore registrazione dominio');
    } finally {
      setBusy('');
    }
  };

  const recheck = async () => {
    setBusy('verify');
    try {
      await axios.post(`${API}/platform/primary-domain/verify`, {}, { withCredentials: true });
      toast.success('Stato DNS aggiornato');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore verifica');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!window.confirm(`Vuoi davvero rimuovere "${doc.domain}" come dominio principale?\nIl login admin tornerà a rispondere solo su qrhub-app.vercel.app finché non lo riconfiguri.`)) return;
    setBusy('remove');
    try {
      await axios.delete(`${API}/platform/primary-domain`, { withCredentials: true });
      toast.success('Dominio rimosso');
      setDoc(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore rimozione');
    } finally {
      setBusy('');
    }
  };

  const copyVal = async (v) => {
    try { await navigator.clipboard.writeText(v); toast.success('Copiato'); }
    catch { toast.error('Impossibile copiare'); }
  };

  if (loading) {
    return <div className="text-sm text-gray-500 dark:text-[#6a6a72]">Caricamento…</div>;
  }

  const live = doc?.dns || {};
  const isApex = doc && doc.domain && doc.apex && doc.domain === doc.apex;
  const dnsMisconfigured = !doc?.verified || live.misconfigured !== false;
  const recCname = live.recommended_cname || 'cname.vercel-dns.com';
  const recA = (live.recommended_a_values && live.recommended_a_values.length > 0)
    ? live.recommended_a_values : ['76.76.21.21'];
  const recordType = isApex ? 'A' : 'CNAME';
  const recordValues = isApex ? recA : [recCname];

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
        <div className="font-semibold text-amber-900 mb-1 flex items-center gap-2">
          <Crown className="h-4 w-4" /> Dominio principale piattaforma
        </div>
        <p className="text-amber-900/90">
          Quando configurato, è l'unico hostname dove vivono il login admin e il dashboard.
          I domini personalizzati dei tenant (es. app.nomeazienda.it) serviranno solo le landing pubbliche
          dei venditori; ogni altra richiesta verrà reindirizzata qui automaticamente.
        </p>
      </div>

      {!doc ? (
        <form onSubmit={submit} className="space-y-3" data-testid="platform-domain-form">
          <Label>Dominio</Label>
          <div className="flex gap-2 flex-wrap">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="es. qrhub.it"
              className="flex-1 min-w-[240px] font-mono"
              data-testid="platform-domain-input"
            />
            <Button
              type="submit"
              disabled={busy === 'set' || !input.trim()}
              className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
              data-testid="platform-domain-submit"
            >
              {busy === 'set' ? 'Registro su Vercel…' : 'Registra'}
            </Button>
          </div>
          <p className="text-xs text-gray-500 dark:text-[#6a6a72]">
            Inseriscilo senza <code>https://</code>. Verrà registrato automaticamente sul progetto Vercel.
            Dopo serviranno i record DNS sul tuo provider (Aruba/Cloudflare/etc.).
          </p>
        </form>
      ) : (
        <div className="border rounded-lg p-4 bg-white dark:bg-[#131316]" data-testid="platform-domain-card">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="min-w-0">
              <a
                href={`https://${doc.domain}`}
                target="_blank" rel="noreferrer"
                className="text-lg font-mono font-bold hover:underline text-gray-900 dark:text-white"
                data-testid="platform-domain-link"
              >
                {doc.domain}
              </a>
              <div className="mt-1">
                {!dnsMisconfigured ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
                    <CheckCircle2 className="h-3 w-3 mr-1" />Online
                  </Badge>
                ) : doc.verified ? (
                  <Badge variant="outline" className="border-amber-500 text-amber-800 bg-amber-50">
                    <AlertTriangle className="h-3 w-3 mr-1" />DNS da configurare
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-400 text-amber-700">
                    <AlertTriangle className="h-3 w-3 mr-1" />In attesa verifica
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={recheck} disabled={busy === 'verify'}
                       data-testid="platform-domain-recheck">
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${busy === 'verify' ? 'animate-spin' : ''}`} />
                Ricontrolla
              </Button>
              <Button size="sm" variant="outline" onClick={remove} disabled={busy === 'remove'}
                       className="text-red-600 border-red-200 hover:bg-red-50"
                       data-testid="platform-domain-remove">
                <Trash2 className="h-3.5 w-3.5 mr-1" />Rimuovi
              </Button>
            </div>
          </div>

          {dnsMisconfigured && (
            <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-amber-900">
                Configura il DNS sul provider del dominio (Aruba/Cloudflare/…)
              </p>
              <div className="bg-white dark:bg-[#131316] border rounded p-2.5 text-xs space-y-1.5">
                <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 items-center">
                  <span className="text-gray-500 dark:text-[#6a6a72]">Tipo</span>
                  <span className="font-mono font-semibold">{recordType}</span>

                  <span className="text-gray-500 dark:text-[#6a6a72]">Host / Nome</span>
                  <button type="button" onClick={() => copyVal(isApex ? '@' : doc.domain.split('.')[0])}
                          className="font-mono font-semibold text-left hover:text-[#D2FA46] inline-flex items-center gap-1">
                    {isApex ? '@' : doc.domain.split('.')[0]}
                    <Copy className="h-3 w-3 opacity-50" />
                  </button>

                  <span className="text-gray-500 dark:text-[#6a6a72]">{recordValues.length > 1 ? 'Valori' : 'Valore'}</span>
                  <div className="flex flex-col gap-1">
                    {recordValues.map((v, i) => (
                      <button key={v + i} type="button" onClick={() => copyVal(v)}
                               className="font-mono font-semibold text-left break-all hover:text-[#D2FA46] inline-flex items-center gap-1">
                        {v} <Copy className="h-3 w-3 opacity-50 flex-shrink-0" />
                      </button>
                    ))}
                  </div>

                  <span className="text-gray-500 dark:text-[#6a6a72]">TTL</span>
                  <span className="font-mono">3600 (o "Auto")</span>
                </div>
              </div>
              <p className="text-[11px] text-amber-800/80 italic pt-1">
                Dopo aver salvato il record sul provider DNS, attendi 5–10 minuti per la propagazione
                e clicca "Ricontrolla". Il certificato SSL viene emesso automaticamente da Vercel.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

