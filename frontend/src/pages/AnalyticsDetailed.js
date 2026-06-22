import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Eye, MousePointerClick, Smartphone, MapPin, Download, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CLICK_LABELS = {
  whatsapp_click: 'WhatsApp',
  instagram_click: 'Instagram',
  facebook_click: 'Facebook',
  review_click: 'Recensione Google',
  tiktok_click: 'TikTok',
  maps_click: 'Google Maps',
  post_cta_click: 'CTA Annunci',
  appointment_click: 'Prenota appuntamento',
  pwa_install: 'Installa app (PWA)',
};
// Brand-true tints per channel — used by the bar chart so the admin can
// scan the chart and instantly map color → action.
const CLICK_COLORS = {
  whatsapp_click:    '#25D366',
  instagram_click:   '#E1306C',
  facebook_click:    '#1877F2',
  review_click:      '#FBBC04',
  tiktok_click:      '#000000',
  maps_click:        '#34A853',
  post_cta_click:    '#9B7BFF',
  appointment_click: '#0EA5E9',
  pwa_install:       '#D2FA46',
};
// Display order — keeps the bar chart predictable regardless of API order.
const CLICK_ORDER = [
  'whatsapp_click', 'review_click', 'appointment_click',
  'maps_click', 'post_cta_click',
  'instagram_click', 'facebook_click', 'tiktok_click',
  'pwa_install',
];
// Soft palette matching the Overview chart aesthetic.
const PALETTE = ['#D2FA46', '#9B7BFF', '#5DD4A0', '#FFB86B', '#FF7A8A', '#6EC1E4', '#C58FFF'];

const PERIOD_LABELS = {
  today: 'Oggi',
  yesterday: 'Ieri',
  '7d': 'Ultimi 7 giorni',
  '30d': 'Ultimi 30 giorni',
  month: 'Mese corrente',
};

// Convert a UTC ISO timestamp from the backend into a human-readable local
// time string in Europe/Rome. The event log was previously cutting the raw
// ISO with `.slice(0, 16)` which kept the UTC hour — making a 13:39 italian
// scan appear as 11:39 to the admin.
const formatLocalTimestamp = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ');
    return d.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
};

