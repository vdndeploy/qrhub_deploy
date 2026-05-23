import { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Eye, MousePointerClick, Users } from 'lucide-react';
import AnalyticsDetailed from './AnalyticsDetailed';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

  if (loading) return <div className="text-center py-12">Caricamento...</div>;

  const chartData = stats?.vendor_stats?.slice(0, 10).map((v) => ({
    name: v.name, Visite: v.views, Click: v.clicks
  })) || [];

  return (
    <div className="space-y-8" data-testid="overview-page">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Panoramica Globale</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <StatCard icon={<Users className="h-6 w-6 text-[#D2FA46]" />} bg="bg-[#D2FA46]/10" label="Venditori" value={stats?.total_vendors} testid="stat-vendors" />
          <StatCard icon={<Eye className="h-6 w-6 text-[#4A2D8C]" />} bg="bg-purple-100" label="Visite Totali" value={stats?.total_views} testid="stat-views" />
          <StatCard icon={<MousePointerClick className="h-6 w-6 text-green-600" />} bg="bg-green-100" label="Click Totali" value={stats?.total_clicks} testid="stat-clicks" />
        </div>

        {chartData.length > 0 && (
          <div className="bg-[#131316] rounded-lg border border-white/10 p-6 mt-6" data-testid="analytics-chart">
            <h3 className="text-xl font-semibold mb-6 text-white">Performance per Venditore</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="Visite" fill="#D2FA46" />
                <Bar dataKey="Click" fill="#4A2D8C" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 pt-6">
        <AnalyticsDetailed mode="admin" vendors={vendors} />
      </div>
    </div>
  );
};

const StatCard = ({ icon, bg, label, value, testid }) => (
  <div className="bg-[#131316] rounded-lg border border-white/10 p-6" data-testid={testid}>
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-lg ${bg}`}>{icon}</div>
      <div>
        <p className="text-sm text-[#8a8a92] uppercase tracking-widest">{label}</p>
        <p className="text-3xl font-black tracking-tighter">{value || 0}</p>
      </div>
    </div>
  </div>
);

export default Overview;
