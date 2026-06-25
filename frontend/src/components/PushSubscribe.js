/* eslint-disable react/prop-types */
/**
 * PushSubscribe — opt-in CTA for receiving offer push notifications from a
 * specific vendor. Renders nothing in browsers that don't support Web Push,
 * and shows a friendly fallback prompt on iOS Safari outside Standalone PWA
 * (Apple requires "Add to Home Screen" for Push to work — iOS 16.4+).
 *
 * The button is intentionally lightweight — the whole UX collapses into a
 * single tap that:
 *   1. asks the browser for permission
 *   2. registers a subscription with our backend
 *   3. confirms via toast
 *
 * Scope picker (vendor-only vs whole organization) opens after permission
 * is granted so we don't waste the prompt on undecided users.
 */
import { useEffect, useState } from 'react';
import { Bell, BellRing, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const SW_URL = '/qrhub-sw.js';

// Helper: VAPID base64url → Uint8Array required by `pushManager.subscribe`.
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const clean = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(clean);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// True only when the browser actually exposes Push + the page is served
// from a secure context (HTTPS). Web Push will silently fail otherwise.
function isPushCapable() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && window.isSecureContext;
}

// iOS pre-16.4 or non-standalone PWA — Apple gate. We show a hint instead
// of a broken button.
function isIOSNonStandalone() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const standalone = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  return isIOS && !standalone;
}

function isIOS() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}

