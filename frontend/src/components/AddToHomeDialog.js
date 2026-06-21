import { useEffect, useState } from 'react';
import { Share, Plus, ChevronRight, X, Smartphone, ShieldAlert, ExternalLink } from 'lucide-react';

/**
 * AddToHomeDialog — universal "Aggiungi alla home" CTA that works on every
 * device because we DON'T rely on `beforeinstallprompt` (Chrome's event
 * never fires without a service worker, which would also require an
 * offline-first cache we don't ship yet).
 *
 * Instead we detect the device + browser and show step-by-step screenshots /
 * iconography for THAT specific combination:
 *   • iOS Safari       → Share button → "Add to Home Screen"
 *   • iOS Chrome       → Share → Open in Safari (Chrome iOS can't install)
 *   • Android Chrome   → Menu (⋮) → "Aggiungi alla schermata Home"
 *   • Android Firefox  → Menu (⋮) → "Installa"
 *   • Desktop          → Friendly fallback: "Apri questa pagina dal tuo
 *                        smartphone per salvarla come app"
 *
 * If the visitor opens us via `beforeinstallprompt`-capable Chrome we still
 * use the native prompt (passed in via prop).
 */

const detectDevice = () => {
  if (typeof navigator === 'undefined') return { os: 'desktop', browser: 'unknown' };
  const ua = navigator.userAgent || '';
  const lower = ua.toLowerCase();
  let os = 'desktop';
  if (/iphone|ipad|ipod/i.test(ua)) os = 'ios';
  else if (/android/i.test(ua)) os = 'android';
  else if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) os = 'ios'; // iPadOS desktop UA
  let browser = 'other';
  if (os === 'ios') {
    if (/crios/.test(lower)) browser = 'chrome';
    else if (/fxios/.test(lower)) browser = 'firefox';
    else if (/safari/.test(lower)) browser = 'safari';
  } else if (os === 'android') {
    // ORDER MATTERS: Samsung Internet UA contains "Chrome/X" too, so
    // SamsungBrowser must be matched BEFORE chrome. Same logic for
    // Firefox vs Chrome (firefox UA contains "Chrome" on some forks).
    if (/samsungbrowser/.test(lower)) browser = 'samsung';
    else if (/firefox|fxios/.test(lower)) browser = 'firefox';
    else if (/chrome/.test(lower)) browser = 'chrome';
  }
  return { os, browser };
};

