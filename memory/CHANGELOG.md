# QRHub — Changelog

> Storico completo delle modifiche. Per il backlog futuro vedi `ROADMAP.md`.

---

## 2026-02-12 — Feature: Reviews Analytics dashboard (Google review click-through per-store)

- **Backend**: nuovo endpoint `GET /api/analytics/reviews?period=today|yesterday|7d|30d|month|all` (`routers/analytics.py` linee ~776-905).
  - Aggrega DUE sorgenti in modo unificato: `store_landing_review_click` (scoped via `store_id`) + `review_click` legacy (scoped via `vendor_id` → join in-memory con `vendors.store_id`).
  - Shape: `{period, totals:{review_clicks, store_landing, vendor_profile}, by_store:[{id,name,slug,store_landing_clicks,vendor_profile_clicks,total_clicks,share_pct}], timeline:[{date,count}]}`.
  - Sorting "top performers first" (total_clicks desc, name asc); su `period=all` include anche store a 0 click (catalogo completo); su periodi corti li nasconde per ridurre rumore.
  - Aggiunto label `all` ("Sempre") al helper `_period_to_dates` con epoch 1970-01-01 per finestra open-ended.
  - Tenant isolation stretta (org_id sui store + filter vendor_ids sull'org).
- **Frontend** (`pages/AnalyticsDetailed.js`):
  - Nuovo state `reviewsData` + fetch parallelo al landing nel `fetchData`.
  - Nuovo componente `<ReviewsAnalyticsSection>` come `<section>` sibling (data-testid="reviews-analytics-section") con: 3 KPI tiles (Click totali con data-testid="reviews-total-clicks", Landing, Vendor profile), sparkline timeline giornaliera (Recharts), tabella per-store con quota % progress bar.
  - Sempre visibile in admin mode (anche con totals=0 → empty state "Nessun click recensione registrato in questo periodo").
  - Il period selector del header pilota anche questa sezione.
- **Testing**: testing_agent_v3_fork iter_25 → 18/18 backend test passati live + frontend end-to-end (section presence, KPI, period switch, empty state). Iter_24 regression 14/14 ancora verde.
- **Deploy**: Fly.io re-deploy eseguito (exit 0, ~68s) — `https://qrhub.fly.dev/api/analytics/reviews` live e verificato.



## 2026-02-12 — Feature: Reset + Audit Log per Push Analytics & Landing Funnel + separazione visiva

- **Backend**:
  - `POST /api/push/analytics/reset` (richiede `{confirm:'RESET'}`, org-scoped wipe di `push_broadcasts`, ritorna `{deleted, audit_id}`)
  - `GET /api/push/analytics/audit-log` (lista storica reset push, org-scoped, ordinata desc)
  - `POST /api/analytics/store-landings/reset` (richiede `{confirm:'RESET'}`, wipe di `analytics` con `event_type` prefix `store_landing_` scoped agli store dell'org)
  - `GET /api/analytics/store-landings/audit-log` (storico reset landing, org-scoped)
  - Nuova collection `analytics_reset_log` per l'audit trail (id, organization_id, dashboard_type, reset_by_user_id/email/name, deleted_count, reset_at)
- **Frontend**:
  - Nuovo componente riusabile `AnalyticsResetButton.js` con AlertDialog shadcn, conferma tipizzata "RESET", toast Sonner, e accordion "Storico reset" che mostra le entry dell'audit log.
  - Integrato in `PushAnalytics.js` (header del card) — refetch automatico dopo reset.
  - Integrato in `AnalyticsDetailed.js → StoreLandingsSection` con refetch della sola sezione landing.
- **UX**: `StoreLandingsSection` è stata **estratta** dal wrapper del Log Eventi Recenti e renderizzata come `<section>` sibling con margine `space-y-6` per separazione visiva netta. Flag `landingsEverShown` mantiene la sezione montata anche dopo il reset (altrimenti la condition `views > 0` la faceva sparire, perdendo accesso allo Storico).
- **Testing**: testing_agent_v3_fork (iter_24) ha validato 14/14 backend pytest live + frontend end-to-end push flow (AlertDialog gating, audit history visibile con 3 entry). Push vendor-scoping (iter_23) regression 26/26 ancora verde.



## 2026-02-12 — Bug fix P0: cross-vendor push leak (Lancia messaggio offerta)

- **Issue**: When admin used "Lancia messaggio offerta" dialog and selected a specific vendor (e.g. Vendor A), the push was also delivered to subscribers of other vendors of the same org who had opted into "tutte le offerte del brand" (scope='organization').
- **Root cause**: `broadcast_push()` in `routers/push.py` always built an `$or` query that included `{organization_id, scope:'organization'}` whenever a vendor_id was passed — unconditionally pulling org-wide subs from ANY vendor.
- **Fix**: added `include_org_scope: bool = True` param to `broadcast_push()`. The manual broadcast endpoint passes `include_org_scope = (req.vendor_id is None)` → strict `{vendor_id: X}` filter when admin targets a specific vendor. Auto-push from post creation keeps the default (True) so the "all brand offers" subscription stays meaningful for org-wide subscribers.
- **Tests**: 3 new unit tests `TestVendorScopingFix` in `tests/test_push.py` (FakeDB) + 3 E2E tests in `tests/test_push_vendor_scoping_e2e.py` (real MongoDB, 4 seeded subs per case). Testing agent validated 29/29 tests passing — zero cross-vendor leak, all regressions green.



## 2026-06-25 — Push Analytics dashboard + Install button pulse animation

- **Install button pulse** (`VendorLanding.css` + `VendorLanding.js`): added `.map-btn--install` class on the "+" header button with a 1.8s heartbeat scale + expanding glow ring (white + brand-color box-shadow). Respects `prefers-reduced-motion`. Pause on hover/focus. Auto-hidden when PWA is already installed (standalone mode).
- **Push Analytics backend** (`routers/push.py`):
  - Refactored `broadcast_push()` to persist each broadcast as a `push_broadcasts` doc (id, org, vendor, title/body, origin: manual|auto, sent, stale_cleaned, clicks, created_at) — returns 3-tuple `(sent, removed, broadcast_id)`.
  - New endpoint `POST /api/push/track-click` (public, no auth) — incremented by service worker on `notificationclick`. Silently 200 on unknown ids so a stale SW doesn't retry.
  - New endpoint `GET /api/push/analytics` (auth, org-scoped) — returns subscribers breakdown (total/vendor_scope/org_scope), totals (broadcasts/sent/clicks/ctr_pct), top vendors by subscribers, and last 20 broadcasts with per-row CTR and vendor name.
  - Indexes added: `push_broadcasts.{organization_id,created_at:-1}` + unique `id`.
- **Service worker** (`qrhub-sw.js`): `push` event now passes `broadcast_id` into `notification.data`; `notificationclick` fires `keepalive` POST to `/api/push/track-click` before navigation (fire-and-forget, never blocks UX).
- **Frontend dashboard** (`PushAnalytics.js` + mounted on `Overview.js`): premium gummy card with 4 stat tiles (Iscritti totali, Notifiche inviate, Click totali, CTR medio), top-vendor chips, and a sortable recent-broadcasts table with origin badge (Auto/Manuale), sent count, clicks, per-row CTR%, and "Quando" timestamp.
- **Regression tests**: extended `tests/test_push.py` from 15 → **21 pytests** (added schema check, broadcast_id in response, click increment, unknown id graceful, payload validation). All ✅.
- **Verified end-to-end**: curl flows, screenshot, click counter increment, CTR computation, org-scoped isolation.



## 2026-06-25 — Web Push Notifications (PWA) — COMPLETED

- **Backend** (`/app/backend/routers/push.py`):
  - VAPID keypair auto-bootstrap on startup (stored in `db.push_config`, idempotent).
  - Endpoints: `GET /api/push/public-key`, `POST /api/push/subscribe` (upsert, unique index on endpoint), `POST /api/push/unsubscribe`, `POST /api/push/broadcast` (auth + tenant-scoped).
  - `broadcast_push()` helper: per-vendor pushes also reach org-wide subscribers via `$or` query; stale endpoints (404/410) auto-cleaned via `delete_many`.
  - Auto-push on `POST /api/posts` when `notify_subscribers=True` (default ON in create mode, OFF on edit).
- **Frontend**:
  - `PushSubscribe.js` (vendor landing opt-in): capability detection, iOS Safari hint for non-standalone, scope picker (vendor / org-wide), persists to backend, supports unsubscribe.
  - `PushBroadcastDialog.js` (admin manual broadcast): vendor selector populated from `/api/vendors`, title/body/url inputs, posts to `/api/push/broadcast`.
  - `Posts.js`: wired vendors fetch + `<PushBroadcastDialog>` mount (was missing — fixed in this session).
  - `qrhub-sw.js`: added `push` and `notificationclick` listeners (showNotification + focus existing tab / openWindow).
- **Critical bug found+fixed by testing agent**: `_send_one` was declared `async def` but is passed to `asyncio.to_thread` (sync-only). The async coroutine objects polluted the `stale` list → `bson.errors.InvalidDocument` on `delete_many` → 500. Fix: dropped `async` keyword (pywebpush is purely synchronous).
- **Regression suite**: `/app/backend/tests/test_push.py` — 15/15 pytests ✅.
- **Frontend e2e**: org_admin login → /dashboard/posts → "Lancia offerta" → dialog renders → validation + success toast verified. VendorLanding `push-subscribe-btn` renders. `qrhub-sw.js` HTTP 200 + handlers present.
- **NOT yet deployed to Fly.io** — user must trigger `/api/deploy/trigger` or via Super Admin UI when ready.



## 2026-06-25 — Avatar SVG clipped to circle like photos

- `.hero-avatar-ring svg` ora eredita lo stesso styling di `.hero-avatar-ring img`: `border-radius: 50%`, `border: 3px solid #fff`, `background: #fff`. Selector combinato in `VendorLanding.css`.
- Risultato: il mascot ora è clippato dentro il cerchio con bordino bianco perfettamente identico a una foto vera. Le spalle sono troncate dal cerchio (stile "profile photo" classico).
- Verificato live su `/v/6a0c73f8fbb39d92c9f5edd8` ✅.

---

## 2026-06-23 — Avatar femminile: fronte libera + capelli laterali puliti

- Ridisegno path `f` in `ConsultantAvatar.js`:
  - Split in `back` (drawn before head ellipse) e `front` (after head). Per `f`, solo `back` viene popolato → la testa MASCHERA naturalmente il front, lasciando la fronte libera.
  - `back` = halo ellipse (rx=58, ry=62) + 2 long strand path che cadono ai lati fino a y=178.
  - Niente più "macchia" di capelli sulla fronte.
- Per `m`/`neutral`: solo `front` (cap corto, look invariato).
- Verificato live: Danu con `default_avatar_gender='f'` mostra capelli lunghi puliti laterali + fronte/viso completamente libero ✅.

---

## 2026-06-23 — ConsultantAvatar minimal redesign + admin picker

- **Ridisegno avatar**: rimossi tutti i dettagli facciali, headset, mic, QR emblem, eyebrows, blush, nose, mouth. Restano solo:
  - Backdrop circolare neutro
  - Spalle/torso brand-coloured
  - Head ellisse skin-tone semplice (no features)
  - Hair shape per gender (cap corta neutra / m vs capelli lunghi f)
- Codice del componente ridotto da ~220 righe a ~110. Più leggibile a dimensioni piccole (32px tile), più "professional placeholder" e meno mascot.
- **Vendors.js (admin)**: aggiunto picker pill "Avatar di default" (Neutro/Maschile/Femminile) nel modal create/edit vendor, sotto il select "Ruolo nel negozio". `formData.default_avatar_gender` viene popolato in edit e resettato a `'neutral'` in create. Inviato col PUT/POST esistente.
- VendorDashboard, VendorLanding, Backend non toccati: già compatibili con la stessa prop.
- Verificato live: avatar Danu (femminile) ridotto a silhouette pulita, picker admin funzionante in modal mobile ✅. Lint pulito.

---

## 2026-06-23 — ConsultantAvatar: variant femminile + selector per-vendor

- `ConsultantAvatar.js` accetta nuovo prop `gender="neutral"|"m"|"f"`:
  - `m/neutral` → capelli corti wavy (look originale)
  - `f` → capelli lunghi ondulati che cadono sulle spalle, parting highlight, side-wave detail. Tutto brand-tinted.
- Backend `server.py` (deploy fly **v71**):
  - `VendorCreate`, `VendorUpdate`, `VendorProfileUpdate`, `VendorResponse` → nuovo campo `default_avatar_gender: str` (max 10 char).
  - Helper `_normalize_avatar_gender(raw)` valida contro set `{'neutral','m','f'}`, default fallback `'neutral'`.
  - `create_vendor`, `update_vendor`, `update_vendor_profile` persistono il campo.
  - `get_vendors`, `get_vendor_public`, `get_vendor_me` hydratano con default `'neutral'` per back-compat.
- Frontend `VendorDashboard.js`:
  - `formData` include `default_avatar_gender`.
  - Sotto la preview foto, quando NO `profile_image_url`, render picker pill (Neutro / Maschile / Femminile) con `data-testid="vendor-avatar-gender-{v}"`.
  - Preview mascot usa il valore corrente per cambio live al click.
- Frontend `VendorLanding.js`: passa `vendor.default_avatar_gender` al `<ConsultantAvatar />`.
- Verificato live prod su `/api/vendors/...` → `default_avatar_gender: "f"` esposto. Screenshot preview con variant femminile + capelli lunghi brand-arancione ✅.

---

## 2026-06-23 — Default ConsultantAvatar vector mascot (brand-tinted, unisex)

- Nuovo componente `/app/frontend/src/components/ConsultantAvatar.js`:
  - SVG inline 220×220 viewBox, vettoriale puro, no deps.
  - Volto unisex + headset + mic + emblem speech-bubble con mini-QR sul tee (firma QRHub, NON un clone di Will).
  - Prop `brandColor`: tee + capelli + headset shift sul colore primario dell'org (helper `shadeHex` per derivare dark/light tones). Ogni tenant ha un look leggermente diverso.
  - Prop `size`/`className` per render flessibile dentro qualsiasi cerchio o container.
- Fallback automatico in:
  - **`VendorLanding.js`** — hero avatar mostra il mascot quando `vendor.profile_image_url` è vuoto (prima la sezione era completamente nascosta).
  - **`VendorDashboard.js`** — preview "Foto profilo" mostra il mascot al posto dell'icona ImageIcon grigia placeholder.
- Verificato live su `/v/6a0c73f8fbb39d92c9f5edd8` (vendor "Danu" senza foto) → mascot arancione WindTre brand-coerente nell'hero ✅. Lint pulito.

---

## 2026-06-23 — Posts CTA: pill rounded come Store Landing (colore invariato)

- `.posts-cta` in `VendorLanding.css`:
  - `border-radius: 12px` → `9999px` (pill full).
  - `padding: 14px 24px` → `18px 24px` (match StoreLanding).
  - Aggiunto `text-transform: uppercase` + `letter-spacing: 0.06em` per coerenza tipografica con la CTA Store.
  - `box-shadow` più morbido e brand-tinted (`0 18px 38px -14px rgba(0,0,0,.35)`).
  - Aggiunto hover `filter: brightness(1.08)` (oltre all'active scale già presente).
- Gradient brand-color INVARIATO come richiesto dall'utente.
- Verificato live su `/v/6a0c73f2fbb39d92c9f5edd6` → "SCOPRI DI PIÙ" pill arancione WindTre coerente con stile Store Landing ✅.

---

## 2026-06-23 — BrandSocialIcon: aggiunti Google Maps + Hours per coerenza totale

- `BrandSocialIcon` ora supporta:
  - `platform="googlemaps"` → chip bianco + pin Google Maps rosso ufficiale (2020 refresh) con shadow rossa tenue.
  - `platform="hours"` → chip dark slate gradient (`#1f2937 → #0f172a`) con clock glyph bianco. Non un brand, ma stilizzato come premium chip per mantenere il ritmo visivo con gli altri.
- **StoreLanding.js**: card "Vieni a trovarci" usa il chip Google Maps brand (al posto del disco purple `--cta` con MapPin lucide). Card "Orari di apertura" usa il chip dark premium (al posto del disco purple con Clock).
- Rimossi import `MapPin, Clock` da lucide-react (non più usati).
- Verificato live: TUTTE le card (Recensioni / Mappe / Orari / Social) ora condividono la stessa estetica chip premium 56×56 ✅. Lint pulito.

---

## 2026-06-23 — BrandSocialIcon esteso: WhatsApp + Google brand-accurate

- `BrandSocialIcon` ora supporta `platform="whatsapp"` (gradient verde ufficiale `#25D366 → #128C7E` + chat-bubble glyph Meta) e `platform="google"` (chip bianco + logo G 4-colori 2023).
- `glyphOnly` esteso anche a Google (oltre TikTok) per supportare callsite che vogliono il glifo monocromatico in `currentColor`.
- **VendorLanding.js**: le card "Scrivici su WhatsApp" e "Lascia una recensione" ora usano i nuovi chip premium invece dei vecchi dischi monocromatici brand-color (verde WA al posto dell'arancione brand, G multicolor al posto del viola secondary).
- **StoreLanding.js**: la card "Leggi le recensioni" ora usa il chip Google brand al posto della stella ambrata. Rimosso import `Star` da lucide.
- Verificato live su Store + Vendor landing — coerenza totale brand-icon su WhatsApp / Google / Instagram / Facebook / TikTok ✅. Lint pulito.

---

## 2026-06-23 — Reusable BrandSocialIcon component + applicato a tutte le landing

- Nuovo componente `/app/frontend/src/components/BrandSocialIcon.js`:
  - `<BrandSocialIcon platform="instagram|facebook|tiktok" href={url} onClick={track} size={48} testId="..." />` → chip squircle 48×48 (configurabile) con gradient/colore ufficiale + glifo SVG inline + brand-tinted shadow + ring sottile + hover/active scale.
  - Modalità `glyphOnly`: renderizza solo il glifo monocromatico in `currentColor` (per uso dentro chip custom del chiamante).
  - Glifo Instagram con `<g>` wrapper per evitare conflitto col CSS legacy di VendorLanding `.card-icon svg > rect:first-of-type{display:none}`.
- Applicato in:
  - **`StoreLanding.js`** — sostituiti i 3 blocchi inline (≈70 righe) con 3 chiamate `<BrandSocialIcon/>`.
  - **`VendorLanding.js`** — i 3 card "Seguici Instagram", "Metti Like", "Seguici TikTok" ora usano lo stesso chip premium al posto del vecchio disco brand-color con icona stilizzata monocromatica.
- Look unificato tra le due landing pubbliche → quando un'org configura Instagram/FB/TT, l'icona ha la STESSA identità brand ovunque appaia.
- Verificato live su `/s/windtre-castelnuovo-del-garda` (Store) e `/v/6a0c73f2fbb39d92c9f5edd6` (Vendor) ✅. Lint pulito.

---

## 2026-06-23 — Social buttons premium (Instagram/Facebook/TikTok)

- Sostituiti i pulsanti lucide-react flat con SVG brand-accurati inline (no deps aggiuntive):
  - **Instagram**: gradient ufficiale corner-burst (yellow→red→magenta→blue), squircle 48×48 `rounded-2xl`, brand-tinted shadow rossa, glifo inline SVG (rect+cerchio+dot).
  - **Facebook**: linear gradient Meta 2023 refresh (`#1877F2 → #0a5fd1`), shadow blu, glifo "f" pieno.
  - **TikTok**: glifo triplo-layer (cyan + magenta offset + bianco top) → "double exposure" look ufficiale, sostituisce il vecchio testo "TT".
- Aggiunte micro-interaction: `hover:scale-[1.06]`, `active:scale-95`, `ring-1 ring-black/5` per profondità.
- Rimossi import `Instagram, Facebook` da lucide-react (non più usati).
- Verificato live: render brand-accurate su `/s/windtre-castelnuovo-del-garda` ✅.

---

## 2026-06-23 — Dirty-state indicator esteso ai Posts (Annunci)

- Stessa logica applicata a `Posts.js`: import `useDirtyForm` + `DirtyDot`, hook attivo su `!!editing` (modal open).
- Pulsante "Salva" / "Pubblica su N negozi" mostra `● ` prefisso ambrato quando il form ha modifiche non salvate.
- Verificato live: 0 dot all'apertura, 1 dot dopo modifica titolo ✅.

---

## 2026-06-23 — Dirty-state indicator sui pulsanti Salva (UX retention)

- Nuovo hook condiviso `frontend/src/hooks/useDirtyForm.js`:
  - `useDirtyForm(formData, active)` → returns `{isDirty, resetBaseline}`.
  - Snapshot iniziale via `JSON.stringify` solo quando `active` flippa a `true` (modal apertura), così ogni keystroke registra come dirty.
  - Componente `<DirtyDot/>` esportato: chip ambrato 6×6px con `animate-pulse`, inline col testo del bottone (`mr-1.5 align-middle`). Testid `dirty-form-dot`.
- Integrato in **Vendors.js**, **Stores.js**, **Landings.js**:
  - Bottone "Aggiorna"/"Crea"/"Salva landing" mostra `● ` prefisso quando ci sono modifiche non salvate.
  - Hook attivo solo finché il modal è aperto (basato su `isDialogOpen` / `!!editing`).
- **Test live** verificato: 
  - Apertura modal Vendors → 0 dot (snapshot baseline) ✅
  - Modifica `Nome` da "Giz" a "Giz X" → 1 dot ambrato visibile sul pulsante sticky ✅
- ESLint pulito, hot reload OK.

---



- **`Dialog primitive`** (`components/ui/dialog.jsx`):
  - `DialogContent`: `grid` → `flex flex-col`, width `w-[calc(100vw-1rem)]` (era `w-full max-w-lg` ambiguo su mobile), padding default `p-4 sm:p-6`, height `max-h-[calc(100dvh-2rem)]` con `100dvh` (gestisce correttamente la URL bar di iOS Safari). Selector `[&>form]:min-w-0` forza i form figli a non espandere il container. Risolve overflow horizontal causato da `<form>` block che ignorava il padding del genitore (bug: form width=359, dialog width=374 → form usciva dal dialog).
  - `DialogHeader`: aggiunto `min-w-0 [&>*]:break-words` → titoli e descrizioni lunghe vanno a capo invece di overflow.
  - `DialogFooter`: **STICKY BOTTOM** con `sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-2 bg-background border-t`. I pulsanti Salva/Annulla sono sempre raggiungibili senza scrollare l'intero form. Critical UX fix.
  - `DialogClose` (X): icona più grande su mobile (`h-5 w-5 sm:h-4 sm:w-4`), hit target più toccabile.
- **`HoursEditor.js`**: 
  - `DayCard` padding `p-3 sm:p-4` → `p-2.5 sm:p-4`. Aggiunto `min-w-0` sui flex/grid container per evitare time-input overflow.
  - Time `Input` con `w-full min-w-0 px-2 text-center` → si restringe correttamente nei card stretti.
  - Grid gap mobile `gap-2 sm:gap-3` su outer grid, `gap-1.5 sm:gap-3` su inner inputs.
  - Switch giorno con `flex-shrink-0` → label "Aperto"/"Chiuso" non spinge fuori il toggle.
- **Vendors.js** + **Stores.js** + **Landings.js**: rimossi i `w-[95vw] p-4 sm:p-6` ridondanti (ora vengono dal base) e adottati `w-[calc(100vw-1rem)] max-h-[88dvh] overflow-y-auto overflow-x-hidden`.
- **Vendors.js slug input**: aggiunti `min-w-0` su flex container e `flex-1 min-w-0` su Input + `flex-shrink-0` sui label `/v/` → il placeholder lungo non spinge il container fuori dal dialog.
- **Smoke test live**: dialog dimensioni misurate via DOM → dialog=374×?, form=340×? su viewport=390. Tutto contenuto. Pulsanti sticky verificati su 3 dialog (Vendor, Store, Landing). ✅

---


- **CTA WindTre-style** in `StoreLanding.js`: pill arrotondato (`rounded-full`), background solido configurabile via nuovo campo `landing_cta_color` (default = `org.primary_color`), uppercase con letter-spacing, no più gradient verde WhatsApp.
- **Privacy notice GDPR-compliant** sotto il pulsante CTA: linka l'`informativa privacy` dell'org (fallback `/s/<slug>/privacy`), cita esplicitamente il `legal_name` come titolare, dichiara la finalità del contatto. Conforme art. 13 GDPR ("informato prima del processing").
- **Cards info ridisegnate** (recensioni, mappa, orari): mirror del `.card` style di `VendorLanding.css` — disco icona 56×56 brand color, `text-[15px] font-bold` label, sublabel grigia, freccia `→` lucide. Hover effect → bordo colorato con `--cta`.
- **Backend** (`server.py`): aggiunto campo `landing_cta_color` su `StoreCreate` + `StoreResponse` (max 24 char). Persistito in create/update + propagato nel payload pubblico `/api/store-landing/{slug}`.
- **Editor admin** (`Landings.js`): color picker nativo + input hex + bottone Reset nella `FormSection "Pulsante CTA principale"`. Hint: "Suggerito per WindTre: viola `#6E2DE5`".
- **Pulsante "Copia link campagne"** sulle card store del pannello admin: icona Copy → toast con preview URL, feedback Check ✓ per 1.8 s, usa `store.landing_url` (custom domain quando disponibile) altrimenti `${origin}/s/<slug>`.
- **Smoke test live**: WINDTRE Castelnuovo del Garda con `landing_cta_color='#6E2DE5'` → screenshot conferma pulsante viola, notice, cards style, link a privacy `https://app.vdn.srl/v/.../privacy`. ✅

---

## 2026-06-23 — Store Landings su Custom Domain Org (parity con Vendor QR)

- **Backend** (`server.py`):
  - Nuovo helper `_effective_store_landing_url(store)` mirror di `_effective_landing_url` ma per stores: cerca il primo `vercel_domains` verificato dell'org (oldest first) e restituisce `https://<custom-domain>/s/<landing_slug>`. Fallback a `FRONTEND_URL/s/<slug>` o path relativo.
  - `StoreResponse`: aggiunto campo `landing_url` (read-only, computato).
  - Popolato in `GET /api/stores`, `POST /api/stores`, `PUT /api/stores/{id}` e nel payload pubblico `GET /api/store-landing/{slug}`.
  - `og_store_landing_preview` ora usa l'URL canonico per `og:url` e JSON-LD → crawler social vedono il dominio brand.
- **Frontend**:
  - `DomainGuard.js`: aggiunto `/s/` a `PUBLIC_PATH_PREFIXES`. Senza questo i custom domain (es. `app.vdn.srl/s/<slug>`) mostravano la courtesy page "Pagina non disponibile".
  - `Landings.js`: il pulsante "Apri landing pubblica" (occhio) e il link "Anteprima /s/<slug>" nell'editor ora usano `store.landing_url || /s/<slug>`.
- **Smoke test backend**:
  - `app.vdn.srl` org (verified) + store `windtre-castelnuovo-del-garda` → `landing_url = https://app.vdn.srl/s/windtre-castelnuovo-del-garda` ✅
  - Org senza custom domain → fallback `/s/<slug>` ✅
  - Vendor `_effective_landing_url` continua a funzionare (regressione zero) ✅
- **Rimosso badge "WINDTRE" overlay** dall'angolo top-left dell'immagine hero in `StoreLanding.js` su richiesta utente.

---


## 2026-06-22 — Version pill in Super Admin: "Quale codice è davvero LIVE su prod"

- **Backend** (`routers/deploy.py`):
  - Prima di invocare `flyctl deploy`, il job scrive `/app/backend/_deploy_info.json` con `commit_sha`, `commit_subject`, `commit_iso` (da `git log -1`), `deployed_at`, `deployed_via`. Il file viene packagato dentro l'image fly → ogni release porta DENTRO la propria firma.
  - Modulo `deploy.py` legge il file una sola volta al boot (`_CACHED_DEPLOY_INFO`). Fallback per preview/dev: legge git direttamente; se nemmeno quello funziona ritorna `source='missing'`.
  - Nuovo endpoint `GET /api/deploy/version` (super_admin only) restituisce il dict.
- **Frontend** (`Settings.js`):
  - Pill verde "Versione attiva: `abc1234` 'commit subject' deployato 22/06/2026 18:30 — src: stamped" sopra i bottoni deploy.
  - Refetch automatico 6 secondi dopo il completamento di un deploy → la pillola si aggiorna senza reload manuale.
- **.gitignore**: aggiunto `backend/_deploy_info.json` per non sporcare i commit con il timestamp di ogni deploy.
- **Verificato**: endpoint risponde 401 senza auth, 200 con super_admin. Sul preview il source è `git` (legge il working tree); in prod sarà `stamped` (legge il file packed).

---

## 2026-06-22 — Badge "Store Manager" visibile sui vendor card

- `Vendors.js`: aggiunto pill badge ambrato "STORE MANAGER" inline col nome quando `vendor.store_role === 'manager'`. Tooltip esplicativo, ring sottile per profondità, dark mode supportata.
- Specialist NON hanno alcun badge → look pulito, il manager è subito riconoscibile a colpo d'occhio.
- Verificato via Playwright: 1 badge presente su `QA Manager Test`, 0 badge su `QA Specialist Test` e `QA Specialist Two`.

---

## 2026-06-22 — RBAC Store Manager / Specialist + team analytics picker

- **Nuovo campo `store_role` sui vendor** (`'specialist'` default per back-compat, `'manager'` per chi guida il negozio). Vendors esistenti NON modificati — fallback runtime `.setdefault('store_role','specialist')`.
- **Backend** (`server.py` + `routers/analytics.py`):
  - `VendorCreate`/`VendorUpdate`/`VendorResponse` estesi con `store_role`.
  - Nuovo helper `_resolve_vendor_scope(query_vendor_id, me)` — checks: specialist non può scope su altri (403), manager solo dentro lo stesso store (403 cross-store) + stesso tenant (403 cross-tenant).
  - Nuovo endpoint `GET /api/vendor/team` → restituisce membri dello store quando il caller è manager, altrimenti solo se stesso.
  - `GET /api/vendor/stats`, `GET /api/vendor/analytics/detailed`, `GET /api/vendor/analytics/export/pdf` accettano `?vendor_id=` opzionale + auth via `_resolve_vendor_scope`.
- **Frontend**:
  - `Vendors.js`: nuovo Select "Ruolo nel negozio" (Specialist / Manager) in dialog create/edit. Pre-fills da vendor esistente. Inviato in payload PUT/POST.
  - `VendorDashboard.js`: se manager con team ≥ 2, mostra banner ambra "Vista Store Manager" con dropdown `manager-team-select`. Switch → analytics rifetched. Specialist non vede il banner. Profilo restano sempre scoped a se stesso.
  - `AnalyticsDetailed.js`: nuovo prop `targetVendorId` che, in vendor mode, propaga `vendor_id` query param sia per le metric che per il PDF export.
  - `BadgePrintDialog.js`: pre-select Radio role da `vendor.store_role` (manager → "Store Manager", default Specialist, free-form → custom).
- **Sicurezza testata via curl**:
  - Manager → stats teammate stesso store: 200 ✓
  - Specialist → stats di un altro: 403 "Solo i manager possono…" ✓
  - Manager → stats cross-store (vendor di altro org): 403 "Il venditore non appartiene al tuo negozio" ✓
- **E2E** verificato via Playwright: login manager → dashboard → banner manager visibile → dropdown con 3 opzioni (manager + 2 specialist) → switch ad uno specialist → analytics refetched per quel vendor.
- **Zero data loss** — nessun delete su `users`/`vendors`/`analytics`, solo additive fields.

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
