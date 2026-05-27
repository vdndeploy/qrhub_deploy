import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import { QrCode, MessageCircle, Store as StoreIcon, TrendingUp } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const COLORS = { scans: '#D2FA46', whatsapp: '#25D366' };
const PERIODS = [
  { value: 1,  label: 'Oggi' },
  { value: 7,  label: '7 giorni' },
  { value: 30, label: '30 giorni' },
  { value: 90, label: '90 giorni' },
];

const SoftTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl bg-white dark:bg-[#1a1a1c] border border-gray-200 dark:border-white/10 shadow-xl px-3 py-2 text-xs">
      <div className="font-semibold text-gray-900 dark:text-white mb-1.5">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-gray-700 dark:text-[#a8a8b0]">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span>{p.dataKey === 'scans' ? 'Scansioni QR' : 'WhatsApp'}</span>
          <span className="ml-auto font-semibold text-gray-900 dark:text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// "2026-05-27" → "27 mag" (italian short)
const MONTHS_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const fmtShort = (iso) => {
  const [, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${MONTHS_IT[parseInt(m, 10) - 1] || ''}`;
};

const DailyCounterCard = () => {
  const [days, setDays] = useState(7);
  const [storeId, setStoreId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days) });
    if (storeId) params.set('store_id', storeId);
    axios
      .get(`${API}/analytics/daily-counter?${params.toString()}`, { withCredentials: true })
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days, storeId]);

  const chartData = useMemo(
    () => (data?.series || []).map((r) => ({ ...r, label: fmtShort(r.date) })),
    [data]
  );
  const totals = data?.totals || { scans: 0, whatsapp: 0, conversion_pct: 0 };
  const stores = data?.stores || [];

  return (
    <div
      className="bg-white dark:bg-[#131316] rounded-3xl border border-gray-200 dark:border-white/10 p-5 sm:p-7 shadow-sm"
      data-testid="daily-counter-card"
    >
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-[#D2FA46]/15">
              <TrendingUp className="h-4 w-4 text-[#D2FA46]" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Conta persone — Scansioni QR & WhatsApp
            </h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-[#8a8a92] ml-9">
            Ogni scansione del QR = ingresso/interazione · ogni click WhatsApp = conversazione avviata
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {stores.length > 0 && (
            <div className="relative">
              <StoreIcon className="h-4 w-4 text-gray-500 dark:text-[#8a8a92] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                data-testid="daily-counter-store-select"
                className="pl-8 pr-3 py-1.5 text-sm rounded-full border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1a1a1c] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D2FA46]/40"
              >
                <option value="">Tutti i negozi</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="inline-flex items-center bg-gray-100 dark:bg-[#1a1a1c] rounded-full p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                data-testid={`daily-counter-period-${p.value}`}
                className={`px-3 py-1 text-xs font-medium rounded-full transition ${
                  days === p.value
                    ? 'bg-white dark:bg-[#0a0a0b] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-[#8a8a92] hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <MiniStat
          color="#D2FA46"
          icon={<QrCode className="h-5 w-5" />}
          label="Scansioni QR"
          value={totals.scans}
          testid="daily-counter-total-scans"
        />
        <MiniStat
          color="#25D366"
          icon={<MessageCircle className="h-5 w-5" />}
          label="Click WhatsApp"
          value={totals.whatsapp}
          testid="daily-counter-total-whatsapp"
        />
        <MiniStat
          color="#9B7BFF"
          icon={<TrendingUp className="h-5 w-5" />}
          label="Conversion rate"
          value={`${totals.conversion_pct}%`}
          subtitle="WhatsApp / Scansioni"
          testid="daily-counter-conversion"
        />
      </div>

      {loading ? (
        <div className="h-[280px] flex items-center justify-center text-sm text-gray-500 dark:text-[#6a6a72]">
          Caricamento…
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-sm text-gray-500 dark:text-[#6a6a72]">
          Nessun dato per il periodo selezionato.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -16, bottom: 8 }}
            barGap={4}
            barCategoryGap={days > 14 ? '12%' : '22%'}
          >
            <CartesianGrid stroke="currentColor" strokeOpacity={0.06} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'currentColor' }}
              tickLine={false}
              axisLine={false}
              interval={days > 30 ? 'preserveStartEnd' : 0}
              className="text-gray-500 dark:text-[#6a6a72]"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'currentColor' }}
              tickLine={false}
              axisLine={false}
              width={32}
              allowDecimals={false}
              className="text-gray-500 dark:text-[#6a6a72]"
            />
            <Tooltip content={<SoftTooltip />} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(v) => (v === 'scans' ? 'Scansioni QR' : 'WhatsApp')}
            />
            <Bar dataKey="scans" fill={COLORS.scans} radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={250} />
            <Bar dataKey="whatsapp" fill={COLORS.whatsapp} radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={250} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

const MiniStat = ({ color, icon, label, value, subtitle, testid }) => (
  <div
    className="flex items-center gap-3 p-3 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50/60 dark:bg-[#0f0f12]"
    data-testid={testid}
  >
    <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: `${color}1f`, color }}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-[#6a6a72]">{label}</p>
      <p className="text-2xl font-black tracking-tighter text-gray-900 dark:text-white leading-tight">{value}</p>
      {subtitle && <p className="text-[10px] text-gray-400 dark:text-[#5a5a62] mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

export default DailyCounterCard;
