import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Eye, MousePointerClick, Smartphone, MapPin, Download, Filter } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CLICK_LABELS = {
  whatsapp_click: 'WhatsApp', instagram_click: 'Instagram', facebook_click: 'Facebook',
  review_click: 'Recensione Google', tiktok_click: 'TikTok', maps_click: 'Google Maps', post_cta_click: 'CTA Post'
};
const CLICK_COLORS = ['#25D366', '#E1306C', '#1877F2', '#FBBC04', '#000000', '#D2FA46', '#4A2D8C'];

const PERIOD_LABELS = { '7d': 'Ultimi 7 giorni', '30d': 'Ultimi 30 giorni', month: 'Mese corrente' };

/**
 * Detailed analytics view used by both admin overview and vendor dashboard.
 * Props:
 *  - mode: 'admin' | 'vendor'
 *  - vendors: list of {id,name} for admin filter (admin mode only)
 *  - defaultVendorId: optional preselected vendor (admin mode)
 */
export default function AnalyticsDetailed({ mode = 'admin', vendors = [], defaultVendorId = '' }) {
  const [period, setPeriod] = useState('30d');
  const [vendorId, setVendorId] = useState(defaultVendorId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const endpoint = mode === 'vendor' ? '/vendor/analytics/detailed' : '/analytics/detailed';
  const pdfEndpoint = mode === 'vendor' ? '/vendor/analytics/export/pdf' : '/analytics/export/pdf';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period };
      if (mode === 'admin' && vendorId) params.vendor_id = vendorId;
      const { data } = await axios.get(`${API}${endpoint}`, { params, withCredentials: true });
      setData(data);
    } catch (e) {
      toast.error('Errore caricamento analytics');
    } finally {
      setLoading(false);
    }
  }, [period, vendorId, mode, endpoint]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const params = { period };
      if (mode === 'admin' && vendorId) params.vendor_id = vendorId;
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

  if (loading && !data) return <div className="text-center py-12">Caricamento...</div>;
  if (!data) return null;

  const clickPie = Object.entries(data.click_breakdown || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: CLICK_LABELS[k] || k, value: v }));

  const devicePie = Object.entries(data.device_breakdown || {})
    .map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: v }));

  const hourly = (data.hourly_pattern || []).map((v, i) => ({ ora: `${i}h`, eventi: v }));

  return (
    <div className="space-y-6" data-testid="analytics-detailed">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Analytics Dettagliata</h2>
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
          <Button onClick={downloadPdf} disabled={downloading} className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b] w-full sm:w-auto" data-testid="download-pdf-button">
            <Download className="h-4 w-4 mr-2" />{downloading ? 'Generazione...' : 'Esporta PDF'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Eye className="h-5 w-5 text-[#4A2D8C]" />} bg="bg-purple-100" label="Visite" value={data.total_views} />
        <KpiCard icon={<MousePointerClick className="h-5 w-5 text-[#D2FA46]" />} bg="bg-[#D2FA46]/15 dark:bg-[#D2FA46]/10" label="Click Totali" value={data.total_clicks} />
        <KpiCard icon={<Smartphone className="h-5 w-5 text-green-600" />} bg="bg-green-100" label="Eventi" value={data.total_events} />
        <KpiCard icon={<MapPin className="h-5 w-5 text-blue-600" />} bg="bg-blue-100" label="Città Uniche" value={(data.top_cities || []).length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Andamento Giornaliero">
          {data.timeline?.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="views" name="Visite" stroke="#4A2D8C" strokeWidth={2} />
                <Line type="monotone" dataKey="clicks" name="Click" stroke="#D2FA46" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card title="Distribuzione Click per Canale">
          {clickPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={clickPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {clickPie.map((_, i) => <Cell key={i} fill={CLICK_COLORS[i % CLICK_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card title="Pattern Orario (24h)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={hourly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ora" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="eventi" fill="#D2FA46" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Dispositivi">
          {devicePie.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={devicePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {devicePie.map((_, i) => <Cell key={i} fill={['#4A2D8C','#D2FA46','#25D366','#999'][i % 4]} />)}
                </Pie>
                <Tooltip />
                <Legend />
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

      <Card title={`Log Eventi Recenti (${(data.event_log || []).length})`}>
        {data.event_log?.length > 0 ? (
          <div className="overflow-x-auto">
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
                    <TableCell className="text-xs whitespace-nowrap">{(e.timestamp || '').slice(0, 16).replace('T', ' ')}</TableCell>
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
        ) : <Empty />}
      </Card>
    </div>
  );
}

const KpiCard = ({ icon, bg, label, value }) => (
  <div className="bg-white dark:bg-[#131316] rounded-lg border border-gray-200 dark:border-white/10 p-5">
    <div className="flex items-center gap-3">
      <div className={`p-2.5 rounded-lg ${bg}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-600 dark:text-[#8a8a92] uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black tracking-tight">{value || 0}</p>
      </div>
    </div>
  </div>
);

const Card = ({ title, children }) => (
  <div className="bg-white dark:bg-[#131316] rounded-lg border border-gray-200 dark:border-white/10 p-5">
    <h3 className="text-base font-semibold mb-3 text-gray-900 dark:text-white">{title}</h3>
    {children}
  </div>
);

const Empty = () => <div className="text-center py-8 text-sm text-gray-500 dark:text-[#6a6a72]">Nessun dato disponibile</div>;
