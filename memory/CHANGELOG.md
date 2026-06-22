# QRHub — Changelog

> Storico completo delle modifiche. Per il backlog futuro vedi `ROADMAP.md`.

---

## 2026-06-22 — Footer GDPR su Store Landing + privacy page dedicata

- **Footer Store Landing** (`StoreLanding.js`): aggiunto blocco GDPR identico a quello di VendorLanding:
  - Badge "Titolare verificato" (visibile solo quando `gdpr_status.controller_verified=true`)
  - Blocco legale: denominazione, sede, P.IVA, email privacy (`legal_name` / `legal_address` / `vat_number` / `privacy_contact_email`)
  - Link footer: Informativa privacy · Termini & condizioni · Privacy policy estesa · Powered by QRHub
- **Privacy page per store** (`/s/:slug/privacy`):
  - Nuovo endpoint backend `GET /api/store-landing/{slug}/privacy-info` paralello a quello vendor, risolve org via slug landing
  - Estratto `_build_privacy_payload(org_id, subject_label)` come helper condiviso → lock-step legale tra vendor + store
  - `VendorPrivacy.js` parametrizzato per gestire sia `/v/:vendorId/privacy` che `/s/:slug/privacy` (auto-detect via `useParams`, endpoint + back-link condizionali)
  - Route aggiunta in `App.js`
- **Backend payload `/store-landing/:slug`** esteso con: `legal_name`, `vat_number`, `legal_address`, `privacy_contact_email`, `privacy_policy_url`, `gdpr_status` (controller_verified + completeness)
- Verificato e2e: footer renderizza con tutti i campi, badge clicca → `/s/qa-demo-store/privacy` → privacy page completa con titolare verificato + tutte le sezioni (titolare, processor, sub-processor, GDPR rights).

---

## 2026-06-22 — Hero responsive + banda titolo dinamica colore-immagine

- **Cosa cambia** (`StoreLanding.js`):
  - Hero image ora rendere al **rapporto naturale** dell'immagine (1:1, 4:5, 9:16…). Nessun crop forzato: i creativi Instagram/Stories restano integri come l'admin li ha designati.
  - Sotto l'immagine, una nuova **banda gradient** in cui vive titolo + sottotitolo. **Niente più testo sovrapposto all'immagine** — leggibilità perfetta indipendentemente dal contenuto della foto.
  - **Colore della banda estratto dinamicamente** dal bordo inferiore dell'immagine via Canvas API (sample 40×12 dello strip basso 12%, media RGB). Cloudinary fornisce CORS aperto → `crossOrigin="anonymous"` funziona out-of-the-box. Calcolo luminance WCAG decide testo bianco vs near-black.
  - Top-blend gradient (-8px) per fondere visivamente foto → banda senza taglio netto.
  - Transition CSS 500ms sul gradient → smooth se l'immagine carica in ritardo.
  - Fallback robusto: in caso di errore canvas (CORS / 404), default `rgb(17,24,39)` (gray-900) → testo bianco. Pagina non si rompe mai.
- Verificato e2e con 3 formati immagine (1:1 verdure, 4:5 pizza, 9:16 burger): tutti renderizzano al ratio naturale, banda colore matcha bordo basso, titolo perfettamente leggibile.

---

## 2026-06-22 — Race condition Radix Dialog stacking RISOLTA DEFINITIVAMENTE

- **Root cause vera**: il guard `if (!o && pickerOpenRef.current) return;` falliva perché `handlePick` in MediaPicker chiama `onClose()` **sincronamente** subito dopo `onSelect()`. La parent Landings azzerava `pickerOpenRef.current = false` in onClose → Radix dispatchava il cascade `onOpenChange(false)` al parent dialog → guard leggeva ref=false → editor chiudeva → setFormData veniva committato in un componente già unmounted → hero image persa.
- **Fix** (`Landings.js`): aggiunto `pickerClosedAtRef` con grace window di 400ms. Il parent dialog ignora ogni `onOpenChange(false)` che arriva entro 400ms dalla chiusura del picker, indipendentemente dal valore della ref. Resettato anche al riapertura del picker per non bloccare apertura/chiusura legittime.
- **Verificato e2e su preview**: tap card → editor RIMANE APERTO ✓, hero preview aggiornata ✓, PUT 200 con landing_hero_image nel body ✓, toast "Landing salvata" ✓.

---

## 2026-06-22 — Tap-to-pick su mobile per MediaPicker

- **Bug**: il pulsante "Usa" era visibile solo su hover desktop (`opacity-0 group-hover:opacity-100`). Su mobile/tablet senza hover il tap sulla card non scattava la pick — l'utente vedeva le immagini in galleria ma non riusciva a selezionarle ("ripeschi le vecchie immagini non le carica effettivamente").
- **Fix** (`components/MediaPicker.js`):
  - Card immagine ora è `role="button"` + `tabIndex=0` con `onClick={handlePick}` + keyboard handler (`Enter`/`Space`).
  - Aggiunto `cursor-pointer` + ring giallo `#D2FA46` su hover/focus per affordance visiva.
  - "Usa" overlay desktop conservato come affordance secondaria.
  - `onClick` del pulsante "Elimina" con `stopPropagation()` per non triggerare la pick.
  - Modalità `manageMode` esclusa dal click handler (l'utente non deve selezionare immagini durante l'eliminazione).
