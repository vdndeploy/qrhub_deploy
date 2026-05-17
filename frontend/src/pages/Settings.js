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
  HeartPulse, CheckCircle2, XCircle,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EMPTY = {
  flyio_api_key: '', flyio_app_name: '', flyio_region: 'fra', flyio_app_url: '',
  vercel_token: '', vercel_project_id: '', vercel_org_id: '', vercel_app_url: '',
  vercel_deploy_hook: '',
  github_repo: '', github_token: '',
  prod_mongo_url: '', prod_db_name: 'qrhub_db', prod_jwt_secret: '',
  prod_admin_email: '', prod_admin_password: '',
  prod_superadmin_email: '', prod_superadmin_password: '',
  prod_frontend_url: '', prod_cors_origins: '',
  cloudinary_url: '',
  cloudinary_cloud_name: '', cloudinary_api_key: '', cloudinary_api_secret: '',
  aruba_dns_zone: '', aruba_notes: '',
};

const Section = ({ icon: Icon, title, desc, children, accent = '#F96815' }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 shadow-sm">
    <div className="flex items-start gap-3 mb-5">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${accent}14`, color: accent }}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
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
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900"
          tabIndex={-1}
          aria-label={show ? 'Nascondi' : 'Mostra'}
          data-testid={`${testid}-toggle`}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
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
    {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
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
        <Label className="text-xs text-gray-600">{label}</Label>
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
    try {
      await axios.put(`${API}/config`, config, { withCredentials: true });
      toast.success('Configurazione salvata');
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
      `  ADMIN_EMAIL="${config.prod_admin_email || 'admin@example.com'}" \\`,
      `  ADMIN_PASSWORD="${config.prod_admin_password || '<pwd>'}" \\`,
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
    rotate_admin_password: false,
    rotate_superadmin_password: false,
    new_admin_password: '',
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

  if (loading) return <div className="text-center py-12 text-gray-500">Caricamento...</div>;

  if (user?.role !== 'super_admin') {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center" data-testid="settings-forbidden">
        <Lock className="h-10 w-10 mx-auto text-gray-400 mb-3" />
        <h3 className="text-lg font-semibold text-gray-900">Accesso riservato</h3>
        <p className="text-sm text-gray-500 mt-1">Solo il super admin può configurare il deploy.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div className="flex items-start sm:items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            Configurazione Deploy
          </h2>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Solo super admin · Le credenziali sono cifrate in MongoDB
          </p>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-[#F96815] hover:bg-[#e05a0f] text-white"
          data-testid="save-config-button"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Salvataggio...' : 'Salva tutto'}
        </Button>
      </div>

      <Tabs defaultValue="flyio" className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-6 w-full sm:w-auto">
          <TabsTrigger value="flyio" data-testid="tab-flyio">
            <Rocket className="h-4 w-4 mr-1.5" /> Fly.io
          </TabsTrigger>
          <TabsTrigger value="vercel" data-testid="tab-vercel">
            <Globe2 className="h-4 w-4 mr-1.5" /> Vercel
          </TabsTrigger>
          <TabsTrigger value="secrets" data-testid="tab-secrets">
            <KeyRound className="h-4 w-4 mr-1.5" /> Secrets
          </TabsTrigger>
          <TabsTrigger value="monitor" data-testid="tab-monitor">
            <HeartPulse className="h-4 w-4 mr-1.5" /> Monitor
          </TabsTrigger>
          <TabsTrigger value="cloudinary" data-testid="tab-cloudinary">
            <Cloud className="h-4 w-4 mr-1.5" /> Cloudinary
          </TabsTrigger>
          <TabsTrigger value="github" data-testid="tab-github">
            <Github className="h-4 w-4 mr-1.5" /> GitHub
          </TabsTrigger>
        </TabsList>

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
                className="inline-flex items-center text-xs text-[#F96815] hover:underline">
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
                      className="bg-[#F96815] hover:bg-[#e05a0f] text-white"
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
            <p className="text-[11px] text-gray-500">
              Il <strong>primo deploy</strong> dell'immagine deve essere fatto una volta con <code className="bg-gray-100 px-1 rounded">fly deploy</code> (per buildare e pushare su <code className="bg-gray-100 px-1 rounded">registry.fly.io</code>). Dopo, redeploy e secret-apply funzionano da qui.
            </p>

            {flyStatus && (
              <div className="border rounded-lg p-3 bg-gray-50 space-y-2 text-sm" data-testid="fly-status-panel">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="font-semibold">App: <span className="font-mono">{flyStatus.app}</span></span>
                  <Badge variant={flyStatus.deployed ? 'default' : 'secondary'}
                          className={flyStatus.deployed ? 'bg-emerald-600' : ''}>
                    {flyStatus.deployed ? 'deployed' : (flyStatus.app_status || 'unknown')}
                  </Badge>
                </div>
                {flyStatus.release && (
                  <div className="text-xs text-gray-700">
                    <div>Release: <span className="font-mono">v{flyStatus.release.version}</span> — {flyStatus.release.status}</div>
                    <div className="font-mono text-[10px] text-gray-500 break-all">{flyStatus.release.imageRef}</div>
                  </div>
                )}
                <div className="space-y-1">
                  {(flyStatus.machines || []).map(m => (
                    <div key={m.id} className="flex items-center justify-between text-xs border-t pt-1">
                      <span className="font-mono">{m.id} · {m.region}</span>
                      <Badge variant="outline" className={
                        m.state === 'started' ? 'border-emerald-500 text-emerald-700' :
                        m.state === 'stopped' ? 'border-gray-400 text-gray-600' :
                        'border-amber-400 text-amber-700'
                      }>{m.state}</Badge>
                    </div>
                  ))}
                  {(!flyStatus.machines || flyStatus.machines.length === 0) && (
                    <p className="text-xs text-gray-500 italic">Nessuna machine attiva.</p>
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
                className="inline-flex items-center text-xs text-[#F96815] hover:underline">
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
            <p className="text-[11px] text-gray-500">
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

            <div className="grid sm:grid-cols-2 gap-4">
              <TextField id="prod_admin_email" label="ADMIN_EMAIL"
                value={config.prod_admin_email} onChange={update('prod_admin_email')}
                placeholder="admin@example.com"
                testid="prod-admin-email-input" />
              <SecretInput id="prod_admin_password" label="ADMIN_PASSWORD"
                value={config.prod_admin_password} onChange={update('prod_admin_password')}
                placeholder="••••••"
                testid="prod-admin-password-input" />
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
                <p className="text-xs text-gray-500">Nuovo token casuale 64 hex chars. Tutti gli utenti dovranno rifare login.</p>
              </div>
              <Switch checked={rotate.rotate_jwt}
                      onCheckedChange={(v) => setRotate(r => ({ ...r, rotate_jwt: v }))}
                      data-testid="switch-rotate-jwt" />
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Ruota password Org Admin</p>
                  <p className="text-xs text-gray-500">{config.prod_admin_email || 'admin@example.com'}</p>
                </div>
                <Switch checked={rotate.rotate_admin_password}
                        onCheckedChange={(v) => setRotate(r => ({ ...r, rotate_admin_password: v }))}
                        data-testid="switch-rotate-admin" />
              </div>
              {rotate.rotate_admin_password && (
                <Input value={rotate.new_admin_password}
                        onChange={(e) => setRotate(r => ({ ...r, new_admin_password: e.target.value }))}
                        placeholder="Lascia vuoto per generare automaticamente"
                        className="font-mono"
                        data-testid="input-new-admin-pwd" />
              )}
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Ruota password Super Admin</p>
                  <p className="text-xs text-gray-500">{config.prod_superadmin_email || 'superadmin@qrhub.it'}</p>
                </div>
                <Switch checked={rotate.rotate_superadmin_password}
                        onCheckedChange={(v) => setRotate(r => ({ ...r, rotate_superadmin_password: v }))}
                        data-testid="switch-rotate-super" />
              </div>
              {rotate.rotate_superadmin_password && (
                <Input value={rotate.new_superadmin_password}
                        onChange={(e) => setRotate(r => ({ ...r, new_superadmin_password: e.target.value }))}
                        placeholder="Lascia vuoto per generare automaticamente"
                        className="font-mono"
                        data-testid="input-new-super-pwd" />
              )}
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3 bg-amber-50">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-600" />Applica anche su Fly.io</p>
                <p className="text-xs text-gray-600">Richiede Fly Token + Nome App. I secrets vengono inviati a Fly subito.</p>
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
                {rotateResult.new_admin_password && (
                  <div className="text-sm font-mono bg-white border p-2 rounded">
                    <strong>Admin pwd:</strong> {rotateResult.new_admin_password}
                  </div>
                )}
                {rotateResult.new_superadmin_password && (
                  <div className="text-sm font-mono bg-white border p-2 rounded">
                    <strong>Super pwd:</strong> {rotateResult.new_superadmin_password}
                  </div>
                )}
                {rotateResult.fly && (
                  <div className="text-xs text-gray-700">
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
              <p className="text-sm text-gray-500">Caricamento...</p>
            ) : !uptime.has_data ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">{uptime.message}</p>
                <div className="text-xs text-gray-500">
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
                      <span className="text-xs uppercase tracking-wider text-gray-500">Stato</span>
                    </div>
                    <div className={`text-2xl font-bold mt-1 ${
                      uptime.current_status === 'up' ? 'text-emerald-700' : 'text-red-700'
                    }`}>
                      {uptime.current_status === 'up' ? 'Online' : 'Offline'}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      HTTP {uptime.last_check?.status_code || '—'}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-xs uppercase tracking-wider text-gray-500">Uptime 24h</div>
                    <div className="text-2xl font-bold text-gray-900 mt-1">
                      {uptime.uptime_pct_24h}%
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {uptime.total_checks - uptime.down_count}/{uptime.total_checks} check OK
                    </div>
                  </div>

                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-xs uppercase tracking-wider text-gray-500">Latenza media</div>
                    <div className="text-2xl font-bold text-gray-900 mt-1">
                      {uptime.avg_latency_ms}<span className="text-sm text-gray-500 font-normal"> ms</span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      ultimo: {uptime.last_check?.latency_ms || 0} ms
                    </div>
                  </div>

                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-xs uppercase tracking-wider text-gray-500">Downtime</div>
                    <div className="text-2xl font-bold text-gray-900 mt-1">
                      {uptime.down_count}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">incidenti 24h</div>
                  </div>
                </div>

                {/* Chart */}
                <div className="bg-white border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
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
                  <p className="text-[11px] text-gray-500 mt-1">
                    Target: <span className="font-mono">{uptime.target}</span> · intervallo {uptime.interval_sec}s
                  </p>
                </div>

                {/* Recent log */}
                <div className="bg-white border rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b bg-gray-50 text-xs font-semibold text-gray-700">
                    Ultimi 15 check
                  </div>
                  <div className="divide-y max-h-72 overflow-y-auto">
                    {uptime.recent.map((c, i) => (
                      <div key={i} className="px-4 py-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          {c.up
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                            : <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />}
                          <span className="text-gray-700 font-mono truncate">
                            {c.timestamp.slice(11, 19)} UTC
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-gray-600">
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
                <p className="text-xs text-gray-500">Disattiva per fermare il loop background.</p>
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
            <p className="text-[11px] text-gray-500">
              Se compili questo campo, i 3 valori separati qui sotto vengono ignorati. È il modo più semplice e sicuro.
            </p>
            <a href="https://console.cloudinary.com/console/settings/api-keys" target="_blank" rel="noreferrer"
                className="inline-flex items-center text-xs text-[#F96815] hover:underline">
              Apri API Keys Cloudinary <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Section>

          <Section icon={Cloud} title="Cloudinary — Storage media (formato esteso)"
                    desc="In alternativa, compila i 3 valori separati (solo se non usi CLOUDINARY_URL sopra).">
            <TextField id="cloudinary_cloud_name" label="Cloud Name"
              value={config.cloudinary_cloud_name} onChange={update('cloudinary_cloud_name')}
              placeholder="doqp3gr5e" mono
              testid="cloudinary-cloud-name-input" />
            <SecretInput id="cloudinary_api_key" label="API Key"
              value={config.cloudinary_api_key} onChange={update('cloudinary_api_key')}
              placeholder="984179873275136"
              testid="cloudinary-api-key-input" />
            <SecretInput id="cloudinary_api_secret" label="API Secret"
              value={config.cloudinary_api_secret} onChange={update('cloudinary_api_secret')}
              placeholder="••••••"
              testid="cloudinary-api-secret-input" />
          </Section>
        </TabsContent>

        {/* GITHUB */}
        <TabsContent value="github" className="space-y-6 mt-5">
          <Section icon={Github} title="GitHub (opzionale)"
                    desc="Repository sorgente. Utile per CI/CD auto-deploy futuro.">
            <TextField id="github_repo" label="Repository"
              value={config.github_repo} onChange={update('github_repo')}
              placeholder="owner/repo-name" mono
              testid="github-repo-input" />
            <SecretInput id="github_token" label="Personal Access Token"
              value={config.github_token} onChange={update('github_token')}
              placeholder="ghp_xxx..."
              testid="github-token-input"
              hint="https://github.com/settings/tokens" />
          </Section>

          <Section icon={Globe2} title="Aruba DNS — Note operative"
                    desc="Riferimento per i sottodomini gestiti dagli org admin nelle loro Impostazioni Organizzazione."
                    accent="#4A2D8C">
            <TextField id="aruba_dns_zone" label="Zona DNS principale"
              value={config.aruba_dns_zone} onChange={update('aruba_dns_zone')}
              placeholder="tuodominio.it" mono
              testid="aruba-zone-input" />
            <div>
              <Label htmlFor="aruba_notes">Note interne</Label>
              <Textarea id="aruba_notes" rows={3}
                value={config.aruba_notes || ''}
                onChange={(e) => update('aruba_notes')(e.target.value)}
                placeholder="Es. CNAME *.tuodominio.it → cname.vercel-dns.com"
                data-testid="aruba-notes-input" />
            </div>
            <div className="text-xs text-gray-600 bg-purple-50 border-l-2 border-purple-400 p-3 rounded-r">
              I sottodomini per cliente vengono gestiti dagli <strong>org admin</strong> nella loro
              pagina <em>Impostazioni Organizzazione</em> (campo "Domini autorizzati"). Da lì configurano
              il CNAME su Aruba e collegano il dominio a Vercel.
            </div>
          </Section>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-[#F96815] hover:bg-[#e05a0f] text-white"
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
