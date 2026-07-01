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
import { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { tryNativeInstall } from './AddToHomeDialog';

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

export const PushSubscribe = ({ vendorId, brandColor = '#F96815', vendorName, variant = 'cta', autoPromptOnStandalone = false }) => {
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
  // header-bell variant uses a discreet confirm modal instead of immediate
  // unsubscribe — keeps an accidental tap from disabling notifications.
  const [confirmUnsubOpen, setConfirmUnsubOpen] = useState(false);
  const capable = isPushCapable();
  const iosLocked = isIOSNonStandalone();
  const ios = isIOS();
  // Guard so the standalone auto-prompt only fires ONCE per session. Without
  // this, a slow subscription refresh could re-trigger it after the user
  // consciously dismissed the OS permission dialog.
  const autoPromptFiredRef = useRef(false);

  // On mount, check if this browser is already subscribed so we skip the
  // CTA and show a discreet "Sei iscritto" state instead. Also listen to a
  // custom 'qrhub:push-state-changed' event so a sibling instance of the
  // component (e.g. CTA in body + bell in header) stays in sync without
  // prop-drilling state up.
  useEffect(() => {
    if (!capable) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration(SW_URL)
          || await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(!!sub);
      } catch { /* swallow — show button anyway */ }
    };
    refresh();
    const handler = () => refresh();
    window.addEventListener('qrhub:push-state-changed', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('qrhub:push-state-changed', handler);
    };
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
      // Notify sibling instances (e.g. header bell) so they re-fetch state.
      window.dispatchEvent(new Event('qrhub:push-state-changed'));
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
      setConfirmUnsubOpen(false);
      window.dispatchEvent(new Event('qrhub:push-state-changed'));
      toast.success('Notifiche disattivate');
    } catch (e) {
      toast.error('Errore disiscrizione');
    } finally {
      setLoading(false);
    }
  };

  // Overlay auto-shown on PWA standalone open. iOS Safari REQUIRES that
  // Notification.requestPermission() originates from a genuine user
  // gesture — a setTimeout-based call is silently ignored by Safari,
  // which is exactly why the previous auto-prompt implementation stopped
  // working ("iOS non chiede più il permesso e l'app non appare in
  // Impostazioni > Notifiche"). By showing a full-screen "Attiva
  // notifiche" prompt that requires 1 tap, we satisfy iOS's gesture
  // requirement AND keep the flow feeling automatic (< 1s after launch).
  const [autoOverlayOpen, setAutoOverlayOpen] = useState(false);

  // ── Auto-open the overlay on PWA standalone open ────────────────────
  // Fires ONCE per install by persisting a flag in localStorage so a
  // returning customer doesn't see the overlay every single time they
  // open the app. If they dismiss without granting, we still keep the
  // flag so we don't harass them — the pulsing "Ricevi le offerte"
  // button remains available in the body as a secondary CTA.
  useEffect(() => {
    if (!autoPromptOnStandalone) return;
    if (!capable) return;
    if (autoPromptFiredRef.current) return;
    if (subscribed) return;
    if (!vendorId) return;
    if (permission !== 'default') return;
    const isStandalone = window.navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
    if (!isStandalone) return;
    // Per-install dedup: never show the overlay twice for the same
    // installation. Value is scoped by vendor so a customer who installs
    // multiple vendor PWAs sees the overlay once per vendor.
    let dismissedKey = null;
    try {
      dismissedKey = `qrhub_push_overlay_dismissed_${vendorId}`;
      if (localStorage.getItem(dismissedKey)) return;
    } catch { /* private mode → show anyway */ }
    autoPromptFiredRef.current = true;
    // 400ms so the app can paint its first frame — customer sees the
    // vendor brand BEFORE the overlay slides in.
    const timer = setTimeout(() => { setAutoOverlayOpen(true); }, 400);
    return () => clearTimeout(timer);
  }, [autoPromptOnStandalone, capable, subscribed, vendorId, permission]);

  // Persist the "dismissed" flag so we don't re-open the overlay every
  // single time the user relaunches the PWA. Fires from both the "Attiva"
  // (after grant/deny) and the small "Non ora" button.
  const persistOverlayDismissed = () => {
    if (!vendorId) return;
    try { localStorage.setItem(`qrhub_push_overlay_dismissed_${vendorId}`, '1'); } catch { /* private mode */ }
  };

  const handleAutoOverlayAccept = async () => {
    // Called from within the button click — genuine user gesture, so
    // Notification.requestPermission() actually shows the OS dialog on
    // iOS. Piggy-backs on the shared handleSubscribe path so the scope
    // prompt + persistence logic stays DRY.
    setAutoOverlayOpen(false);
    persistOverlayDismissed();
    await handleSubscribe();
  };

  const handleAutoOverlayDismiss = () => {
    setAutoOverlayOpen(false);
    persistOverlayDismissed();
  };

  if (!capable && !iosLocked) return null;

  // header-bell variant: discreet circle button with a ringing bell that
  // appears in the page header ONLY when the user is subscribed. Clicking
  // opens a tiny confirm modal so customers can't accidentally disable
  // notifications by tapping the previous big CTA pill.
  if (variant === 'header-bell') {
    if (!subscribed) return null;
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirmUnsubOpen(true)}
          className="map-btn map-btn--bell"
          aria-label="Notifiche attive — tocca per gestire"
          title="Notifiche attive"
          data-testid="push-header-bell"
          style={{ background: 'var(--brand-secondary)' }}
        >
          <BellRing className="h-6 w-6" />
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white"
            aria-hidden="true"
          />
        </button>
        {confirmUnsubOpen && (
          <div
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setConfirmUnsubOpen(false)}
            data-testid="push-confirm-unsub"
          >
            <div
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <BellRing className="h-5 w-5 text-emerald-700" />
                </div>
                <h3 className="font-bold text-gray-900 text-lg">Notifiche attive</h3>
              </div>
              <p className="text-[13px] text-gray-600 leading-relaxed mb-5">
                Stai ricevendo le offerte di {vendorName || 'questo venditore'}.
                Sicuro di voler disattivare le notifiche?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmUnsubOpen(false)}
                  className="w-full rounded-full bg-gray-900 text-white py-3 font-semibold text-[13px] hover:bg-gray-700 transition-colors"
                  data-testid="push-confirm-unsub-keep"
                >
                  Mantieni attive
                </button>
                <button
                  type="button"
                  onClick={handleUnsubscribe}
                  disabled={loading}
                  className="w-full rounded-full bg-white border-[1.5px] border-red-200 text-red-700 py-3 font-semibold text-[13px] hover:bg-red-50 transition-colors disabled:opacity-50"
                  data-testid="push-confirm-unsub-disable"
                >
                  {loading ? 'Attendere…' : 'Disattiva notifiche'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // CTA variant (default): once the user is subscribed we render nothing
  // at the page CTA position. The discreet bell in the header (other
  // PushSubscribe instance with variant='header-bell') takes over from
  // here so accidental taps on the prominent CTA can no longer turn
  // notifications off.
  if (subscribed) return null;

  // iOS Safari without Home Screen install → tap ora apre DIRETTAMENTE la
  // native Share Sheet iOS (dove "Aggiungi a Home" è la prima opzione),
  // saltando il vecchio HelpDialog che l'utente ignorava. Se navigator.share
  // non è disponibile (iOS < 12.2 o Chrome/Firefox iOS), fallback al modal
  // informativo. Il pulsante ora pulsa come il "+" per invitare al tap.
  if (iosLocked) {
    const openNativeShare = async () => {
      const outcome = await tryNativeInstall({ vendorName });
      if (outcome === 'needs-modal') {
        // iOS Chrome/Firefox arrivano qui — non hanno "Add to Home" nel share
        // sheet, quindi ha senso mostrare le istruzioni step-by-step.
        setHelpOpen(true);
      }
      // 'share-sheet' / 'share-cancelled' → utente ha visto la scheda,
      // non serve alcun modal extra. Se aggiunge alla home la app si
      // aprirà standalone e il useEffect auto-prompt farà il resto.
    };
    return (
      <>
        <button
          type="button"
          className="qrhub-install-pulse inline-flex items-center justify-center gap-2 w-full rounded-full px-5 py-3 bg-white border-[1.5px] border-gray-200 text-gray-700 text-[13px] font-semibold shadow-sm hover:bg-gray-50 transition-colors"
          data-testid="push-ios-hint"
          onClick={openNativeShare}
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

  return (
    <>
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading}
        className="qrhub-install-pulse inline-flex items-center justify-center gap-2 w-full rounded-full px-5 py-3 text-white text-[13px] font-bold uppercase tracking-wide shadow-[0_12px_28px_-10px_rgba(0,0,0,0.4)] ring-1 ring-black/5 hover:brightness-110 active:scale-[0.97] transition-all"
        style={{ backgroundColor: brandColor }}
        data-testid="push-subscribe-btn"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        Ricevi le offerte
      </button>

      {/* Auto-shown overlay when the customer opens the PWA in standalone.
          iOS Safari requires Notification.requestPermission() to be
          invoked from a user gesture — the OS dialog is SILENTLY IGNORED
          when the call comes from setTimeout. So we surface a full-screen
          "Attiva notifiche" sheet that turns the OS prompt into a 1-tap
          affair while still feeling automatic (<500ms after launch). */}
      {autoOverlayOpen && (
        <div
          className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={handleAutoOverlayDismiss}
          data-testid="push-auto-overlay"
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-8 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
                style={{ backgroundColor: brandColor }}
              >
                <BellRing className="h-8 w-8 text-white" />
              </div>
            </div>
            <h3 className="text-center font-black text-gray-900 text-xl mb-2">
              Attiva le notifiche
            </h3>
            <p className="text-center text-[14px] text-gray-600 leading-relaxed mb-5">
              Ricevi in tempo reale le offerte e le novità
              {vendorName ? ` di ${vendorName}` : ''}. Puoi disattivarle in qualsiasi momento.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleAutoOverlayAccept}
                disabled={loading}
                className="w-full rounded-full py-3.5 text-white text-[14px] font-bold uppercase tracking-wide shadow-lg active:scale-[0.98] transition-all disabled:opacity-60"
                style={{ backgroundColor: brandColor }}
                data-testid="push-auto-overlay-accept"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Sì, attiva ora'}
              </button>
              <button
                type="button"
                onClick={handleAutoOverlayDismiss}
                className="w-full rounded-full py-2.5 text-gray-500 text-[13px] font-semibold hover:bg-gray-50 transition-colors"
                data-testid="push-auto-overlay-dismiss"
              >
                Non ora
              </button>
            </div>
          </div>
        </div>
      )}

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
          permission === 'denied' ? (
            // iOS + permesso già negato = UNICO fix reale è disinstallare
            // e reinstallare la PWA. Apple non espone alcun modo di
            // resettare da JS né da Impostazioni fino a quando il permesso
            // non è stato concesso almeno una volta — motivo per cui
            // l'app NON appare in Impostazioni > Notifiche.
            <div className="space-y-3 text-[13px] text-gray-700 leading-relaxed">
              <p>
                Hai bloccato le notifiche in precedenza. Su iPhone <strong>l&apos;unica
                via</strong> per riattivarle è <strong>rimuovere l&apos;app dalla Home e
                reinstallarla</strong>:
              </p>
              <ol className="space-y-2 list-decimal pl-5">
                <li>
                  Torna alla <strong>schermata Home</strong> del tuo iPhone.
                </li>
                <li>
                  Tieni premuto sull&apos;icona di questa app finché non
                  compare il menu → tocca <strong>Rimuovi app</strong> →
                  <strong> Elimina app</strong>.
                </li>
                <li>
                  Riapri la fotocamera e <strong>scansiona di nuovo il QR</strong>.
                </li>
                <li>
                  Tocca il pulsante <strong>+</strong> in alto o
                  &laquo;Aggiungi a Home&raquo; per reinstallare.
                </li>
                <li>
                  Alla prima apertura tocca <strong>Sì, attiva ora</strong>.
                </li>
              </ol>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900">
                <strong>Perché non trovi l&apos;app in Impostazioni &gt; Notifiche?</strong> iOS
                registra l&apos;app tra le notifiche solo dopo che hai concesso
                il permesso almeno una volta. Prima di questo passaggio,
                l&apos;app non compare — è un comportamento di Apple.
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-[13px] text-gray-700 leading-relaxed">
              <p>
                Per ricevere le offerte sul tuo <strong>iPhone</strong>:
              </p>
              <ol className="space-y-2 list-decimal pl-5">
                <li>
                  Aggiungi prima l&apos;app alla schermata <strong>Home</strong>
                  (tocca il pulsante <strong>+</strong> in alto o
                  &laquo;Condividi &rarr; Aggiungi a Home&raquo;).
                </li>
                <li>
                  Apri l&apos;app dalla Home (non da Safari).
                </li>
                <li>
                  Quando compare la scheda &laquo;Attiva le notifiche&raquo;,
                  tocca <strong>Sì, attiva ora</strong>.
                </li>
                <li>
                  Concedi il permesso quando iPhone chiede &laquo;Consenti
                  notifiche?&raquo;.
                </li>
              </ol>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900">
                <strong>Importante:</strong> le notifiche su iPhone funzionano solo se
                apri l&apos;app dalla schermata <strong>Home</strong>, non dal browser Safari.
              </div>
            </div>
          )
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
