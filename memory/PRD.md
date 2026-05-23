# QRHub – PRD (Product Requirements Document)

> Repo: https://github.com/vdndeploy/qrhub_deploy  
> Produzione: https://qrhub-app.vercel.app (frontend) + https://qrhub.fly.dev (backend)  
> Cluster: MongoDB Atlas `clustervdn.dp4u4fo.mongodb.net` / DB `qrhub_vendor_db`

## Problema originale dell'utente

> "continuiamo a fissare questo progetto è già in produzione su vercel, fly.io, cloudinary e mongodb con utenti registrati"

Il progetto **QRHub** è una piattaforma multi-tenant open source (MIT) che permette ai venditori di generare landing page con QR code, gestire post a carosello, analytics, branding per cliente e deploy integrato.

## Architettura

- **Backend**: FastAPI + Motor (Mongo async) — singolo file `backend/server.py`
- **Frontend**: React 19 + CRACO + Tailwind + shadcn/ui — `frontend/`
- **DB**: MongoDB Atlas (cluster `clustervdn`)
- **Storage media**: Cloudinary (vedi env `CLOUDINARY_CLOUD_NAME`)
- **Hosting**: Fly.io (app `qrhub`, region `fra`) + Vercel (project `prj_wu9KqzoRLxTYRy6Lij9msfOg3ko1`)
- **Dominio prod frontend**: https://qrhub-app.vercel.app

## User personas

1. **Super Admin** (creatore piattaforma) — gestisce organizzazioni tenant, deploy, secrets
2. **Org Admin** (cliente azienda) — gestisce i suoi negozi, venditori, post, branding, dati privacy
3. **Vendor** (venditore) — ha un proprio QR + dashboard read-only delle metriche del proprio QR
4. **Utente finale** (visitatore landing) — scansiona QR e arriva sulla landing del venditore

## Core requirements (statici)

- Multi-tenant con `organization_id` su ogni record
- Landing page pubbliche `/v/:vendorId` con branding per-org
- Cookie tecnici only (no profiling)
- GDPR-first (no PII utenti finali, analytics aggregati)
- Hosting free-tier sostenibile (≤256MB RAM, 512MB DB, 25 credits Cloudinary/mese)
- Open source MIT, no-profit


### 2026-05-23 (notte) — Fix bug salva-orari + Open-now badge real-time

- **Fix critico save orari** (`backend/server.py`): `create_store` e `update_store` mancavano dei campi `hours`, `hours_text`, `address`, `phone` nel `store_doc` → salvataggi senza effetto. Aggiunti tutti, con conversione `StoreHoursDay.model_dump()` → dict per Mongo. Test: PUT con structured hours su WINDTRE Castelnuovo del Garda → vendor risponde `hours.mon = {open:'09:00', close:'19:30', break_start:'13:00', break_end:'15:00'}`.
- **HoursEditor ridisegnato** (`components/HoursEditor.js`): da grid stretto a 7 card per giorno (Lun-Dom), grid responsive 2 colonne desktop. Toggle Switch shadcn al posto di Checkbox (più moderno), input time con label sopra, pausa pranzo collassata con bottone "+ Aggiungi pausa pranzo" (default smart 13-15). Shortcut "Copia Lun → Mar-Ven" e "Tutti chiusi" come pill buttons.
- **Open-now badge real-time** (`components/HoursEditor.js` `computeOpenStatus()`): pure function che dato `hours` strutturato e `now` ritorna `{status, label, detail}` con 4 stati: `open` (verde, pulse), `closing_soon` (≤30min, giallo), `opening_soon` (≤60min al primo open futuro, giallo), `closed` (rosso, con "Apre domani/lunedì alle X"). Considera anche la pausa pranzo. Tick ogni 60s.
- **VendorLanding integrazione**: 
  - Pulsante Store sulla landing mostra un puntino colorato (verde/giallo/rosso) in alto a destra dell'icona, leggibile a colpo d'occhio.
  - Modal store apre con badge prominente "Aperto adesso · Chiude alle 13:00" e tabella settimanale 7 righe con giorno corrente in bold + "oggi" in colore.
  - Fallback: se `hours` non disponibili ma `hours_text` esiste, mostra il testo libero.
  - Keyframes `pulse` aggiunti a `VendorLanding.css`.