- Verificato e2e via Playwright su mobile viewport 414×900: tap diretto sulla card → editor STAYS OPEN + hero preview aggiornata + toast "Immagine selezionata".

---

## 2026-06-22 — Bug whitelist folder upload risolto (root cause vera)

- **Root cause definitiva**: `routers/media.py` linea 48 aveva un whitelist `if folder not in ('uploads', 'posts'): folder = 'uploads'`. Anche se Landings.js inviava `folder=landings`, il backend lo coercizzava SILENZIOSAMENTE a `uploads` → l'upload finiva in `org_<id>/uploads` su Cloudinary + DB record con `kind=uploads` → MediaPicker filtrato per `kind=landings` non lo trovava mai. Per questo l'utente vedeva "non carica da Cloudinary, solo da device" — il file ANDAVA su Cloudinary ma in cartella sbagliata, e la galleria landing era vuota.
- **Fix**: aggiunto `'landings'` al whitelist + commento esplicativo. Verificato e2e via Playwright: upload da device → URL `res.cloudinary.com/.../landings/...`, galleria mostra subito il nuovo file (4 file totali: 2 seed + 2 appena uploadati), tab "Foto profilo" e "Post" assenti.

---

## 2026-06-22 — Landings folder isolata + Race condition picker definitivamente risolta

- **Categoria "landings" dedicata** (backend + frontend):
  - Aggiunto `'landings'` ai `kind` validi su `GET /api/media` e `GET /api/files` (`routers/media.py`).
  - `MediaPicker` aperto da `Landings.js` ora passa `kind="landings"` → tab "Foto profilo" **completamente nascosto** + galleria filtra solo i file caricati come hero landing. I file uploadati da Landings con `folder=landings` finiscono naturalmente in `kind=landings`, separati dalle foto profilo vendor.
- **Race condition Radix Dialog stacking — fix definitivo**:
  - Sostituito il guard `if (!o && pickerOpen) return;` (state, soggetto a stale closure durante il close-cascade Radix) con `pickerOpenRef.current` (ref sync). Picker apertura/chiusura ora aggiorna sia state che ref. Setpicker close differito a 50ms per garantire che React commit `setFormData` prima che la chiusura propaghi.
  - Risultato verificato e2e: click "Usa" su immagine galleria → editor RIMANE APERTO, title preservato, hero preview aggiornato con URL Cloudinary, toast "Immagine selezionata" mostrato.

---

## 2026-06-22 — Cloudinary fix + Pixel Meta/Google Ads + Hero spacing

- **Fix critico — Upload Cloudinary in preview env** (`/app/backend/server.py` startup, `/app/backend/routers/media.py`):
  - Root cause: `CLOUDINARY_*` env vars erano vuoti in preview/dev → fallback locale ritornava URL `http://localhost:8001/uploads/...` irraggiungibile dal browser dell'utente. Da qui il sintomo "l'immagine caricata dalla galleria salvata in cloudinary ancora non si carica né salva".
  - Fix: hydration automatica della config Cloudinary dal documento `db.config` (dove la salva il pannello Super Admin) al boot del backend. `media.py` ora legge `CLOUDINARY_ENABLED` dinamicamente da `server` (via `import server as _server`) invece che catturarlo all'import. Fallback locale fixato per derivare il base URL da `request.base_url` quando env non è impostato (URL sempre raggiungibile dal browser).
  - Verificato: `POST /api/upload` ora ritorna `https://res.cloudinary.com/doqp3gr5e/image/upload/.../org_<id>/uploads/file_*.png`.
- **Hero spacing premium** (`StoreLanding.js`):
  - Aumentato `pb-14` sul block titolo/sottotitolo overlay (era `pb-6`) e ridotto pull-up CTA da `-mt-7` a `-mt-5`. Gap pulito di ~37px tra fine subtitle e bottone WhatsApp, niente più sovrapposizione visiva.
- **Pixel Meta + Google Ads** (lead-gen funnel `/s/:slug`):
  - **Backend**: nuovi campi org-wide su `OrganizationUpdate` model — `meta_pixel_id`, `google_ads_id`, `google_ads_conversion_label`. Esposti nel payload pubblico `/api/store-landing/:slug` sotto `organization.*`.
  - **Admin UI** (`OrgSettings.js`): nuova sezione viola "Pixel Meta & Google Ads (Lead-gen)" con 3 input (Pixel ID, Ads ID, Conversion Label) e helper testuali su dove trovare gli ID nelle dashboard rispettive. Privacy note: i pixel girano SOLO su `/s/<slug>`, MAI su `/v/<id>`.
  - **Public** (`StoreLanding.js`): iniezione dinamica degli snippet Meta `fbq init + PageView` e Google `gtag config` solo se gli ID sono presenti + non è una preview session. Sul click WhatsApp si invia `fbq('track', 'Lead')` + `gtag('event', 'conversion', {send_to: AW-X/Y})` — così Meta e Google possono ottimizzare le campagne sulle conversioni reali, non solo sui PageView.
  - Verificato: con pixel IDs di test, `window.fbq` + `window.gtag` definiti, 1 script Meta + 2 script Google iniettati nel DOM.

---

## 2026-06-21 — P0 Verifica fix MediaPicker + UI Premium Store Landing