// Shared soft tooltip used by every chart in this page — keeps the look consistent
// with the Panoramica Globale dashboard.
const SoftTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-2xl bg-white dark:bg-[#1a1a1c] border border-gray-200 dark:border-white/10 shadow-xl px-4 py-3 text-xs">
      {label && <div className="font-semibold text-gray-900 dark:text-white mb-1.5">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-gray-700 dark:text-[#a8a8b0]">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto font-semibold text-gray-900 dark:text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Detailed analytics view used by both admin overview and vendor dashboard.
 * Props:
 *  - mode: 'admin' | 'vendor'
 *  - vendors: list of {id,name} for admin filter (admin mode only)
 *  - defaultVendorId: optional preselected vendor (admin mode)
 *  - targetVendorId: vendor-mode only — when set, scope analytics queries
 *    to that vendor (used by Store Manager dashboard to view teammate stats).
 */
export default function AnalyticsDetailed({ mode = 'admin', vendors = [], defaultVendorId = '', targetVendorId = '' }) {
  const [period, setPeriod] = useState('30d');
  const [vendorId, setVendorId] = useState(defaultVendorId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  // Lead-gen landing analytics — admin only. Vendor mode never sees this
  // because landings are per-STORE, not per-vendor.
  const [landingsData, setLandingsData] = useState(null);

  const endpoint = mode === 'vendor' ? '/vendor/analytics/detailed' : '/analytics/detailed';
  const pdfEndpoint = mode === 'vendor' ? '/vendor/analytics/export/pdf' : '/analytics/export/pdf';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period };
      if (mode === 'admin' && vendorId) params.vendor_id = vendorId;
      if (mode === 'vendor' && targetVendorId) params.vendor_id = targetVendorId;
      const { data } = await axios.get(`${API}${endpoint}`, { params, withCredentials: true });
      setData(data);
    } catch (e) {
      toast.error('Errore caricamento analytics');
    } finally {
      setLoading(false);
    }
    if (mode === 'admin') {
      try {
        const { data: ld } = await axios.get(`${API}/analytics/store-landings`, {
          params: { period }, withCredentials: true,
        });
        setLandingsData(ld);
      } catch { /* non-blocking — sezione opzionale */ }
    }
  }, [period, vendorId, mode, endpoint, targetVendorId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const params = { period };
      if (mode === 'admin' && vendorId) params.vendor_id = vendorId;
      if (mode === 'vendor' && targetVendorId) params.vendor_id = targetVendorId;
      const res = await axios.get(`${API}${pdfEndpoint}`, { params, withCredentials: true, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics_${period}_${new Date().toISOString().slice(0,10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF scaricato');
    } catch (e) {
      toast.error('Errore download PDF');
    } finally {
      setDownloading(false);
    }
  };

  if (loading && !data) return <div className="text-center py-12 text-gray-500 dark:text-[#6a6a72]">Caricamento...</div>;
  if (!data) return null;

  // Sorted breakdown for the new "by-channel" view: always include every
  // known channel (even zero) so the admin can see at a glance what's
  // converting and what is dead. Sorted by descending count.
  const clickByChannel = CLICK_ORDER.map((k) => ({
    key: k,
    label: CLICK_LABELS[k] || k,
    color: CLICK_COLORS[k] || '#9B7BFF',
    value: (data.click_breakdown || {})[k] || 0,
  })).sort((a, b) => b.value - a.value);
  const clickByChannelTotal = clickByChannel.reduce((s, r) => s + r.value, 0);

  const devicePie = Object.entries(data.device_breakdown || {})
    .map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: v }));

  const hourly = (data.hourly_pattern || []).map((v, i) => ({ ora: `${i}h`, eventi: v }));
  const eventLogCount = (data.event_log || []).length;

  return (
    <div className="space-y-6" data-testid="analytics-detailed">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Analytics Dettagliata</h2>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-gray-500 dark:text-[#6a6a72] flex-shrink-0 hidden sm:block" />
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="period-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PERIOD_LABELS).map(([k, lbl]) => (
                <SelectItem key={k} value={k}>{lbl}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mode === 'admin' && vendors.length > 0 && (
            <Select value={vendorId || 'all'} onValueChange={(v) => setVendorId(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="vendor-filter-select"><SelectValue placeholder="Tutti i venditori" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i venditori</SelectItem>
                {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button onClick={downloadPdf} disabled={downloading} className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b] w-full sm:w-auto rounded-full" data-testid="download-pdf-button">
            <Download className="h-4 w-4 mr-2" />{downloading ? 'Generazione...' : 'Esporta PDF'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Eye className="h-5 w-5 text-[#9B7BFF]" />} ring="from-[#9B7BFF]/20 to-[#9B7BFF]/0" iconBg="bg-[#9B7BFF]/15 dark:bg-[#9B7BFF]/10" label="Visite" value={data.total_views} />
        <KpiCard icon={<MousePointerClick className="h-5 w-5 text-[#D2FA46]" />} ring="from-[#D2FA46]/20 to-[#D2FA46]/0" iconBg="bg-[#D2FA46]/15 dark:bg-[#D2FA46]/10" label="Click Totali" value={data.total_clicks} />
        <KpiCard icon={<Smartphone className="h-5 w-5 text-emerald-500" />} ring="from-emerald-500/20 to-emerald-500/0" iconBg="bg-emerald-500/15 dark:bg-emerald-500/10" label="Eventi" value={data.total_events} />
        <KpiCard icon={<MapPin className="h-5 w-5 text-sky-500" />} ring="from-sky-500/20 to-sky-500/0" iconBg="bg-sky-500/15 dark:bg-sky-500/10" label="Città Uniche" value={(data.top_cities || []).length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Andamento Giornaliero">
          {data.timeline?.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.timeline} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} className="text-gray-500 dark:text-[#6a6a72]" />
                <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} width={32} className="text-gray-500 dark:text-[#6a6a72]" />
                <Tooltip content={<SoftTooltip />} cursor={{ stroke: 'currentColor', strokeOpacity: 0.1 }} />
                <Line type="monotone" dataKey="views" name="Visite" stroke="#9B7BFF" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#9B7BFF' }} />
                <Line type="monotone" dataKey="clicks" name="Click" stroke="#D2FA46" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#D2FA46' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card title="Distribuzione Click per Canale">
          {clickByChannelTotal > 0 ? (
            <div className="space-y-2.5" data-testid="click-by-channel-list">
              {clickByChannel.map((row) => {
                const pct = clickByChannelTotal > 0
                  ? Math.round((row.value / clickByChannelTotal) * 100)
                  : 0;
                return (
                  <div key={row.key} className="flex items-center gap-3" data-testid={`click-channel-${row.key}`}>
                    <span
                      className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: row.color }}
                      aria-hidden="true"
                    />
                    <span className="text-sm text-gray-700 dark:text-[#a8a8b0] w-44 sm:w-48 flex-shrink-0 truncate">
                      {row.label}
                    </span>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(pct, row.value > 0 ? 4 : 0)}%`,
                          background: row.color,
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums w-10 text-right">
                      {row.value}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-[#6a6a72] tabular-nums w-9 text-right">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : <Empty />}
        </Card>

        <Card title="Pattern Orario (24h)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={hourly} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barGap={4}>
              <XAxis dataKey="ora" tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} interval={2} className="text-gray-500 dark:text-[#6a6a72]" />
              <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} width={32} className="text-gray-500 dark:text-[#6a6a72]" />
              <Tooltip content={<SoftTooltip />} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
              <Bar dataKey="eventi" fill="#D2FA46" radius={[8, 8, 8, 8]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Dispositivi">
          {devicePie.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={devicePie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={92} paddingAngle={3}>
                  {devicePie.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />)}
                </Pie>
                <Tooltip content={<SoftTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>
      </div>

      <Card title="Top Città (geolocalizzazione approssimativa)">
        {data.top_cities?.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead><TableHead>Città</TableHead><TableHead className="text-right">Eventi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.top_cities.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="text-gray-500 dark:text-[#6a6a72]">{i+1}</TableCell>
                  <TableCell className="font-medium">{c.city}</TableCell>
                  <TableCell className="text-right font-semibold">{c.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <Empty />}
      </Card>

      {/* Event log: collapsed by default — it can grow very long and made the
          page feel sluggish. Click to reveal. */}
      <div className="relative overflow-hidden bg-white dark:bg-[#131316] rounded-3xl border border-gray-200 dark:border-white/10 shadow-sm">
        <Collapsible open={logOpen} onOpenChange={setLogOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
              data-testid="event-log-toggle"
            >
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Log Eventi Recenti <span className="text-gray-500 dark:text-[#6a6a72] font-medium">({eventLogCount})</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-[#6a6a72] mt-0.5">
                  {logOpen ? 'Clicca per nascondere' : 'Clicca per visualizzare gli ultimi eventi raccolti'}
                </p>
              </div>
              {logOpen ? <ChevronUp className="h-5 w-5 text-gray-400 dark:text-[#5a5a62]" /> : <ChevronDown className="h-5 w-5 text-gray-400 dark:text-[#5a5a62]" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-gray-200 dark:border-white/10">
              {eventLogCount > 0 ? (
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data/Ora</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Città</TableHead>
                        <TableHead>Paese</TableHead>
                        <TableHead>Dispositivo</TableHead>
                        <TableHead>Browser</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.event_log.slice(0, 100).map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs whitespace-nowrap">{formatLocalTimestamp(e.timestamp)}</TableCell>
                          <TableCell className="text-xs">{CLICK_LABELS[e.event_type] || (e.event_type === 'page_view' ? 'Visita Pagina' : e.event_type)}</TableCell>
                          <TableCell className="text-xs">{e.city || '-'}</TableCell>
                          <TableCell className="text-xs">{e.country || '-'}</TableCell>
                          <TableCell className="text-xs capitalize">{e.device || '-'}</TableCell>
                          <TableCell className="text-xs">{e.browser || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="px-5 py-10"><Empty /></div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* ── Lead-gen Landing Negozi — only renders for admin AND if at least
            one store has activated the public landing page. */}
        {mode === 'admin' && landingsData && landingsData.totals.views > 0 && (
          <StoreLandingsSection data={landingsData} />
        )}
      </div>
    </div>
  );
}

// ── Lead-gen funnel section for /s/:slug landing pages ────────────────────
const StoreLandingsSection = ({ data }) => {
  const t = data.totals;
  // 4-stage funnel: Atterraggi → Engaged (any non-bounce) → CTA click → Form view
  const engaged = Math.max(0, t.views - t.bounces);
  const ctaTotal = t.cta_clicks + t.form_views;
  const funnel = [
    { label: 'Atterraggi',          value: t.views,    color: '#9B7BFF' },
    { label: 'Visitatori coinvolti', value: engaged,    color: '#6EC1E4' },
    { label: 'Click CTA',            value: ctaTotal,   color: '#D2FA46' },
    { label: 'Form WINDTRE visti',   value: t.form_views, color: '#5DD4A0' },
  ];
  const max = funnel[0].value || 1;
  return (
    <div className="space-y-4" data-testid="landings-analytics-section">
      <div className="flex items-center gap-2 pt-2">
        <span className="inline-block w-2 h-6 rounded-full bg-emerald-500" />
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Landing Negozi — Funnel lead-gen
        </h3>
        <span className="text-[10px] uppercase tracking-widest font-semibold text-emerald-600 ml-1">NEW</span>
      </div>

      {/* KPI cards specifico landing */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <LandingKpi label="Atterraggi" value={t.views} sub="Visite uniche/90min" />
        <LandingKpi label="Conversion Rate" value={`${t.conversion_rate}%`} tone="emerald" sub="Click CTA / Atterraggi" />
        <LandingKpi label="Click CTA" value={t.cta_clicks + t.form_views} sub={`${t.cta_clicks} WA + ${t.form_views} Form`} />
        <LandingKpi label="Bounce Rate" value={`${t.bounce_rate}%`} tone={t.bounce_rate > 60 ? 'red' : 'amber'} sub="Chiusura < 10s" />
      </div>

      {/* Funnel visualization */}
      <Card title="Funnel di conversione">
        <div className="space-y-2.5">
          {funnel.map((row) => {
            const pct = Math.round((row.value / max) * 100);
            const fromTopPct = funnel[0].value > 0
              ? Math.round((row.value / funnel[0].value) * 100) : 0;
            return (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 dark:text-[#a8a8b0] w-44 sm:w-52 flex-shrink-0">
                  {row.label}
                </span>
                <div className="flex-1 h-3 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(pct, row.value > 0 ? 4 : 0)}%`, background: row.color }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums w-12 text-right">
                  {row.value}
                </span>
                <span className="text-[10px] text-gray-400 tabular-nums w-9 text-right">
                  {fromTopPct}%
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Per-store performance table */}
      <Card title="Performance per Negozio">
        <div className="overflow-x-auto -mx-5 sm:mx-0 px-5 sm:px-0">
          <table className="w-full text-sm" data-testid="landings-store-table">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 dark:text-[#6a6a72] border-b border-gray-100 dark:border-white/5">
                <th className="py-2 pr-3 font-semibold">Negozio</th>
                <th className="py-2 px-2 font-semibold text-right">Visite</th>
                <th className="py-2 px-2 font-semibold text-right">CTA</th>
                <th className="py-2 px-2 font-semibold text-right">CR%</th>
                <th className="py-2 px-2 font-semibold text-right">Bounce%</th>
                <th className="py-2 pl-2 font-semibold hidden sm:table-cell"></th>
              </tr>
            </thead>
            <tbody>
              {data.by_store.filter(s => s.enabled || s.views > 0).map((s) => (
                <tr key={s.id} className="border-b border-gray-50 dark:border-white/[0.04]" data-testid={`landings-row-${s.id}`}>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{s.name}</span>
                      <span className="text-[10px] text-gray-400">/s/{s.slug}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{s.views}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{s.cta_clicks + s.form_views}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                      s.conversion_rate >= 5 ? 'bg-emerald-100 text-emerald-700' :
                      s.conversion_rate > 0 ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {s.conversion_rate}%
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-gray-500">{s.bounce_rate}%</td>
                  <td className="py-2.5 pl-2 hidden sm:table-cell">
                    {s.slug && (
                      <a href={`/s/${s.slug}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-[#D2FA46] hover:underline">Apri ↗</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const LandingKpi = ({ label, value, sub, tone = 'gray' }) => {
  const toneCls = {
    gray: 'text-gray-900 dark:text-white',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
  }[tone] || 'text-gray-900 dark:text-white';
  return (
    <div className="bg-white dark:bg-[#131316] rounded-2xl border border-gray-200 dark:border-white/10 p-4">
      <p className="text-[10px] text-gray-500 dark:text-[#6a6a72] uppercase tracking-widest font-semibold">{label}</p>
      <p className={`text-2xl font-black tracking-tight ${toneCls} mt-1`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 dark:text-[#6a6a72] mt-0.5 truncate">{sub}</p>}
    </div>
  );
};

const KpiCard = ({ icon, ring, iconBg, label, value }) => (
  <div className="relative overflow-hidden bg-white dark:bg-[#131316] rounded-3xl border border-gray-200 dark:border-white/10 p-5 shadow-sm transition-shadow hover:shadow-md">
    <div className={`pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br ${ring} blur-xl`} aria-hidden="true" />
    <div className="relative flex items-center gap-3">
      <div className={`p-2.5 rounded-2xl ${iconBg}`}>{icon}</div>
      <div>
        <p className="text-[11px] text-gray-500 dark:text-[#6a6a72] uppercase tracking-widest font-semibold">{label}</p>
        <p className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">{value || 0}</p>
      </div>
    </div>
  </div>
);

const Card = ({ title, children }) => (
  <div className="bg-white dark:bg-[#131316] rounded-3xl border border-gray-200 dark:border-white/10 p-5 sm:p-6 shadow-sm">
    <h3 className="text-base font-semibold mb-4 text-gray-900 dark:text-white">{title}</h3>
    {children}
  </div>
);

const Empty = () => <div className="text-center py-8 text-sm text-gray-500 dark:text-[#6a6a72]">Nessun dato disponibile</div>;
