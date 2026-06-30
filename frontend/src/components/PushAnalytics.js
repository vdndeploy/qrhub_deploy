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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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

const PERIOD_OPTIONS = [
  { value: 'today',     label: 'Oggi' },
  { value: 'yesterday', label: 'Ieri' },
  { value: '7d',        label: 'Ultimi 7 giorni' },
  { value: '30d',       label: 'Ultimi 30 giorni' },
  { value: 'month',     label: 'Mese corrente' },
  { value: 'all',       label: 'Sempre' },
];

const PushAnalytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Default 'all' keeps the existing behaviour for first-time visitors:
  // total counters since day 1. The selector lets the admin zoom into
  // shorter windows when they need to evaluate a recent push campaign.
  const [period, setPeriod] = useState('all');

  const fetchData = useCallback((p) => {
    const effective = p ?? period;
    setLoading(true);
    return axios.get(`${API}/push/analytics`, {
      params: { period: effective },
      withCredentials: true,
    })
      .then(({ data }) => { setData(data); setError(false); })
      .catch(() => { setError(true); })
      .finally(() => { setLoading(false); });
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API}/push/analytics`, {
      params: { period },
      withCredentials: true,
    })
      .then(({ data }) => { if (!cancelled) setData(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-black tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-600 shrink-0" />
            <span className="truncate">Push Analytics</span>
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-[#8a8a92] mt-0.5">
            Iscritti e performance delle notifiche push inviate ai tuoi vendor.
          </p>
        </div>
        {/* Controls block: on mobile becomes a full-width column under the title
            so the long "Reset Push Analytics" pill no longer escapes the card
            margin. On sm+ it floats top-right as before. */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-2 w-full sm:w-auto">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger
              className="h-8 w-full sm:w-[170px] text-xs font-semibold bg-white dark:bg-white/5 border-gray-200 dark:border-white/10"
              data-testid="push-period-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!hasAnyActivity && (
            <span className="hidden sm:inline-block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-[#6a6a72] bg-gray-100 dark:bg-white/5 px-2.5 py-1 rounded-full">
              In attesa di dati
            </span>
          )}
          <AnalyticsResetButton
            label="Reset"
            mobileFullWidth
            description="Verranno cancellate tutte le notifiche storiche e i contatori (invii, click, CTR). Gli iscritti restano attivi."
            resetEndpoint={`${API}/push/analytics/reset`}
            auditEndpoint={`${API}/push/analytics/audit-log`}
            onReset={() => fetchData()}
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
          <>
            {/* Mobile: vertical card list — avoids horizontal clipping of
                the small 'Click' / CTR columns on 375px viewports. */}
            <ul className="sm:hidden space-y-2" data-testid="push-analytics-recent-list">
              {recent_broadcasts.map((b) => (
                <li
                  key={b.id}
                  className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900 dark:text-white text-sm truncate">{b.title}</div>
                      <div className="text-[11px] text-gray-500 dark:text-[#8a8a92] line-clamp-2 mt-0.5">{b.body}</div>
                    </div>
                    <OriginBadge origin={b.origin} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-[#6a6a72]">
                    <span className="truncate max-w-[60%]">
                      {b.vendor_name || (b.vendor_id ? '—' : 'Org-wide')}
                    </span>
                    <span className="whitespace-nowrap">{fmtTime(b.created_at)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-gray-50 dark:bg-white/[0.03] px-2 py-1.5 text-center">
                      <p className="text-[9px] uppercase tracking-widest font-semibold text-gray-500 dark:text-[#6a6a72]">Inviate</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{b.sent}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-white/[0.03] px-2 py-1.5 text-center">
                      <p className="text-[9px] uppercase tracking-widest font-semibold text-gray-500 dark:text-[#6a6a72]">Click</p>
                      <p className="text-sm font-bold text-violet-700 dark:text-violet-300 tabular-nums">{b.clicks}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-white/[0.03] px-2 py-1.5 text-center">
                      <p className="text-[9px] uppercase tracking-widest font-semibold text-gray-500 dark:text-[#6a6a72]">CTR</p>
                      <p className="text-sm font-bold text-pink-700 dark:text-pink-300 tabular-nums">{b.ctr_pct}%</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table — only on sm+ */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-[12px]" data-testid="push-analytics-recent-table">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-[#6a6a72]">
                    <th className="px-2 py-1.5 font-semibold">Titolo</th>
                    <th className="px-2 py-1.5 font-semibold">Vendor</th>
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
                      <td className="px-2 py-2 text-gray-700 dark:text-[#a8a8b0] truncate max-w-[140px]">
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
          </>
        )}
      </div>
    </section>
  );
};

export default PushAnalytics;
