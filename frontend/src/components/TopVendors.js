/**
 * TopVendors — leaderboard of best-performing vendors by QR scans.
 *
 * Drops onto the org admin Overview alongside PushAnalytics. Lets the
 * admin filter by period (oggi / ieri / 7d / 30d / mese) and instantly
 * see who's pulling the most QR scans, plus their WhatsApp click count
 * and CTR for context.
 *
 * Self-contained: no props, fetches /api/analytics/top-vendors on mount
 * and on every period change. Hides itself silently when there is no
 * org context (super admin route).
 */
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Trophy, QrCode, MessageCircle, Loader2, User } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PERIODS = [
  { id: 'today', label: 'Oggi' },
  { id: 'yesterday', label: 'Ieri' },
  { id: '7d', label: '7 giorni' },
  { id: '30d', label: '30 giorni' },
  { id: 'month', label: 'Mese' },
];

// Rank badge — gold/silver/bronze for top 3, neutral for the rest. Pure
// visual hierarchy, no medals (intentional: keeps the dashboard pro-grade).
const rankStyle = (i) => {
  if (i === 0) return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300';
  if (i === 1) return 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200';
  if (i === 2) return 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300';
  return 'bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-[#8a8a92]';
};

const TopVendors = () => {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const { data: d } = await axios.get(
        `${API}/analytics/top-vendors?period=${p}&limit=10`,
        { withCredentials: true }
      );
      setData(d); setError(false);
    } catch {
      setError(true); setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [load, period]);

  if (error || !data) return null; // hide silently on super admin / errors

  const items = data.items || [];
  const totalScans = items.reduce((s, x) => s + (x.scans || 0), 0);

  return (
    <section
      className="rounded-3xl border border-gray-200 dark:border-white/10 bg-gradient-to-br from-white via-white to-emerald-50/40 dark:from-[#131316] dark:via-[#131316] dark:to-[#0e1813] p-5 sm:p-6 space-y-4"
      data-testid="top-vendors-section"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg sm:text-xl font-black tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" /> Migliori venditori per QR
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-[#8a8a92] mt-0.5">
            Classifica per scansioni del QR nel periodo selezionato.
          </p>
        </div>
        {/* Period filter — pill toggle, mirrors the rest of the dashboard. */}
        <div className="inline-flex rounded-full bg-gray-100 dark:bg-white/5 p-1" data-testid="top-vendors-period-filter">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1 text-[11px] font-semibold rounded-full transition-colors ${
                period === p.id
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'text-gray-600 dark:text-[#a8a8b0] hover:text-gray-900'
              }`}
              data-testid={`top-vendors-period-${p.id}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
        </div>
      ) : items.length === 0 ? (
        <p
          className="text-xs text-gray-400 dark:text-[#6a6a72] py-6 text-center italic"
          data-testid="top-vendors-empty"
        >
          Nessuna attività nel periodo selezionato.
        </p>
      ) : (
        <>
          <div className="text-[11px] text-gray-500 dark:text-[#8a8a92] mb-1">
            <strong className="text-gray-900 dark:text-white">{totalScans}</strong> scansioni totali ({items.length} venditori attivi)
          </div>
          <div className="space-y-2" data-testid="top-vendors-list">
            {items.map((v, i) => (
              <div
                key={v.vendor_id}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-white/5 bg-white dark:bg-[#0a0a0b] hover:border-gray-300 dark:hover:border-white/20 transition-colors"
                data-testid={`top-vendors-row-${v.vendor_id}`}
              >
                <div
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-[11px] font-bold ${rankStyle(i)}`}
                  aria-label={`Posizione ${i + 1}`}
                >
                  {i + 1}
                </div>
                {v.profile_image_url ? (
                  <img
                    src={v.profile_image_url}
                    alt={v.vendor_name}
                    className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-white/10"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400">
                    <User className="h-4 w-4" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[13px] text-gray-900 dark:text-white truncate">
                    {v.vendor_name || '—'}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-[#8a8a92]">
                    CTR {v.ctr_pct}%
                  </p>
                </div>
                <div className="text-right flex items-center gap-4">
                  <div className="flex items-center gap-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300" title="Scansioni QR">
                    <QrCode className="h-3.5 w-3.5" /> {v.scans}
                  </div>
                  <div className="flex items-center gap-1 text-[12px] font-semibold text-violet-700 dark:text-violet-300" title="WhatsApp click">
                    <MessageCircle className="h-3.5 w-3.5" /> {v.whatsapp_clicks}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default TopVendors;