- **Fix MediaPicker dialog stacking verificato e2e** (`Iteration 5` testing report):
  - Conferma che `modal={true}` sul Radix Dialog interno + guard `if (!o && pickerOpen) return;` sull'`onOpenChange` del parent `Landings.js` + `setTimeout(0)` deferred close del picker risolvono il bug classico Radix focus-trap stacking dove il parent dialog veniva chiuso aprendo/chiudendo il MediaPicker nested.
  - Test e2e Playwright simula lo scenario di failure: login org_admin → apri editor → click "Sfoglia libreria" → click "Usa" su media item → asserts: picker chiuso ✓, editor ancora aperto ✓, form state retained ✓, hero image preview aggiornata ✓, save PUT 200 ✓.
- **UI Premium StoreLanding verificata** (`/s/:slug`):
  - Mobile viewport 414×900: hero image con overlay titolo/sottotitolo, brand badge top-left con backdrop-blur, CTA singolo WhatsApp con gradient verde + shadow halo (no duplicati), card info `Leggi recensioni`/`Vieni a trovarci`/`Orari di apertura` con icone gradient e shadow soft.
  - Analytics funnel 4/4 eventi verificati (`store_landing_view`, `_review_click`, `_maps_click`, `_whatsapp_click`).
- **Test infrastructure**: creato QA Test Org dedicato + admin@example.com associato + store seed + 2 media item per validazione MediaPicker. Test credentials aggiornate in `/app/memory/test_credentials.md`.
- **Conferma**: il container HTML widget WINDTRE è già implementato sia lato admin (`Landings.js` linee 334-387: CTA mode picker + textarea HTML max 20KB con warning script) sia lato pubblico (`StoreLanding.js`: `<HtmlWidgetSection>` con analytics `store_landing_form_view`). Pronto per ricevere il codice WINDTRE quando l'utente lo fornirà.

---

## 2026-06-01 — Mobile UX restyling + Auto theme + Secondary colors + Brand cleanup

- **Landing Negozi v2 — Tab dedicato + Hero premium + Fix link recensioni**:
  - **Nuova pagina `Landings.js`** (route `/dashboard/landings`, tab "Landing" tra Annunci e Media). Card grid responsive con thumbnail dall'hero, badge `Live`/`Off`, gruppi "Attive"/"Non attive", filtro ricerca per nome o slug. Dialog editor full-feature (toggle attivazione + slug + testi + hero picker via MediaPicker + CTA mode picker visuale + 3 sezioni opzionali + link "Leggi recensioni" dedicato). Sezione landing rimossa dal dialog Stores per non sovraccaricarlo (era stata richiesta dall'utente come "troppo confusionario").
  - **Hero refactor premium in `StoreLanding.js`**: ora full-width banner immagine (aspect-[4/5] mobile / 16:12 desktop) con titolo/sottotitolo IN OVERLAY nella fascia bassa (`bg-gradient-to-t from-black/70 via-black/35 to-transparent` sul 55% inferiore, `drop-shadow` sul testo) — così l'admin può progettare l'immagine con la promo e leggere il testo senza coprire il design. Fallback a brand-color gradient se nessuna immagine. Brand badge top-left con `backdrop-blur-sm`.
  - **Striscia neutra CTA** bianca subito sotto l'immagine: WhatsApp button lime su sfondo bianco, separato visivamente. Spaziatura uniforme `space-y-3` su tutti i blocchi info.
  - **Fix bug "Leggi recensioni"**: il link puntava a `google_review` (URL "scrivi recensione"). Aggiunto nuovo campo `landing_review_read_url` distinto + fallback intelligente (strip `/review` dal write URL). Form admin con label "Link &quot;Leggi le recensioni&quot;" + helper text che spiega la differenza.
  - **Backend `Store` model**: nuovo campo `landing_review_read_url` propagato in create/update + `setdefault` in get_stores + esposto nell'endpoint pubblico `/api/store-landing/:slug`. Deploy Fly v61 live.
  - **Menu nav**: aggiunta voce "Landing" nel Dashboard.js header e in MobileNavDrawer (con badge NEW emerald).

