/**
 * PushAnalytics — compact analytics card for Web Push activity.
 *
 * Drops onto the org admin Overview to show:
 *   - Subscriber breakdown (total / org-wide / vendor-only)
 *   - All-time totals (broadcasts, sent, clicks, CTR)
 *   - Top vendors by subscriber count
 *   - Recent broadcasts table with per-row CTR
 *
 * Self-contained: no props, fetches /api/push/analytics on mount. Hides
 * itself silently when the user has no org context (super admin route).
 */
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Bell, MousePointerClick, Send, Megaphone, Sparkles, Loader2, Users } from 'lucide-react';
import { AnalyticsResetButton } from './AnalyticsResetButton';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Soft date format — "5 nov 14:32". Backend returns ISO so we Date() it.
const fmtTime = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString('it-IT', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
};

const Tile = ({ icon, label, value, accent }) => (
  <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#131316] p-4">
    <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full blur-xl opacity-60 ${accent}`} aria-hidden="true" />
    <div className="relative flex items-center gap-3">
      <div className="p-2.5 rounded-xl bg-gray-100 dark:bg-white/5">{icon}</div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-[#6a6a72]">{label}</p>
        <p className="text-2xl font-black tracking-tighter text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  </div>
);

const OriginBadge = ({ origin }) => {
  // 'auto' = post-triggered, 'manual' = admin broadcast. Two distinct visual
  // chips help admins immediately see which broadcasts they fired vs which
  // ones the system fired as a side-effect of publishing a Post.
  const isAuto = origin === 'auto';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        isAuto
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
      }`}
    >
      {isAuto ? <Sparkles className="h-3 w-3" /> : <Megaphone className="h-3 w-3" />}
      {isAuto ? 'Auto' : 'Manuale'}
    </span>
  );
};

const PushAnalytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    return axios.get(`${API}/push/analytics`, { withCredentials: true })
      .then(({ data }) => { setData(data); setError(false); })
      .catch(() => { setError(true); })
      .finally(() => { setLoading(false); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API}/push/analytics`, { withCredentials: true })
      .then(({ data }) => { if (!cancelled) setData(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#131316] p-6 flex items-center gap-3 text-gray-500" data-testid="push-analytics-loading">
        <Loader2 className="h-4 w-4 animate-spin" /> Caricamento Push Analytics…
      </div>
    );
  }

  // Hide the entire section for super-admins (no org context) or hard errors
  // — analytics is org-scoped by design, no point showing an empty shell.
  if (error || !data) return null;

  const { subscribers, totals, by_vendor, recent_broadcasts } = data;
  const hasAnyActivity = (subscribers.total + totals.broadcasts + totals.sent) > 0;

  return (
    <section
      className="rounded-3xl border border-gray-200 dark:border-white/10 bg-gradient-to-br from-white via-white to-amber-50/40 dark:from-[#131316] dark:via-[#131316] dark:to-[#1a1410] p-5 sm:p-6 space-y-5"
      data-testid="push-analytics-section"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg sm:text-xl font-black tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-600" /> Push Analytics
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-[#8a8a92] mt-0.5">
            Iscritti e performance delle notifiche push inviate ai tuoi vendor.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {!hasAnyActivity && (
            <span className="hidden sm:inline-block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-[#6a6a72] bg-gray-100 dark:bg-white/5 px-2.5 py-1 rounded-full">
              In attesa di dati
            </span>
          )}
          <AnalyticsResetButton
            label="Reset Push Analytics"
            description="Verranno cancellate tutte le notifiche storiche e i contatori (invii, click, CTR). Gli iscritti restano attivi."
            resetEndpoint={`${API}/push/analytics/reset`}
            auditEndpoint={`${API}/push/analytics/audit-log`}
            onReset={fetchData}
            testIdPrefix="push-reset"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          icon={<Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          label="Iscritti totali"
          value={subscribers.total}
          accent="bg-emerald-300/40 dark:bg-emerald-500/15"
        />
        <Tile
          icon={<Send className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
          label="Notifiche inviate"
          value={totals.sent}
          accent="bg-amber-300/40 dark:bg-amber-500/15"
        />
        <Tile
          icon={<MousePointerClick className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
          label="Click totali"
          value={totals.clicks}
          accent="bg-violet-300/40 dark:bg-violet-500/15"
        />
        <Tile
          icon={<Sparkles className="h-4 w-4 text-pink-600 dark:text-pink-400" />}
          label="CTR medio"
          value={`${totals.ctr_pct}%`}
          accent="bg-pink-300/40 dark:bg-pink-500/15"
        />
      </div>

      {(subscribers.org_scope > 0 || subscribers.vendor_scope > 0) && (
        <div className="flex items-center gap-3 text-[12px] text-gray-600 dark:text-[#a8a8b0]" data-testid="push-analytics-sub-breakdown">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Brand-wide: <strong className="text-gray-900 dark:text-white">{subscribers.org_scope}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-300" />
            Per vendor: <strong className="text-gray-900 dark:text-white">{subscribers.vendor_scope}</strong>
          </span>
        </div>
      )}

      {by_vendor && by_vendor.length > 0 && (
        <div data-testid="push-analytics-top-vendors">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-[#6a6a72] mb-2">
            Top vendor per iscritti
          </h4>
          <div className="flex flex-wrap gap-2">
            {by_vendor.map((v) => (
              <div
                key={v.vendor_id}
                className="inline-flex items-center gap-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full px-3 py-1.5 text-[12px]"
              >
                <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[140px]">
                  {v.vendor_name || '—'}
                </span>
                <span className="text-gray-500 dark:text-[#8a8a92]">{v.subscribers}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-[#6a6a72] mb-2">
          Ultime notifiche inviate
        </h4>
        {recent_broadcasts.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-[#6a6a72] py-4 text-center" data-testid="push-analytics-empty">
            Nessuna notifica inviata ancora. Crea un annuncio o usa “Lancia offerta”.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="w-full text-[12px]" data-testid="push-analytics-recent-table">
              <thead>
                <tr className="text-left text-gray-500 dark:text-[#6a6a72]">
                  <th className="px-2 py-1.5 font-semibold">Titolo</th>
                  <th className="px-2 py-1.5 font-semibold hidden sm:table-cell">Vendor</th>
                  <th className="px-2 py-1.5 font-semibold">Tipo</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Inviate</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Click</th>
                  <th className="px-2 py-1.5 font-semibold text-right">CTR</th>
                  <th className="px-2 py-1.5 font-semibold hidden md:table-cell">Quando</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {recent_broadcasts.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-2 py-2 max-w-[200px]">
                      <div className="font-semibold text-gray-900 dark:text-white truncate">{b.title}</div>
                      <div className="text-[11px] text-gray-500 dark:text-[#8a8a92] truncate">{b.body}</div>
                    </td>
                    <td className="px-2 py-2 hidden sm:table-cell text-gray-700 dark:text-[#a8a8b0] truncate max-w-[140px]">
                      {b.vendor_name || (b.vendor_id ? '—' : 'Org-wide')}
                    </td>
                    <td className="px-2 py-2"><OriginBadge origin={b.origin} /></td>
                    <td className="px-2 py-2 text-right font-semibold text-gray-900 dark:text-white">{b.sent}</td>
                    <td className="px-2 py-2 text-right font-semibold text-violet-700 dark:text-violet-300">{b.clicks}</td>
                    <td className="px-2 py-2 text-right font-bold text-pink-700 dark:text-pink-300">{b.ctr_pct}%</td>
                    <td className="px-2 py-2 hidden md:table-cell text-gray-500 dark:text-[#6a6a72] whitespace-nowrap">
                      {fmtTime(b.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default PushAnalytics;