- **Audit log**: nuovo `db.audit_log` con entries `{id, timestamp, action, actor_email, actor_role, organization_id, target_type, target_id, target_label, metadata}`. Endpoint `GET /api/audit` (tenant-scoped, super admin vede tutto). Nuova pagina `/dashboard/audit` (`pages/Audit.js`) con tabella e nav link (Shield icon). Il reset analytics vendor ora scrive entry nell'audit.
- **Structured opening hours** (Google-Business style): nuovo `StoreHoursDay` model con `closed/open/close/break_start/break_end` per ogni giorno. Componente `<HoursEditor>` (`components/HoursEditor.js`) con 7 righe (Lun-Dom) e input `type=time`. Frontend genera automaticamente `hours_text` come fallback umano (es. "Lun-Ven: 09:00-13:00 / 15:00-19:30") tramite `formatHoursText()` con grouping di giorni consecutivi identici. Backend serve sia `hours` (structured) sia `hours_text` (string).
- **AnalyticsDetailed ridisegnata**: KpiCard e Card con `rounded-3xl` + halo gradient blur, palette uniformata (lime `#D2FA46` + soft purple `#9B7BFF` + soft palette per pie charts), tooltip custom morbido condiviso (`SoftTooltip`), LineChart con `strokeWidth=2.5` e `activeDot`, BarChart con barre `radius=8` e `maxBarSize=14`, PieChart con `innerRadius=50` (donut) + `paddingAngle=3`. Niente più CartesianGrid o axis lines.
- **Log Eventi Recenti collassabile**: wrapped in shadcn `Collapsible`, default chiuso, header con count + chevron, contenuto scrollable `max-h-[60vh]`. Riduce drasticamente l'altezza percepita della pagina.
- **Landing store button**: il pulsante "Store" sulla landing ora compare ogni volta che il negozio ha un `name`, indipendentemente dagli orari (prima richiedeva almeno `hours_text` o `name`).
- **Performance**: animazione Bar Recharts da 650ms → 250ms, halo `blur-2xl` → `blur-xl` (riduce GPU load sul tab switch).


### 2026-05-23 — Tenant isolation + Marketing landing + Store simplification + Dark theme

- **Tenant-only landing enforcement** (`pages/VendorLanding.js`): le landing `/v/:vendorId` ora vengono servite ESCLUSIVAMENTE sul `canonical_host` configurato dall'org. Su `qrhub.it`, `qrhub-app.vercel.app` e qualunque altro host non-canonical viene mostrato uno schermo dedicato "Landing non disponibile su questo dominio". Test hosts (localhost, *.preview.emergentagent.com, *.emergent.host) continuano a renderizzare per QA.
- **Blocked screen ridisegnato**: dark + lime neon glow + logo QR + CTA per tornare al marketing. Coerente con la nuova palette.
- **Marketing landing live su `/`** (`pages/Marketing.js` ora cablato in `App.js`): riprogettata con palette **dark + lime neon** (`#D2FA46`), stile distintivo con nav pill sticky, grid background, hero con parola-chiave in muted gray, mock QR card, feature grid 3x2, access cards org/vendor. CSS scopato sotto `.marketing-root` per evitare collisioni con `VendorLanding.css`.
- **Store info semplificato** (`pages/Stores.js` + modal in `VendorLanding.js`): scheda "Store" sulla landing ora mostra solo nome negozio + orari. Rimossi address/phone/maps (mappa già disponibile come pulsante separato, telefono escluso per favorire WhatsApp).
### 2026-05-23 — Theme toggle + NextUI-style charts + Vendor analytics reset + Media filter & orphan fix