export const PushSubscribe = ({ vendorId, brandColor = '#F96815', vendorName }) => {
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [scopePromptOpen, setScopePromptOpen] = useState(false);
  const [pendingSub, setPendingSub] = useState(null);
  // Cached browser permission state. Read once on mount + after every
  // permission request so we can render distinct UI for 'denied' (blocked
  // by user) vs 'default' (never asked). On iOS in particular `denied` is
  // un-recoverable from JS — the only fix is iOS Settings.
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const capable = isPushCapable();
  const iosLocked = isIOSNonStandalone();
  const ios = isIOS();

  // On mount, check if this browser is already subscribed so we skip the
  // CTA and show a discreet "Sei iscritto" state instead.
  useEffect(() => {
    if (!capable) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration(SW_URL)
          || await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) setSubscribed(true);
      } catch { /* swallow — show button anyway */ }
    })();
  }, [capable]);

  const persist = async (subscription, scope) => {
    const sub = subscription.toJSON();
    await axios.post(`${API}/push/subscribe`, {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      vendor_id: vendorId,
      scope,
    });
  };

  const handleSubscribe = async () => {
    if (!capable) return;
    // If the permission is already 'denied' (user previously blocked or
    // iOS rejected silently), the browser won't show another prompt — calling
    // requestPermission() just returns 'denied' synchronously. Open a help
    // dialog with platform-specific instructions instead.
    if (Notification.permission === 'denied') {
      setPermission('denied');
      setHelpOpen(true);
      return;
    }
    setLoading(true);
    try {
      // Permission MUST come from the user gesture (this click).
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        // Open the help dialog rather than just toast — gives the user a
        // recovery path (especially on iOS where denial is sticky).
        setHelpOpen(true);
        return;
      }

      const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
      await navigator.serviceWorker.ready;

      const { data } = await axios.get(`${API}/push/public-key`);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });

      // Keep the raw subscription around so the user's scope choice updates
      // the same record without re-prompting the browser.
      setPendingSub(sub);
      setScopePromptOpen(true);
    } catch (e) {
      console.error('push subscribe failed', e);
      // Apple's specific error path when in Safari mini-bar / non-fully-
      // standalone state still throws. Help the user recover.
      setHelpOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const confirmScope = async (scope) => {
    if (!pendingSub) return;
    try {
      await persist(pendingSub, scope);
      setSubscribed(true);
      setScopePromptOpen(false);
      toast.success(scope === 'organization'
        ? 'Iscritto a tutte le offerte ✓'
        : `Iscritto alle offerte di ${vendorName || 'questo venditore'} ✓`);
    } catch (e) {
      toast.error('Salvataggio fallito');
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        await axios.post(`${API}/push/unsubscribe`, { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success('Notifiche disattivate');
    } catch (e) {
      toast.error('Errore disiscrizione');
    } finally {
      setLoading(false);
    }
  };

  if (!capable && !iosLocked) return null;

  // iOS Safari without Home Screen install → friendly hint, not a dead btn.
  if (iosLocked) {
    return (
      <>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 w-full rounded-full px-5 py-3 bg-white border-[1.5px] border-gray-200 text-gray-700 text-[13px] font-semibold shadow-sm hover:bg-gray-50 transition-colors"
          data-testid="push-ios-hint"
          onClick={() => setHelpOpen(true)}
        >
          <Bell className="h-4 w-4" />
          Notifiche offerte (aggiungi a Home per attivare)
        </button>
        <HelpDialog
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          ios
          permission="default"
        />
      </>
    );
  }

  // Permission already denied previously — show a recovery button that
  // opens the help dialog with platform-specific instructions instead of
  // re-firing requestPermission() (which would just return 'denied' again).
  if (permission === 'denied' && !subscribed) {
    return (
      <>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="inline-flex items-center justify-center gap-2 w-full rounded-full px-5 py-3 bg-amber-50 border-[1.5px] border-amber-300 text-amber-800 text-[13px] font-semibold shadow-sm hover:bg-amber-100 transition-colors"
          data-testid="push-blocked-btn"
        >
          <Bell className="h-4 w-4" />
          Notifiche bloccate — riabilita
        </button>
        <HelpDialog
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          ios={ios}
          permission="denied"
        />
      </>
    );
  }

  if (subscribed) {
    return (
      <button
        type="button"
        onClick={handleUnsubscribe}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 w-full rounded-full px-5 py-3 bg-emerald-50 border-[1.5px] border-emerald-200 text-emerald-700 text-[13px] font-semibold shadow-sm hover:bg-emerald-100 transition-colors"
        data-testid="push-unsubscribe-btn"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
        Notifiche attive — tocca per disattivare
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 w-full rounded-full px-5 py-3 text-white text-[13px] font-bold uppercase tracking-wide shadow-[0_12px_28px_-10px_rgba(0,0,0,0.4)] ring-1 ring-black/5 hover:brightness-110 active:scale-[0.97] transition-all"
        style={{ backgroundColor: brandColor }}
        data-testid="push-subscribe-btn"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        Ricevi le offerte
      </button>

      {scopePromptOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setScopePromptOpen(false)}
          data-testid="push-scope-prompt"
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Cosa vuoi ricevere?</h3>
                <p className="text-[13px] text-gray-500 mt-1">
                  Scegli la frequenza che preferisci. Puoi cambiare scelta in qualsiasi momento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScopePromptOpen(false)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Chiudi"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => confirmScope('vendor')}
                className="w-full text-left rounded-2xl border-[1.5px] border-gray-200 hover:border-gray-400 p-4 transition-colors"
                data-testid="push-scope-vendor"
              >
                <div className="font-semibold text-gray-900 text-[14px]">
                  Solo {vendorName || 'questo venditore'}
                </div>
                <div className="text-[12px] text-gray-500 mt-0.5">
                  Notifiche meno frequenti, solo dal tuo consulente.
                </div>
              </button>
              <button
                type="button"
                onClick={() => confirmScope('organization')}
                className="w-full text-left rounded-2xl border-[1.5px] p-4 transition-all hover:brightness-95"
                style={{ borderColor: brandColor, backgroundColor: `${brandColor}10` }}
                data-testid="push-scope-org"
              >
                <div className="font-semibold text-gray-900 text-[14px]">
                  Tutte le offerte del brand
                </div>
                <div className="text-[12px] text-gray-500 mt-0.5">
                  Tutte le novità da qualsiasi negozio dell&apos;organizzazione.
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        ios={ios}
        permission={permission}
      />
    </>
  );
};

/**
 * HelpDialog — explains to the user WHY the subscription failed and HOW to
 * recover. Three flavours:
 *   - iOS + denied      → Settings → Notifiche → <app name>
 *   - iOS + not granted → Devi aprire l'app dall'icona Home
 *   - Android / Desktop → click the lock icon in the URL bar
 *
 * Kept inline so it can read `permission` and `ios` from props without
 * prop-drilling state down.
 */
const HelpDialog = ({ open, onClose, ios, permission }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
      data-testid="push-help-dialog"
    >
      <div
        className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Bell className="h-5 w-5 text-amber-700" />
            </div>
            <h3 className="font-bold text-gray-900 text-lg">
              {permission === 'denied' ? 'Notifiche bloccate' : 'Permesso necessario'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Chiudi"
            data-testid="push-help-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {ios ? (
          <div className="space-y-3 text-[13px] text-gray-700 leading-relaxed">
            <p>
              Per ricevere le offerte sul tuo <strong>iPhone</strong>, segui questi passaggi:
            </p>
            <ol className="space-y-2 list-decimal pl-5">
              <li>
                Apri <strong>Impostazioni</strong> di iPhone
              </li>
              <li>
                Scorri fino a trovare <strong>Notifiche</strong> &gt; scegli l&apos;app salvata sulla
                Home (es. il nome del tuo brand)
              </li>
              <li>
                Attiva <strong>Consenti notifiche</strong>
              </li>
              <li>
                Torna qui e premi di nuovo <strong>Ricevi le offerte</strong>
              </li>
            </ol>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900">
              <strong>Importante:</strong> le notifiche su iPhone funzionano solo se hai aggiunto
              l&apos;app alla schermata <strong>Home</strong> (Condividi → Aggiungi a Home).
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-[13px] text-gray-700 leading-relaxed">
            <p>
              Le notifiche sono <strong>bloccate</strong> per questo sito. Per riattivarle:
            </p>
            <ol className="space-y-2 list-decimal pl-5">
              <li>
                Tocca l&apos;icona del <strong>lucchetto</strong> a sinistra della barra
                dell&apos;indirizzo
              </li>
              <li>
                Apri <strong>Autorizzazioni</strong> o <strong>Permessi sito</strong>
              </li>
              <li>
                Imposta <strong>Notifiche</strong> su <strong>Consenti</strong>
              </li>
              <li>
                Ricarica la pagina e premi di nuovo <strong>Ricevi le offerte</strong>
              </li>
            </ol>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 rounded-full bg-gray-900 text-white py-3 font-semibold text-[13px] hover:bg-gray-700 transition-colors"
          data-testid="push-help-ok"
        >
          Ho capito
        </button>
      </div>
    </div>
  );
};

export default PushSubscribe;
