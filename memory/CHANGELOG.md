# QRHub — Changelog

> Storico completo delle modifiche. Per il backlog futuro vedi `ROADMAP.md`.

---

## 2026-06-01 — Mobile UX restyling + Auto theme + Secondary colors + Brand cleanup

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