- **prefers-color-scheme rispettato** (`hooks/useTheme.js`): al primo accesso (senza valore in localStorage) il tema parte dal `prefers-color-scheme` di sistema. Dopo qualsiasi click sul toggle la preferenza dell'utente prevale.
- **Grafici Overview ridisegnati** (`pages/Overview.js`): Recharts con barre arrotondate (`radius={[10,10,10,10]}`), `barSize` ridotto a 22 per look "gommoso", colore secondario aggiornato a soft purple `#9B7BFF`, tooltip custom morbido (rounded-2xl + ombra + dot color indicator), no grid lines, no axis lines, legenda inline minimal. StatCard ora con halo gradient blur, rounded-3xl e padding maggiore (estetica NextUI / Linear).
- **Reset analytics venditore** (backend `POST /api/vendors/{vendor_id}/analytics/reset` in `server.py` + UI in `pages/Vendors.js`): nuovo pulsante "RotateCcw" giallo per ogni venditore, conferma con dialog, cancella `db.analytics.delete_many({vendor_id})` senza toccare il venditore. Utile quando si riassegna il QR. Risposta include `deleted_count` mostrato nel toast.
- **Fix filtro Media** (`routers/media.py`): il filtro `?folder=uploads|posts` ora matcha sul campo `kind` (valore semplice) invece del campo composito `folder='org_<id>/<kind>'` che non corrispondeva mai. Bug latente da quando il path Cloudinary è stato namespaceato.
- **Orphan detection corretta** (`routers/media.py`): `list_files`, `delete_file` e `bulk_delete_files` ora usano `_compute_in_use_sets()` che include anche `vendor.profile_image_url` e `organization.logo_url`. Le foto profilo venditori e i loghi org NON appaiono più tra gli orfani e sono protetti server-side contro la cancellazione (HTTP 409 / "in_use_protected" nel bulk).

## What's been implemented (cronologia in questo workspace)

### 2026-05-17 — sessione di hardening