const StepRow = ({ n, icon, children }) => (
  <div className="flex items-start gap-3 py-2">
    <div className="w-7 h-7 rounded-full bg-[#D2FA46] text-[#0a0a0b] font-bold text-xs flex items-center justify-center flex-shrink-0">
      {n}
    </div>
    <div className="flex-1 text-sm text-gray-800 dark:text-[#e5e5e7] leading-snug pt-0.5 flex items-center gap-2 flex-wrap">
      {children}
      {icon && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10">{icon}</span>}
    </div>
  </div>
);

const AddToHomeDialog = ({ open, onClose, deferredPrompt, vendorName }) => {
  const [device, setDevice] = useState({ os: 'desktop', browser: 'unknown' });
  useEffect(() => { setDevice(detectDevice()); }, []);

  if (!open) return null;

  const handleNativePrompt = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch (e) {}
    }
    onClose();
  };

  const { os, browser } = device;
  const canUseNative = !!deferredPrompt;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0, 0, 0, 0.55)' }}
      onClick={onClose}
      data-testid="add-to-home-dialog"
    >
      <div
        className="bg-white dark:bg-[#131316] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[88dvh] overflow-hidden animate-in slide-in-from-bottom"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-start justify-between p-5 pb-3 flex-shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-[#D2FA46] mb-1">
              Accesso veloce
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Salva sul telefono
            </h3>
            <p className="text-xs text-gray-500 dark:text-[#8a8a92] mt-1">
              {vendorName ? `${vendorName} sempre a portata di mano.` : 'L\'app sempre a portata di mano.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -m-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            data-testid="add-to-home-close"
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {/* Android Chrome — try native first, otherwise instructions */}
          {os === 'android' && browser !== 'samsung' && (
            <>
              {canUseNative ? (
                <button
                  onClick={handleNativePrompt}
                  className="w-full mb-4 bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b] font-semibold rounded-2xl py-3 text-sm flex items-center justify-center gap-2"
                  data-testid="add-to-home-native-android"
                >
                  <Plus className="h-4 w-4" />
                  Aggiungi alla schermata Home
                </button>
              ) : null}
              <div className="rounded-2xl bg-gray-50 dark:bg-[#0a0a0b] border border-gray-100 dark:border-white/5 p-3">
                <p className="text-xs font-semibold text-gray-600 dark:text-[#a8a8b0] mb-1 uppercase tracking-wide">
                  Manualmente da Chrome:
                </p>
                <StepRow n="1">
                  Tocca il menu <span className="inline-flex w-6 h-6 rounded items-center justify-center bg-gray-200 dark:bg-white/10 font-bold">⋮</span> in alto a destra
                </StepRow>
                <StepRow n="2">
                  Scegli <strong>&quot;Aggiungi alla schermata Home&quot;</strong>
                </StepRow>
                <StepRow n="3">Tocca <strong>Aggiungi</strong></StepRow>
              </div>
            </>
          )}

          {/* Samsung Internet — has a known issue where Play Protect on
              Android 14+ blocks the WebAPK as "App non sicura" because
              Samsung signs the package with its own certificate (not Google
              Play). The reliable workaround is to install the PWA from
              Chrome instead. We deep-link via Android Intent URI which
              opens THIS exact URL inside Chrome, then the user taps
              ⋮ → "Installa app". */}
          {os === 'android' && browser === 'samsung' && (
            <>
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/[0.07] border border-amber-200 dark:border-amber-500/30 p-4 mb-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="h-5 w-5 text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-amber-900 dark:text-amber-200 text-sm mb-1">
                      Samsung Internet rilevato
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
                      Per evitare il blocco <em>&quot;App non sicura&quot;</em> di Play Protect,
                      installa l&apos;app da <strong>Chrome</strong>. È la stessa pagina,
                      ma il WebAPK viene firmato da Google e accettato sempre.
                    </p>
                  </div>
                </div>
              </div>
              <a
                href={(() => {
                  // Android intent URI that opens the current URL in Chrome
                  // specifically (package=com.android.chrome). The
                  // `S.browser_fallback_url` query is honored when Chrome
                  // is not installed — in that case we fall back to the
                  // original https URL so Samsung Internet still does
                  // something sensible (re-open same page).
                  if (typeof window === 'undefined') return '#';
                  const href = window.location.href;
                  const hostAndPath = href.replace(/^https?:\/\//, '');
                  const fb = encodeURIComponent(href);
                  return `intent://${hostAndPath}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fb};end`;
                })()}
                className="w-full block bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b] font-semibold rounded-2xl py-3 text-sm text-center"
                data-testid="add-to-home-open-in-chrome"
              >
                <ExternalLink className="inline h-4 w-4 mr-2 -mt-0.5" />
                Apri in Chrome
              </a>
              <p className="text-[11px] text-gray-500 dark:text-[#8a8a92] mt-2 text-center">
                Una volta su Chrome → tocca <strong>⋮</strong> →{' '}
                <strong>&quot;Installa app&quot;</strong>
              </p>
              <details className="mt-4 text-xs text-gray-600 dark:text-[#8a8a92]">
                <summary className="cursor-pointer font-medium select-none">
                  Non hai Chrome installato?
                </summary>
                <p className="mt-2 leading-snug pl-1">
                  Apri il <strong>Play Store</strong>, cerca <strong>Chrome</strong> e
                  installalo (è gratis). Poi torna qui e usa il tasto qui sopra.
                </p>
              </details>
            </>
          )}

          {/* iOS — Safari shows Share menu, other browsers must redirect */}
          {os === 'ios' && browser === 'safari' && (
            <div className="rounded-2xl bg-gray-50 dark:bg-[#0a0a0b] border border-gray-100 dark:border-white/5 p-3">
              <StepRow n="1" icon={<Share className="h-4 w-4 text-[#0a84ff]" />}>
                Tocca il tasto <strong>Condividi</strong> in basso
              </StepRow>
              <StepRow n="2">
                Scorri verso il basso e scegli <strong>"Aggiungi alla schermata Home"</strong>
              </StepRow>
              <StepRow n="3">Tocca <strong>Aggiungi</strong> in alto a destra</StepRow>
            </div>
          )}

          {os === 'ios' && browser !== 'safari' && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4 text-sm">
              <div className="flex items-start gap-2">
                <Smartphone className="h-5 w-5 text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
                    Apri in Safari per salvare
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
                    Su iPhone solo Safari permette di aggiungere l'app alla home.
                    Tocca <Share className="inline h-3.5 w-3.5 mx-0.5 align-text-bottom" />
                    {' '}<strong>Condividi</strong> qui sotto e poi <strong>"Apri in Safari"</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Desktop — friendly fallback with QR copy of current url */}
          {os === 'desktop' && (
            <div className="rounded-2xl bg-gray-50 dark:bg-[#0a0a0b] border border-gray-100 dark:border-white/5 p-4 text-sm text-center">
              <div className="text-3xl mb-2">📱</div>
              <p className="text-gray-800 dark:text-[#e5e5e7] font-medium mb-1">
                Apri questa pagina dallo smartphone
              </p>
              <p className="text-xs text-gray-500 dark:text-[#8a8a92] leading-snug">
                Da iPhone o Android potrai aggiungerla alla home come una vera app.
                {' '}Inquadra il QR code, oppure invia il link a te stesso.
              </p>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.share({ url: window.location.href, title: vendorName || 'QRHub' });
                    } catch (e) {}
                  }}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium"
                >
                  <Share className="h-3.5 w-3.5" />
                  Condividi link
                </button>
              )}
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full mt-4 text-sm text-gray-500 dark:text-[#8a8a92] hover:text-gray-900 dark:hover:text-white py-2 flex items-center justify-center gap-1"
          >
            Più tardi <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddToHomeDialog;
