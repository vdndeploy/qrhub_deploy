import { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Eye, MousePointerClick, Users } from 'lucide-react';
import AnalyticsDetailed from './AnalyticsDetailed';
import DailyCounterCard from '@/components/DailyCounterCard';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Soft palette inspired by modern dashboard frameworks (NextUI / Linear).
// Lime stays the brand accent, paired with a soft purple counterpoint.
const COLORS = {
  views: '#D2FA46',
  clicks: '#9B7BFF',
};

const SoftTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-2xl bg-white dark:bg-[#1a1a1c] border border-gray-200 dark:border-white/10 shadow-xl px-4 py-3 text-xs">
      <div className="font-semibold text-gray-900 dark:text-white mb-1.5">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-gray-700 dark:text-[#a8a8b0]">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="capitalize">{p.dataKey}</span>
          <span className="ml-auto font-semibold text-gray-900 dark:text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const Overview = () => {
  const [stats, setStats] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/analytics/overview`, { withCredentials: true }),
      axios.get(`${API}/vendors`, { withCredentials: true })
    ]).then(([s, v]) => {
      setStats(s.data);
      setVendors(v.data.map(x => ({ id: x.id, name: x.name })));
    }).catch(e => console.error(e)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500 dark:text-[#6a6a72]">Caricamento...</div>;

  const chartData = stats?.vendor_stats?.slice(0, 10).map((v) => ({
    name: v.name, Visite: v.views, Click: v.clicks
  })) || [];

  return (
    <div className="space-y-8" data-testid="overview-page">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Panoramica Globale</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <StatCard
            icon={<Users className="h-6 w-6 text-[#D2FA46]" />}
            ring="from-[#D2FA46]/20 to-[#D2FA46]/0"
            iconBg="bg-[#D2FA46]/15 dark:bg-[#D2FA46]/10"
            label="Venditori"
            value={stats?.total_vendors}
            testid="stat-vendors"
          />
          <StatCard
            icon={<Eye className="h-6 w-6 text-[#9B7BFF]" />}
            ring="from-[#9B7BFF]/20 to-[#9B7BFF]/0"
            iconBg="bg-[#9B7BFF]/15 dark:bg-[#9B7BFF]/10"
            label="Visite Totali"
            value={stats?.total_views}
            testid="stat-views"
          />
          <StatCard
            icon={<MousePointerClick className="h-6 w-6 text-emerald-500" />}
            ring="from-emerald-500/20 to-emerald-500/0"
            iconBg="bg-emerald-500/15 dark:bg-emerald-500/10"
            label="Click Totali"
            value={stats?.total_clicks}
            testid="stat-clicks"
          />
        </div>

        <div className="mt-6">
          <DailyCounterCard />
        </div>

        {chartData.length > 0 && (
          <div className="bg-white dark:bg-[#131316] rounded-3xl border border-gray-200 dark:border-white/10 p-5 sm:p-7 mt-6 shadow-sm" data-testid="analytics-chart">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Performance per Venditore</h3>
              <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-[#8a8a92]">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS.views }} />
                  Visite
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS.clicks }} />
                  Click
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 60 }} barGap={6} barCategoryGap="24%">
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={70}
                  tickFormatter={(v) => (v && v.length > 12 ? v.slice(0, 11) + '…' : v)}
                  className="text-gray-500 dark:text-[#6a6a72]"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  className="text-gray-500 dark:text-[#6a6a72]"
                />
                <Tooltip
                  content={<SoftTooltip />}
                  cursor={{ fill: 'currentColor', fillOpacity: 0.04 }}
                />
                <Bar dataKey="Visite" radius={[10, 10, 10, 10]} maxBarSize={22} animationDuration={250}>
                  {chartData.map((_, i) => (<Cell key={`v-${i}`} fill={COLORS.views} />))}
                </Bar>
                <Bar dataKey="Click" radius={[10, 10, 10, 10]} maxBarSize={22} animationDuration={250}>
                  {chartData.map((_, i) => (<Cell key={`c-${i}`} fill={COLORS.clicks} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-white/10 pt-6">
        <AnalyticsDetailed mode="admin" vendors={vendors} />
      </div>
    </div>
  );
};

const StatCard = ({ icon, ring, iconBg, label, value, testid }) => (
  <div
    className="relative overflow-hidden bg-white dark:bg-[#131316] rounded-3xl border border-gray-200 dark:border-white/10 p-5 shadow-sm transition-shadow hover:shadow-md"
    data-testid={testid}
  >
    {/* Soft glow halo for that gummy "NextUI" look */}
    <div className={`pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full bg-gradient-to-br ${ring} blur-xl`} aria-hidden="true" />
    <div className="relative flex items-center gap-4">
      <div className={`p-3.5 rounded-2xl ${iconBg}`}>{icon}</div>
      <div>
        <p className="text-[11px] font-semibold text-gray-500 dark:text-[#6a6a72] uppercase tracking-widest">{label}</p>
        <p className="text-3xl font-black tracking-tighter text-gray-900 dark:text-white">{value || 0}</p>
      </div>
    </div>
  </div>
);

export default Overview;