| Data | Modifica | Stato |
|---|---|---|
| 2026-05-17 | Clone repo `vdndeploy/qrhub_deploy` in `/app` + install deps + supervisor up | ✅ |
| 2026-05-17 | Connessione locale al DB di produzione (`qrhub_vendor_db`) | ✅ |
| 2026-05-17 | **Rinomina DB**: `windtre_vendor_db` → `qrhub_vendor_db` (copy + Fly secret update + verify + drop old) | ✅ deployato |
| 2026-05-17 | **Bug fix `/api/deploy/fly/redeploy`**: era `/restart` → `POST /machines/{id}` per applicare secret staged | ✅ v12 |
| 2026-05-17 | **GDPR Sprint 1 (CRITICAL)** | ✅ v13 |
| 2026-05-17 | - C1: IP raw in `geo_cache` → `subnet` anonimizzata (`/24` IPv4, `/48` IPv6); pulizia 3 IP legacy; testo Legal.js allineato | ✅ |
| 2026-05-17 | - C2: tenant scoping su `/api/analytics/export/pdf` (era bypass-abile cross-tenant) | ✅ |
| 2026-05-17 | **GDPR Sprint 2 (HIGH H1/H4/H5/H7)** | ✅ v14 |
| 2026-05-17 | - H1: rate-limit login (5 tentativi / 15 min) | ✅ |
| 2026-05-17 | - H4+H7: endpoint `/api/vendors/{id}/privacy-info` + pagina pubblica `/v/:vendorId/privacy` | ✅ |
| 2026-05-17 | - H5: cookie banner sempre visibile + link privacy obbligatorio | ✅ |
| 2026-05-17 | - Campi privacy in OrgSettings (legal_name, vat, address, email, policy_url) | ✅ |
| 2026-05-17 | **GDPR Sprint 3 (HIGH H2/H3/H6 — diritti dell'interessato)** | ✅ v15 |
| 2026-05-17 | - H2: `GET /api/me/data-export`, `DELETE /api/me`, vendor counterparts | ✅ |
| 2026-05-17 | - H3: `POST /api/me/revoke-all-sessions` (token_version JWT, retrocompatibile) | ✅ |
| 2026-05-17 | - H6: DPA accept flow (`/dashboard/dpa` + banner pending al primo login) | ✅ |
| 2026-05-17 | - UX: badge "GDPR completeness" in OrgSettings (0-100%, indica campi titolare mancanti) | ✅ |
| 2026-05-17 | - Pagina /dashboard/account con export, revoke, delete account | ✅ |
| 2026-05-17 | **GDPR Sprint 4 (MEDIUM batch)** | ✅ v16 |
| 2026-05-17 | - M1: Cloudinary folder tenant-prefisso (`org_{id}/uploads` o `platform/uploads` per super admin) | ✅ |
| 2026-05-17 | - M2: Security headers middleware (HSTS, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy=strict-origin-when-cross-origin, Permissions-Policy, CSP `frame-ancestors none`) | ✅ |
| 2026-05-17 | - M3: Retention TTL analytics 365gg + cleanup `login_attempts` ad ogni startup | ✅ |
| 2026-05-17 | - M4: Warning critico se `JWT_SECRET` < 32 byte all'avvio | ✅ |
| 2026-05-17 | - M5: Sezione "Trasferimenti extra-UE e SCC" su Legal.js con dettagli per ogni sub-processor (Fly EU-only, Cloudinary US+SCC+DPF, Atlas SCC, Vercel SCC, ipapi EU) | ✅ |
| 2026-05-17 | - M8: Redaction email nei log applicativi (`a***n@example.com` invece di email piena) | ✅ |
| 2026-05-17 | - **Trust badge "Titolare verificato"** sulla landing pubblica + pagina privacy quando l'org ha tutti i 4 campi compilati (pill verde→emerald per completo) | ✅ |
| 2026-05-18 | **Deploy Sprint 3+4 frontend su Vercel** | ✅ live |
| 2026-05-18 | - Risolto problema link Vercel→GitHub: project era ancora linkato al vecchio repoId (`1241334458` = `qrhub_deploy_old`); ricollegato al nuovo (`1242094536` = `qrhub_deploy`) | ✅ |
| 2026-05-18 | - Verificato in produzione su `qrhub-app.vercel.app`: privacy page, trust badge "Titolare verificato" gradient (org completo), cookie banner, footer privacy link, tutte le pagine Sprint 3+4 | ✅ |
| 2026-05-18 | **DNS Domini personalizzati — istruzioni live da Vercel** | ✅ Fly v17 |
| 2026-05-18 | - Backend: nuova fn `_vercel_domain_config()` chiama `GET /v6/domains/{d}/config` per ottenere `misconfigured`, `recommendedCNAME`, `recommendedIPv4`, `cnames/aValues/conflicts` attuali. Enriched in `list_org_domains`, `add_org_domain`, `domain_status`, `verify_domain`. | ✅ |
| 2026-05-18 | - Frontend `DomainCard`: tre stati visivi (Online / DNS da configurare / In attesa proprietà). Mostra il CNAME personalizzato live (es. `e854f2fb2060c538.vercel-dns-017.com`) con copy button per ogni valore, dettagli espandibili sui DNS pubblici attuali e box conflitti. Risolve l'inganno "Verificato" quando l'ownership Vercel è ok ma i record CNAME/A non puntano ancora. | ✅ |
| 2026-05-18 | - Deploy backend su Fly: `qrhub:deployment-...` (machine 683e161a19d528 v17 healthy). Frontend pendente push utente. | ✅ |
| 2026-05-19 | **Hotfix `/dashboard/organizations` pagina bianca** — JS error `handleEditSave is not defined` dopo la sessione precedente che aveva aggiunto la UI di edit org senza i relativi handler. Aggiunte `openEdit()` e `handleEditSave()` in Organizations.js. Pencil icon ora apre il dialog correttamente. | ✅ verificato local |
| 2026-05-19 | **Landing page UX + QR custom domain + page title** | ✅ Fly v18 |
| 2026-05-19 | - Header landing: rimosso `Il tuo consulente {brand_name}` hardcoded → nuovo campo `landing_headline` (org-level, max 140 chars) editabile da OrgSettings. Default: "Il tuo consulente di fiducia". | ✅ |
| 2026-05-19 | - Pulsante "Condividi" affianco alla mappa (Web Share API + fallback clipboard + toast inline). Traccia evento `share_click` in analytics. | ✅ |
| 2026-05-19 | - QR code ora usa il dominio custom verificato se presente (es. `https://app.vdn.srl/v/{id}`). Nuovo helper backend `_effective_landing_url()` + `landing_url` esposto in `VendorResponse`. Dialog QR mostra il link reale + pulsanti "Apri link" / "Copia link" + warning verde se usa dominio custom. | ✅ |
| 2026-05-19 | - `<title>` del browser: index.html → `"QRHub — Pannello Amministratore"` (era "Emergent | Fullstack App"). `VendorLanding.js` imposta dinamicamente `document.title = "{Vendor} · {Brand}"`. | ✅ |
| 2026-05-19 | **Security audit — bonifica credenziali dal repo** | ✅ in attesa di push |
| 2026-05-19 | - Rimossi i secret in chiaro da `GUIDA.md`, `README.md`, `backend/tests/*.py`, `frontend/src/pages/Settings.js` (placeholder), `memory/PRD.md`, `test_reports/iteration_*.json` | ✅ |
| 2026-05-19 | - `backend/server.py`: rimossi i default `'admin123'` / `'changeme123'`. Seed super-admin e org-admin ora si attivano SOLO se le env `SUPERADMIN_PASSWORD` / `ADMIN_PASSWORD` sono definite (no auto-bootstrap con password deboli). | ✅ |
| 2026-05-19 | - `/app/memory/test_credentials.md` rigenerato a ogni boot ora contiene SOLO l'email + il nome dell'env var (mai la password in chiaro). | ✅ |
| 2026-05-19 | **OG/Twitter card per anteprima social** (WhatsApp/Telegram/FB/LinkedIn) — risolve `<title>` errato in anteprima | ✅ Fly v20 |
| 2026-05-19 | - Backend: nuovo endpoint `GET /og/v/:vendorId` server-rendered con tag OG/Twitter (title `"{vendor} · {brand}"`, descrizione da bio, image da `profile_image_url` se enabled altrimenti `org.logo_url`, theme_color = primary_color). Include redirect `meta http-equiv=refresh` + JS verso `/v/:id` per fallback umano. | ✅ |
| 2026-05-19 | - `frontend/vercel.json`: rewrite condizionale via header `User-Agent` matcher (whatsapp, telegram, facebook, twitter, linkedin, slack, discord, pinterest, googlebot, ecc.) → quando un crawler chiede `/v/:id`, Vercel proxy verso `qrhub.fly.dev/og/v/:id`. Browser umani continuano a vedere la SPA normalmente. | ✅ |
| 2026-05-19 | - Risolve il task `OG-1` del backlog. | ✅ |
| 2026-05-21 | **Media Library (galleria foto Cloudinary multi-tenant)** | ✅ Fly v21 |
| 2026-05-21 | - Backend: 3 nuovi endpoint sotto `/api/media` (list, stats, delete) con dual auth `get_current_user_or_vendor`. Tenant isolato via `org_{id}/*` Cloudinary folder. Admins vedono `uploads`+`posts`; venditori vedono solo `uploads` e cancellano solo le proprie (`uploaded_by_id`). | ✅ |
| 2026-05-21 | - `db.files` arricchito con `kind`, `uploaded_by_id`, `uploaded_by_principal`. Backfill automatico al boot per i file storici (derivato dal path Cloudinary). | ✅ |
| 2026-05-21 | - Protezione: DELETE refusa se il media è referenziato da un post o foto profilo (409 + messaggio chiaro). `in_use` calcolato da `posts.media_public_id`, `stores.post_media_public_id`, `vendors.profile_image_url`, `organizations.logo_url`. | ✅ |
| 2026-05-21 | - Frontend: nuovo componente `<MediaPicker>` modale griglia con tab Foto profilo / Immagini post, search per filename, paginazione 60/pag, badge "in uso/libera", "Usa" / "Elimina" inline con hover overlay. Stats footer ("12 file · 3.2 MB"). | ✅ |
| 2026-05-21 | - Integrato in `VendorDashboard.js` (bottone "Scegli dalla libreria" accanto al carica foto profilo, kind=uploads, hidePostsTab) e in `PostsManager.js` (kind=posts). | ✅ |
| 2026-05-21 | - Risparmio Cloudinary: stessa foto profilo riusabile su account venditore multipli; stessa immagine annuncio riusabile su negozi multipli. | ✅ |
| 2026-05-21 | **Logo Org customizzabile + pagina Media completa** | ✅ Fly v22 |
| 2026-05-21 | - **Logo SVG WINDTRE hardcoded RIMOSSO** da `VendorLanding.js`. Ora la landing pubblica usa `vendor.organization.logo_url` se presente, altrimenti un fallback brandizzato (pill con brand_name + primary_color). | ✅ |
| 2026-05-21 | - `Organizations.js` (super admin): Create + Edit org dialog hanno ora upload logo con preview live (16x16 thumb + bottone Carica/Cambia/Rimuovi) + campo `brand_name`. Validazione client: solo image/* max 5MB. | ✅ |
| 2026-05-21 | - **Pagina `/dashboard/media`** (alias di `/dashboard/files` + rinominato in nav "Media"): aggiunto banner 4 stats card (totale, foto profilo, post, orfani con shortcut "→") + lightbox click-to-zoom su ogni thumbnail con metadata + delete inline. | ✅ |
| 2026-05-21 | **Custom vendor slug + cambio password + GDPR M6** | ✅ Fly v23 |
| 2026-05-21 | - **Vendor slug personalizzato**: nuovo campo `slug` (a-z0-9-, max 64) su `vendors`. URL `/v/gizwindtre` ora risolto come `/v/<uuid>` (entrambi funzionano per compatibilità con QR già stampati). Indice unique su `vendors.slug` (partial, escludendo stringhe vuote). | ✅ |
| 2026-05-21 | - `_resolve_vendor_doc()` helper centralizzato: usato da `/api/vendors/{id}`, `/og/v/{id}`, `/api/analytics` (canonical_vid mapping per integrità report). | ✅ |
| 2026-05-21 | - Frontend `Vendors.js`: input "Link personalizzato" con prefisso URL + sanitizzazione lato client + helper text. `_effective_landing_url`, OG endpoint, QR generation usano lo slug se presente. | ✅ |
| 2026-05-21 | - **Cambio password self-service**: `POST /api/me/password` con verifica password attuale, bump `token_version` (kick out altre sessioni), refresh cookie attivo. Sezione UI in `MyAccount.js` con form 3-campi. | ✅ |
| 2026-05-21 | - **GDPR M6** (data minimization): aggiunto `Field(..., max_length=N)` su `LoginRequest`, `StoreCreate`, `VendorCredentials`, `OrganizationCreate`, `OrganizationUpdate`, `OrgUserCreate`, `PasswordChangeRequest`. Validazione 422 client-friendly. | ✅ |
| 2026-05-21 | - Sezione "Cambia email" placeholder UI (richiede integrazione email service Resend/SMTP, da configurare separatamente). | 🟡 stub |
| 2026-05-21 | **Refactor `server.py` → router modulari (Fase 1)** | ✅ Fly v24 |
| 2026-05-21 | - `server.py`: 3752 → 2538 righe (-32%). 3 nuovi moduli in `/app/backend/routers/`. | ✅ |
| 2026-05-21 | - `routers/deploy.py` (536 righe) — 8 endpoint Fly/Vercel/rotate-credentials/uptime | ✅ |
| 2026-05-21 | - `routers/media.py` (349 righe) — 7 endpoint upload/files/media library | ✅ |
| 2026-05-21 | - `routers/analytics.py` (467 righe) — 6 endpoint analytics + PDF export | ✅ |
| 2026-05-21 | - Late-binding pattern (`from server import ...` con `app.include_router()` a fondo file) per evitare circular imports. Logger spostato in cima a server.py. Tutti i 61 endpoint OpenAPI registrati e testati live su Fly. | ✅ |
| 2026-05-22 | **Platform primary domain (qrhub.it) — multi-tenant host isolation** | ✅ Fly v25 |
| 2026-05-22 | - Backend: nuovi 5 endpoint sotto `/api/platform/*`: GET/PUT/DELETE `primary-domain`, POST `primary-domain/verify`, GET `config` (pubblico no-auth). Registra automaticamente il dominio su Vercel API riusando i helper esistenti. DNS instructions live dall'API Vercel. | ✅ |
| 2026-05-22 | - Collection MongoDB `platform_settings` (single doc `_id: 'platform_domain'`). | ✅ |
| 2026-05-22 | - Frontend `<DomainGuard>` component: legge `/api/platform/config` al boot, controlla `window.location.hostname` contro `primary_domain` + `admin_hosts_allowlist` + `admin_host_suffixes` (`.preview.emergentagent.com`, `.vercel.app`, `.emergent.host`). Su tenant custom domain reindirizza tutto fuorché `/v/*` al primary domain. | ✅ |
| 2026-05-22 | - Super Admin UI: nuovo tab "Dominio" (👑 icona corona, primo nel set di tab) con form registrazione + verifica DNS + istruzioni copy-paste per Aruba/Cloudflare. | ✅ |

## Prioritized backlog

### P0 — DA FARE PRIMA DI DICHIARARE PRODUCTION GDPR-READY

| ID | Task | Effort |
|---|---|---|
| H2 | Endpoint GDPR per utenti: `GET /api/me/data-export`, `DELETE /api/me`, `POST /api/me/revoke-all-sessions` | ~3h |
| H3 | Session revoke server-side (token_version su user) | ~1h |
| H6 | DPA template + accept flow per org_admin al primo login | ~2h |

### P1 — MEDIUM (entro 1 mese)

| ID | Task | Effort |
|---|---|---|
| OG-1 | **Open Graph / Twitter card dinamica** per ogni landing `/v/:vendorId` (anteprima ricca su WhatsApp/Telegram/LinkedIn con foto profilo + nome venditore + brand). Endpoint backend che renderizza un'immagine 1200×630 + meta tags injected via SSR helper. | ~3h |

| ID | Task | Effort |
|---|---|---|
| M1 | Cloudinary folder tenant-prefixed (`org_{id}/uploads`, `org_{id}/posts`) | ~1h |
| M2 | Security headers middleware: HSTS, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy, CSP base | ~1h |
| M3 | Retention policy analytics: TTL index su `timestamp` (365 giorni) o cron mensile | ~1h |
| M4 | Enforcement `JWT_SECRET` ≥32 byte all'avvio | ~15min |
| M5 | Sezione "Trasferimenti extra-UE e SCC" su Legal.js + region Atlas/Cloudinary reali | ~30min |
| M6 | `max_length` su tutti i Pydantic model + escape HTML/DOMPurify sui campi user-content | ~2h |
| M7 | CSRF token su mutating endpoints (o switch a `samesite=strict`) | ~2h |
| M8 | Redaction email nei log (helper `_log_user`) | ~30min |

### P2 — LOW / nice-to-have

| ID | Task | Effort |
|---|---|---|
| PWA | Service worker + manifest per landing (richiesta utente, in coda) | ~2-3h |
| L1 | Fix link GitHub in Legal.js → repo reale | ~5min |
| L2 | Versioning consent cookie (date + version) | ~30min |
| L3 | Tabella `consent_records` server-side | ~1h |
| L4 | Granularità UA ridotta a family-only | ~15min |
| L5 | Privacy scrub schedulato giornaliero | ~30min |
| Code | Split `server.py` (2800+ righe) in router modulari (auth, vendors, organizations, analytics, gdpr, deploy) | ~4h |
| RL | Rate limit: split (email+ip) vs (ip-only) per evitare lockout su NAT | ~30min |
| RL | TTL index su `login_attempts.ts` invece di cleanup opportunistico | ~15min |

## Next action items (proposti per la prossima sessione)

1. **Sprint 3 GDPR**: H2 (endpoint GDPR utente) + H3 (session revoke) + H6 (DPA flow) — completa la copertura "diritti dell'interessato"
2. **Sprint 4 GDPR**: tutti i medium M1-M8 in un batch (refactor sicurezza)
3. **PWA**: service worker per landing offline-first (richiesta originale dell'utente, in coda)

## Note tecniche operative

- Locale Emergent connesso al DB di produzione. Ogni modifica dati impatta produzione → cautela
- `ADMIN_EMAIL` in `/app/backend/.env` è impostato a `local-dev@qrhub.local` per evitare che il seed sovrascriva la password reale di `admin@example.com`
- Fly secrets in sync: deploy via `flyctl deploy --remote-only` dal pod (token già in `db.config.flyio_api_key`)
- Vercel deploy: gestito direttamente dall'utente via "Save to GitHub" → push automatico