- **Lead-gen Landing Page per Negozi** (`/s/:slug`) — feature P0 completa per traffico paid Meta/Google Ads:
  - **Backend**: 11 nuovi campi su `StoreCreate`/`StoreResponse` (`landing_enabled`, `landing_slug`, `landing_title`, `landing_subtitle`, `landing_hero_image`, `landing_cta_mode` toggle whatsapp/html_widget, `landing_whatsapp_message`, `landing_html_widget` max 20KB, `landing_show_reviews/hours/map` flags). Slug auto-generato + uniqueness check globale con suffisso `-N`. Endpoint pubblico `GET /api/store-landing/:slug` (no auth) restituisce dati + sub-object `organization` (logo, brand color). Endpoint SEO `GET /og/s/:slug` con OG/Twitter meta + JSON-LD `LocalBusiness` per Google rich results + meta-refresh fallback. Fallback noindex su slug mancanti.
  - **Frontend `StoreLanding.js`**: pagina mobile-first centrata `max-w-md` con hero brand-color gradient (deriva da `org.primary_color`), titolo+sottotitolo, CTA WhatsApp `#25D366` (Linktree/Beacons style) o HTML widget renderizzato in sandbox. Sticky bottom CTA con safe-area-inset. Sezioni opzionali: recensioni Google (banner giallo), mappa (open Google Maps), orari (testo formattato), social strip (IG/FB/TT con colori brand).
  - **Frontend `Stores.js`**: nuova sezione collassabile "Landing lead-gen" nel dialog modifica negozio — toggle abilitazione + slug editor (auto-lowercase + replace caratteri non validi) + 4 input principali + 2-card picker CTA mode (WhatsApp vs HTML widget) + 3 checkbox per sezioni opzionali + preview link cliccabile. Componente `<CheckboxRow>` riusabile.
  - **Analytics**: 7 nuovi `event_type` in `CLICK_TYPES` (`store_landing_view`/`whatsapp_click`/`review_click`/`maps_click`/`social_click`/`form_view`/`bounce`). `AnalyticsEvent` model accetta `store_id` opzionale. `track_event` gestisce shape duale (vendor-only o store-only). Bounce tracking via `navigator.sendBeacon` su `beforeunload` se nessun click in 10s.
  - **Dashboard analytics**: nuova sezione "Landing Negozi — Funnel lead-gen" in `AnalyticsDetailed.js` (admin only, visibile se `totals.views > 0`). 4 KPI cards (Atterraggi, Conversion Rate, Click CTA, Bounce Rate) + funnel chart 4-stage (View → Engaged → CTA → Form) + tabella per-store con CR% colorato (verde/ambra/grigio).
  - **SEO**: `vercel.json` aggiunto rewrite `/s/:slug` → `qrhub.fly.dev/og/s/:slug` per crawler UA (FB/Twitter/LinkedIn/Telegram/WhatsApp/Google/Bing/Apple bots). Meta tags dinamici lato server.
  - **Testing**: 16/16 pytest backend PASS (`test_store_landing.py`). Frontend E2E public landing verificata (view + click + bounce tracked). Admin UI code-reviewed (manca seed org_admin per Playwright E2E completo, ma data-testid all'70+ presenti).

- **Samsung Internet workaround intelligente** (`AddToHomeDialog.js`):
  - Fix detection bug: l'ordine dei test UA controllava `chrome` PRIMA di `samsung`, ma Samsung Internet UA contiene anche `Chrome/X` → tutti gli utenti Samsung venivano marcati come `chrome`. Ora `samsungbrowser` testato per primo.
  - Branch dedicato Samsung Internet: banner ambra con `ShieldAlert` icon che spiega il problema Play Protect ("Samsung firma il WebAPK con cert proprio, Play Protect blocca → Chrome firma con cert Google, accettato"). CTA grosso lime "Apri in Chrome" che usa Android Intent URI (`intent://...package=com.android.chrome;S.browser_fallback_url=...`) per deep-link verso Chrome con la pagina corrente. Fallback URL incluso per device senza Chrome installato.
  - Accordion `<details>` "Non hai Chrome installato?" → istruzioni Play Store.
  - Test E2E con Playwright iniettando UA spoof: branch rendered correctly, intent URL valido, fallback URL encoded correctly.

- **Fix Play Protect ("App non sicura · versione precedente di Android" su Samsung A17/Android 14+)**:
  - `VendorLanding.js`: il manifest era caricato da `qrhub.fly.dev` mentre la pagina era servita da `app.vdn.srl` → Chrome generava un WebAPK con template legacy che Play Protect bloccava. Cambiato `manifestHref` a path relativo `/api/manifest/v/...` → la rewrite Vercel lo serve same-origin con la landing. Stessa cosa per `apple-touch-startup-image` splash.
  - `server.py::vendor_manifest`: `id` ora è URL ASSOLUTO (era relativo, causava ricalcolo WebAPK), aggiunti `lang: 'it'`, `dir: 'ltr'`, `description`, `display_override: ['standalone', 'minimal-ui']`, `orientation: 'portrait-primary'`, `categories: ['business', 'productivity']`, `prefer_related_applications: false`. Icone: ora 4 (192/512 `any` + 192/512 `maskable`) — il 192 maskable era mancante, alcuni skin Samsung facevano fallback al globo generico.
  - `short_name` cappato a 12 caratteri (Android Home tronca dopo, e WebAPK validator richiede ≤ 12 per il primo accept).
- **Nascondere "+" se PWA già installata**:
  - Aggiunto state React `isStandalone` (init via `display-mode: standalone` / `navigator.standalone` / `android-app://` referrer).
  - Setter chiamato anche dentro `setupPWA()` (oltre alla classe CSS `qrhub-pwa-standalone` sul body) e sull'evento `appinstalled`.
  - Render del bottone `<Plus />` wrappato in `{!isStandalone && ...}` — sparisce automaticamente quando l'utente apre la PWA dall'icona home.

- **Self-service backend deploy** (`routers/deploy.py` + `Settings.js` + `backend/Dockerfile`):
  - Nuovo endpoint `POST /api/deploy/fly/deploy-code` esegue `flyctl deploy --remote-only --strategy immediate` come subprocess background. Stato live polling via `GET /api/deploy/fly/deploy-code/status` (ring buffer 200 righe + release URL + exit code + chi l'ha triggerato).
  - `backend/Dockerfile` ora installa `flyctl` in `/usr/local/bin/` durante il build — il backend in produzione può rebuilds-elf via il proprio token (`db.config.flyio_api_key`).
  - Settings tab Deploy: nuovo bottone "Deploy Backend Code" (lime su nero) accanto a "Redeploy immagine attuale" + log box live (sticky header con stato ● running / ✓ done / ✗ failed + link "Monitora su Fly.io"). Polling auto ogni 2s mentre `running=true`. Spinner pulse durante il build.
  - Comments inline che spiegano la differenza tra i 3 tasti (Deploy Code = nuova image, Redeploy = restart con secrets staged, Force update = re-attach machine).
  - Verificato live: deploy completato in ~3 min, exit_code=0, machine v57 attiva su prod. Risolve definitivamente il flusso "modifico codice → come lo porto in prod?".

- **Analytics più granulari** (filtri Oggi/Ieri + 9 canali tracciati):
  - **`CLICK_TYPES`** in `server.py` ora include `appointment_click` (Prenota appuntamento) e `pwa_install` (installazione PWA su home screen). Tracking lato landing: `VendorLanding.js` listener `appinstalled` invia `event_type='pwa_install'` (bypassa il filtro anti-duplicato 90min — l'evento è già naturalmente one-shot per device).
  - **`/api/analytics/daily-counter`** accetta `offset_days` (combinato con `days=1` → "Ieri" con 24 bucket orari Europe/Rome). End-window esclusiva calcolata correttamente per non sconfinare al giorno successivo.
  - **`/api/analytics/detailed`** `_period_to_dates` supporta `today` e `yesterday` con calendario Europe/Rome (un evento alle 23:30 IT cade sul giorno italiano, non sul next UTC day). 7d/30d restano rolling window UTC.
  - **`/api/vendor/stats`** accetta `period=today|yesterday|7d|month|all` (default `all` per retro-compatibilità). Stessa logica timezone-aware.
  - **`DailyCounterCard.js`**: nuovo bottone "Ieri" tra Oggi e 7 giorni (5 totale: Oggi/Ieri/7/30/90).
  - **`AnalyticsDetailed.js`**: periodo select esteso con "Oggi" e "Ieri". Card "Distribuzione Click per Canale" trasformata da pie chart in **vista a barre orizzontali**: tutti i 9 canali sempre visibili (anche con 0 click), ordinati per valore, con dot colorato brand-true, label, progress bar, count e %. Molto più leggibile della pie a fette piccole.
  - **`VendorDashboard.js`** "Dettaglio Click": segmented control con 5 periodi (Oggi/Ieri/7gg/Mese/Sempre) + grid responsive 3-5 colonne con 9 tile colorati (incluse 2 nuove voci: Appuntamento `#0EA5E9`, Installa PWA `#D2FA46`). Refetch automatico su cambio periodo.
  - Testing: 15/15 pytest backend passati su iteration_3.
- **Rate limit login più umano** (`server.py`): default da 5 tentativi/15min → **10 tentativi/5min**. Comment esteso che spiega il trade-off (uno scriptato fa migliaia/s, un umano che testa varianti maiuscole/simboli si blocca in 5 tentativi). Restano overridabili via env var `LOGIN_MAX_ATTEMPTS` e `LOGIN_WINDOW_SEC` per ambienti high-security. Deploy Fly v56 live. Pulizia opportunistica della collection `login_attempts` lanciata per sbloccare immediatamente account già locked.
- **Bug fix: superadmin password rotabile più volte nella stessa sessione** (`server.py::update_config`). Il salvataggio bumpava `token_version` per invalidare le sessioni MA non rinfrescava il cookie del tab attivo → il secondo `PUT /api/config` consecutivo falliva con 401 "Sessione invalidata", e l'admin pensava che la nuova password non venisse applicata. Fix: ora la response include `Set-Cookie` con un access_token rigenerato per la nuova `token_version` (stesso pattern già usato in `/me/password`). Aggiunto anche fetch esplicito di `token_version` da DB per garantire atomicità. Verificato con 3 cambi password consecutivi → tutti HTTP 200, login finale OK.
- **Desktop Card-grid unificato per Stores & Posts** (chiusura task UI mobile/desktop coerente):
  - `Stores.js`: rimossi import `Table*` inutilizzati. Aggiunto filtro ricerca case-insensitive su nome/whatsapp/instagram/facebook/tiktok (mirror del search Vendors). Bottoni Annunci/Modifica/Elimina convertiti a `<MobileActionBtn>` con tap target ≥ 60px (lime per Annunci, rosso per Elimina). Aggiornata copy del DialogDescription ("…sulla card del negozio" invece di "…in tabella").
  - `Posts.js`: bottoni Modifica/Elimina sulla card riga convertiti a `<MobileActionBtn>` (toggle Attivo/Pausa custom mantenuto per il visual indicator).
  - Risultato: Vendors / Stores / Posts ora hanno markup azioni 100% identico, riusabile in futuro per altri elenchi.
- **Rimossi tutti i brand reali** dagli esempi user-facing (Vendors/Organizations/OrgSettings/Settings copy). Placeholder ora generici ("Nome Brand", "Nome Azienda SRL", "mario-rossi"). Codice di migrazione legacy in `server.py` (auto-anonimizza dati storici) mantenuto funzionante.
- **Prenotazione appuntamenti via link Google Calendar**: nuovo campo `Store.appointment_url` (max 600). Form in Stores con helper passo-passo. Bottone tondo `CalendarClock` nell'header della landing accanto a MapPin → apre Google Calendar in nuova tab. Event `appointment_click` tracciato nelle analytics. Zero OAuth, zero costi.
- **Auto theme sunrise/sunset** (`hooks/useTheme.js`): suncalc lib (~3KB). Light tra alba civile (dawn) e tramonto (dusk) di Roma 41.9°N 12.5°E, dark altrimenti. Re-check ogni 5 min senza reload. Se l'utente clicca manualmente il toggle, la sua preferenza prevale (salvata in localStorage).
- **Mobile UX card stack** stile Linear/Notion per Vendors / Stores / Posts. Tabella attuale resta su desktop (`hidden md:block`), card stack su mobile (`md:hidden`) con tap target ≥ 60×60px, bottoni azione grid responsive (3-4 colonne), nuovo componente riutilizzabile `MobileActionBtn.js`. Mai più cestino e modifica attaccati. Switch attivo/pausa con label esplicita su mobile.
- **Colore secondario + colore freccia CTA per org** (`Organization.secondary_color`, `cta_arrow_color`): 2 nuovi color picker in OrgSettings tab Brand. Sulla landing: 5 card sociali alternano cornice e icona primary/secondary (assegnazione fissa per posizione). Bottoni "+" e "Condividi" nell'header in secondary. Annunci `PostsCarousel`: cornice + bottone CTA alternati per ogni post via hash FNV-1a deterministico su `post.id` (stesso post → sempre stesso colore). Se secondary non impostato → fallback a primary (nessuna alternanza). CSS variables `--brand-color`, `--brand-secondary`, `--cta-arrow-color` esposte su `.vendor-landing`.
- **Fix file `OrgSettings.js`** (legacy): rimosso ~2.5KB di JSX orfano dopo `export default` accumulato da edits precedenti + sostituito 0xa0 (NBSP latin-1) con space.

---

## 2026-05-29 — Tooling super admin + GDPR hardening

- **Fix fuso orario "Pattern Orario (24h)" + Andamento Giornaliero** (`backend/routers/analytics.py::_build_detailed_analytics`): conversione `ZoneInfo('Europe/Rome')` prima di `.hour` / `.date()` (stessa logica già nel daily-counter). Evento DB UTC 11:30 → `hourly_pattern[13]=19`. Deploy Fly v48 → PDF Log Eventi mostra `29/05/2026 13:30` invece di `11:30 UTC`; footer "Report generato il ... (ora Italia)".
- **Badge "NEW" su voce menu "Annunci"** (`Dashboard.js`): pill lime arrotondata, si inverte quando il tab è attivo. `data-testid="nav-posts-new-badge"`.
- **Daily Counter chart scrollabile orizzontalmente** (`DailyCounterCard.js`): wrapper `vendors-chart-scroll` con slot fisso 48px/giorno (44px/ora) → con 30/90gg il grafico mostra tutte le label senza accavallamenti. `interval=0` su XAxis.
- **GDPR hardening DPA v1.0 → v1.1** (`Dpa.js`, `server.py::CURRENT_DPA_VERSION`): aggiunte clausole §1 "Natura non commerciale", §6 "Responsabilità del Cliente" (Controller liable verso interessati/Garante), §9 "Limitazione responsabilità ed esclusione di garanzia" potenziata (AS-IS, AS-AVAILABLE, esonero da danni indiretti/sanzioni Garante, valore prestazione = 0), §10 "Backup autonomo", §12 "Modifiche DPA", §13 "Foro Verona". Tutti gli org admin ri-promtati al prossimo login.
- **Backup tab nel Super Admin** (nuovo router `routers/super_admin.py`, UI `Settings.js` tab "Backup"):
  - `GET /api/super-admin/backup/db` → ZIP completo MongoDB (Extended JSON con manifest + README mongoimport)
  - `GET /api/super-admin/backup/github` → snapshot zipball repo via API GitHub ufficiale (token mai esposto al browser)
  - Vecchia tab "GitHub" rinominata in "Backup", sezione Aruba DNS rimossa (era morta)
- **Free-tier Usage Monitor** (`/api/super-admin/usage` + tab "Usage" in Settings): chiama in parallelo Fly GraphQL, Cloudinary /usage, Vercel /deployments, MongoDB Atlas Admin API (Digest auth, opzionale). 4 card con progress bar % e tono colore (verde <70%, arancio 70-90%, rosso ≥90%).
- **Fix MongoDB card "rossa"**: sostituita barra fasulla "1/1 cluster" con storage DB reale (`dbStats` via motor) — `0.93 / 512 MB (0.2%)` verde. Aggiunto status `partial` per quando c'è solo connessione DB e non chiavi Atlas. Tutte le card mostrano `%` inline.
- **Billing & cost summary nel tab Usage**: banner verde "Costo questo mese (provider noti) $X/mese". Card Fly mostra plan "Hobby pay-as-you-go" + nota onesta. Card Atlas/Cloudinary/Vercel mostrano `$0.00/mese` quando Free. Link "Apri billing dashboard" per ogni provider. **Live Fly v51**.

## 2026-05-27 — PWA per-org + Print Badge

- **Icona PWA personalizzata per organizzazione**: campi `pwa_icon_url` + `pwa_icon_public_id` sul model `Organization`. Endpoint pubblico `GET /api/manifest/v/{vendor_id}` con manifest per-vendor (icons 192/512/512-maskable via Cloudinary resize). Iniezione dinamica nel `<head>` di `VendorLanding`: `<link rel="manifest">`, `<link rel="apple-touch-icon">`, `<meta name="theme-color">`. Cleanup completo on unmount per evitare leak su navigazione.
- **Stampa cartellino fronte/retro** (`components/BadgePrintDialog.js` + `pages/Vendors.js`): bottone Printer in tabella Venditori. RadioGroup ruoli predefiniti ("Store Specialist", "Store Manager") + "Personalizzato…". Generazione client-side: `window.open()` HTML stand-alone con QR PNG + logo+brand+colore dell'org, auto-`window.print()`. Layout A4 con 2 cartellini affiancati (86×132mm credit-card tall), crop marks. Hero gradient brand + glassmorphism + cornice QR con angoli decorativi.
- **Fix contrasto VendorDashboard tema scuro** + **primary_color org applicato a tutta la landing** (`VendorLanding.css`): 20+ `#F96815` hardcoded sostituiti con `var(--brand-color)` + `var(--brand-color-soft)` calcolata via `color-mix(in srgb, brand 65%, #fff)`. Inline style sul root passa il colore all'intera landing.

## 2026-05-24 — Sprint pre-beta + DPA gating + Stampa cartellino

- **DPA gating sulle landing pubbliche** (`backend/server.py` → `get_vendor_public()` + `VendorLanding.js`): se nessun org_admin dell'org ha accettato il DPA v1.0, backend marca response con `inactive_reason: 'dpa_pending'`. Frontend renderizza "Servizio non ancora attivo". Bypass admin tramite `?preview=<JWT>`.
- **Tab Secrets pulito** (`Settings.js` + `server.py` + `routers/deploy.py` + `.env`): rimossi tutti i riferimenti legacy `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Solo `SUPERADMIN_*` resta come credenziale env-driven. Backward compat preservata.
- **Bug fix MediaPicker white-page** (`MediaPicker.js`): destrutturazione `mineOnly`/`manageMode` mancante → `ReferenceError`. Re-applicata.
- **Doppia tab anteprima** (`Vendors.js`): rimosso `noopener` dal `window.open` perché ritornava `null`.
- **Slug rispettato sull'anteprima** + **mobile anteprima funzionante** + **preview check risolve slug↔UUID** in `_resolve_vendor_doc()`.
- **Landing URL dal dominio personalizzato** (`/api/vendor-auth/login` e `/me` ora restituiscono `landing_url`).
- **Toggle Light/Dark su VendorDashboard** + **Vendor "Le mie foto"** (MediaPicker in manage mode con `mine_only=true`).
- **Mobile fixes**: chart "Performance per Venditore" con asse X rotato -35° + truncate 12 char. Tab Deploy diventa `flex w-max overflow-x-auto` su mobile.

## 2026-05-23 — Tenant isolation + Marketing + Audit + Hours editor

- **Tenant-only landing enforcement** (`VendorLanding.js`): landing `/v/:vendorId` servite ESCLUSIVAMENTE sul `canonical_host` dell'org. Blocked screen ridisegnato dark+lime.
- **Marketing landing live su `/`** (`Marketing.js`): palette dark + lime neon (`#D2FA46`), nav pill sticky, grid background, hero, feature grid 3x2, access cards org/vendor.
- **prefers-color-scheme rispettato** (`hooks/useTheme.js`) — al primo accesso usa preferenza sistema, poi user override.
- **Grafici Overview ridisegnati**: Recharts arrotondati, soft purple `#9B7BFF`, tooltip custom morbido, no axis lines. StatCard con halo gradient.
- **Reset analytics venditore** (`POST /api/vendors/{vendor_id}/analytics/reset` + UI in `Vendors.js`).
- **Fix filtro Media** + **orphan detection** (`routers/media.py`): `?folder=uploads|posts` ora matcha su `kind`, include `vendor.profile_image_url` e `organization.logo_url`.
- **Footer landing arricchito** con dati titolare (denominazione legale, sede, P.IVA, email privacy) + sezione "Profilazione" editabile in OrgSettings con default Meta/Google/TikTok in italiano.
- **OG image piccola e quadrata** (Twitter `summary` + Cloudinary `w_400,h_400,c_fill,g_face`).
- **Preview token firmato** (`POST /api/vendors/{id}/preview-token` JWT 30 min + `GET /api/preview/check`).
- **Pagine legali pubbliche su qrhub.it**: `/terms`, `/privacy`, `/license` (PolyForm Noncommercial 1.0.0) — palette dark+lime.
- **Anteprima landing per admin**: pulsante Eye azzurro su Vendors.js apre `/v/{id}?preview=<JWT>`.
- **Fix critico save orari** (`server.py`): `create_store`/`update_store` mancavano `hours`/`hours_text`/`address`/`phone` nel `store_doc`. Aggiunti con conversione `StoreHoursDay.model_dump()`.
- **HoursEditor ridisegnato** (`components/HoursEditor.js`): 7 card per giorno, toggle Switch shadcn, pausa pranzo collassata, shortcut "Copia Lun→Mar-Ven".
- **Open-now badge real-time** con 4 stati (open/closing_soon/opening_soon/closed). Tick ogni 60s.
- **Audit log** (`db.audit_log` + `GET /api/audit` + pagina `/dashboard/audit`).

## 2026-05-22 — Platform primary domain (qrhub.it)

- **5 endpoint sotto `/api/platform/*`**: GET/PUT/DELETE `primary-domain`, POST `primary-domain/verify`, GET `config` (pubblico no-auth). Registra dominio su Vercel API + DNS instructions live.
- **`<DomainGuard>` component**: legge `/api/platform/config` al boot, controlla `window.location.hostname` contro `primary_domain` + `admin_hosts_allowlist`. Su tenant custom domain reindirizza tutto fuorché `/v/*` al primary domain.
- **Super Admin UI tab "Dominio"** (👑 corona, primo tab) con form registrazione + verifica DNS + istruzioni Aruba/Cloudflare.

## 2026-05-21 — Refactor + Media Library + Logo org + Vendor slug

- **Refactor `server.py` → router modulari (Fase 1)**: 3752 → 2538 righe (-32%). `routers/deploy.py` (536 righe, 8 endpoint), `routers/media.py` (349 righe, 7 endpoint), `routers/analytics.py` (467 righe, 6 endpoint). Late-binding pattern per evitare circular imports.
- **Media Library Cloudinary multi-tenant**: 3 endpoint `/api/media` (list, stats, delete) con dual auth `get_current_user_or_vendor`. Tenant isolato via `org_{id}/*`. Admins vedono `uploads`+`posts`, vendor solo `uploads` propri. `db.files` arricchito con `kind`, `uploaded_by_id`. Protezione DELETE: refusa se referenziato (409).
- **`<MediaPicker>` modale** con tab Foto profilo / Immagini post, search, paginazione 60/pag, badge "in uso/libera". Integrato in VendorDashboard + PostsManager.
- **Logo Org customizzabile** + **Pagina Media completa**: logo WINDTRE hardcoded RIMOSSO da `VendorLanding.js`. Pagina `/dashboard/media` con 4 stats card + lightbox + delete inline.
- **Vendor slug personalizzato**: campo `slug` (a-z0-9-, max 64). URL `/v/gizwindtre` risolto come `/v/<uuid>`. Indice unique partial. Helper centralizzato `_resolve_vendor_doc()`.
- **Cambio password self-service** (`POST /api/me/password` con bump `token_version` + refresh cookie).
- **GDPR M6** (data minimization): `Field(..., max_length=N)` su tutti i Pydantic model.

## 2026-05-19 — OG cards + QR custom domain + Security audit

- **OG/Twitter card** (anteprima WhatsApp/Telegram/FB/LinkedIn): endpoint `GET /og/v/:vendorId` server-rendered con tag OG/Twitter + redirect meta refresh. `vercel.json` con rewrite condizionale via User-Agent matcher → crawler vanno a `qrhub.fly.dev/og/v/:id`, browser umani SPA normale.
- **Landing UX + QR custom domain**: header `landing_headline` editabile. Pulsante "Condividi" (Web Share API + fallback clipboard). QR usa dominio custom verificato. Helper `_effective_landing_url()`.
- **`<title>` browser** sistemato (admin: "QRHub — Pannello Amministratore"; vendor: "{Vendor} · {Brand}").
- **Security audit**: rimossi secret in chiaro da `GUIDA.md`, `README.md`, test, `PRD.md`, `test_reports`. Seed super-admin/org-admin solo se `SUPERADMIN_PASSWORD`/`ADMIN_PASSWORD` definite (no auto-bootstrap weak).
- **DNS Domini personalizzati — istruzioni live da Vercel**: `_vercel_domain_config()` chiama `GET /v6/domains/{d}/config` per `misconfigured`, `recommendedCNAME/IPv4`, conflicts. `DomainCard` tre stati visivi.

## 2026-05-17 — Hardening iniziale + GDPR Sprint 1/2/3/4

- **Clone repo** `vdndeploy/qrhub_deploy` + connessione DB produzione (`qrhub_vendor_db`).
- **Rinomina DB** `windtre_vendor_db` → `qrhub_vendor_db` (copy + Fly secret + verify + drop old).
- **Bug fix `/api/deploy/fly/redeploy`**: era `/restart` → `POST /machines/{id}` per applicare secret staged.
- **GDPR Sprint 1 (CRITICAL)**: C1 IP raw → subnet anonimizzata `/24` IPv4 + `/48` IPv6. C2 tenant scoping su export PDF.
- **GDPR Sprint 2 (HIGH)**: H1 rate-limit login (5/15min). H4+H7 endpoint privacy-info + pagina `/v/:vendorId/privacy`. H5 cookie banner sempre visibile. Campi privacy in OrgSettings.
- **GDPR Sprint 3 (HIGH)**: H2 endpoint `GET /api/me/data-export`, `DELETE /api/me`. H3 `POST /api/me/revoke-all-sessions` (token_version JWT). H6 DPA accept flow.
- **GDPR Sprint 4 (MEDIUM)**: M1 Cloudinary folder tenant-prefisso. M2 Security headers. M3 TTL analytics 365gg. M4 warning JWT_SECRET <32 byte. M5 sezione "Trasferimenti extra-UE e SCC" su Legal.js. M8 redaction email nei log.
- **Trust badge "Titolare verificato"** sulla landing + privacy page quando org ha tutti 4 campi.
