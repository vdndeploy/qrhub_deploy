/**
 * AnalyticsResetButton — reusable destructive-action control for the
 * Push Analytics and Landing Negozi Funnel dashboards.
 *
 * Pattern:
 *   1. Pill button "Reset dati" → opens an AlertDialog
 *   2. AlertDialog requires the admin to type RESET to enable Confirm
 *   3. On confirm: POSTs to `resetEndpoint`, then fetches `auditEndpoint`
 *      and renders the last N audit entries in a collapsible footer
 *
 * Props:
 *   - label:           string shown next to the trash icon ("Reset dati")
 *   - description:     short string explaining what gets wiped
 *   - resetEndpoint:   absolute URL (full API path incl. /api/...)
 *   - auditEndpoint:   absolute URL of the GET audit-log endpoint
 *   - onReset:         callback fired after successful reset (parent
 *                      typically re-fetches its dashboard data)
 *   - testIdPrefix:    string used to namespace every data-testid emitted
 *                      ("push-reset" → push-reset-trigger / -confirm / …)
 */
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Trash2, History, Loader2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

// Local time formatter — same Europe/Rome conversion used elsewhere in the
// admin so the audit log timestamps match what the admin sees in the rest
// of the dashboard.
const fmtLocal = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export const AnalyticsResetButton = ({
  label = 'Reset dati',
  description = 'L\'azione cancella tutte le metriche storiche di questo cruscotto.',
  resetEndpoint,
  auditEndpoint,
  onReset,
  testIdPrefix = 'analytics-reset',
}) => {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [auditItems, setAuditItems] = useState([]);
  const [auditLoaded, setAuditLoaded] = useState(false);
  // Bumped after every successful reset so the parent (via onReset) and
  // the local log section re-fetch in lockstep without needing a shared
  // refetch ref.
  const bumpRef = useRef(0);

  // Re-arm the typed field every time the dialog opens — we never want to
  // keep the previous text around (it would defeat the safety pattern if
  // the admin re-opened the dialog by mistake on a second misclick).
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const fetchAudit = async () => {
    try {
      const { data } = await axios.get(auditEndpoint, { withCredentials: true });
      setAuditItems(Array.isArray(data?.items) ? data.items : []);
      setAuditLoaded(true);
    } catch {
      // Silently swallow — audit log is non-blocking. The parent dashboard
      // still works without it; we just leave the section empty.
      setAuditItems([]);
      setAuditLoaded(true);
    }
  };

  // Lazy-load audit entries the first time the admin opens the accordion.
  // Saves a round-trip on every dashboard mount.
  useEffect(() => {
    if (logOpen && !auditLoaded) {
      fetchAudit();
    }
  }, [logOpen, auditLoaded]);

  const canConfirm = typed.trim().toUpperCase() === 'RESET' && !submitting;

  const doReset = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      const { data } = await axios.post(
        resetEndpoint,
        { confirm: 'RESET' },
        { withCredentials: true }
      );
      toast.success(
        `Reset eseguito — ${data?.deleted ?? 0} eventi cancellati`,
        { duration: 4000 }
      );
      setOpen(false);
      setTyped('');
      bumpRef.current += 1;
      // Refresh audit log so the new entry shows up immediately if the
      // accordion was already expanded; mark "loaded" false so the next
      // open re-fetches when it's still closed.
      if (logOpen) {
        await fetchAudit();
      } else {
        setAuditLoaded(false);
      }
      onReset?.();
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Reset fallito';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-xs font-semibold transition-colors"
              data-testid={`${testIdPrefix}-trigger`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {label}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-md" data-testid={`${testIdPrefix}-dialog`}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="h-5 w-5" />
                Conferma reset
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] leading-relaxed text-gray-600 dark:text-[#a8a8b0]">
                {description}
                <br />
                <span className="block mt-2 text-red-700 dark:text-red-400 font-semibold">
                  L&apos;operazione è irreversibile.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 dark:text-[#a8a8b0]">
                Digita <span className="font-mono bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded text-red-700 dark:text-red-300">RESET</span> per abilitare la conferma:
              </label>
              <Input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="RESET"
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
                className="font-mono uppercase"
                data-testid={`${testIdPrefix}-confirm-input`}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={submitting}
                data-testid={`${testIdPrefix}-cancel`}
              >
                Annulla
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={!canConfirm}
                onClick={(e) => { e.preventDefault(); doReset(); }}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white disabled:opacity-50"
                data-testid={`${testIdPrefix}-confirm`}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Reset in corso…</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-1.5" /> Conferma reset</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <button
          type="button"
          onClick={() => setLogOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-[#a8a8b0] text-[11px] font-semibold transition-colors"
          data-testid={`${testIdPrefix}-history-toggle`}
        >
          <History className="h-3.5 w-3.5" />
          Storico reset
          {logOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {logOpen && (
        <div
          className="rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50/60 dark:bg-white/[0.02] p-3 max-h-60 overflow-y-auto"
          data-testid={`${testIdPrefix}-history-panel`}
        >
          {!auditLoaded ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-[#6a6a72] py-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Caricamento storico…
            </div>
          ) : auditItems.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-[#6a6a72] py-2 text-center">
              Nessun reset eseguito finora.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-white/5">
              {auditItems.map((it) => (
                <li
                  key={it.id}
                  className="py-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]"
                  data-testid={`${testIdPrefix}-history-item`}
                >
                  <span className="font-mono text-[11px] text-gray-500 dark:text-[#6a6a72] whitespace-nowrap">
                    {fmtLocal(it.reset_at)}
                  </span>
                  <span className="text-gray-900 dark:text-white font-semibold truncate max-w-[180px]">
                    {it.reset_by_name || it.reset_by_email || '—'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">
                    -{it.deleted_count} eventi
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalyticsResetButton;
