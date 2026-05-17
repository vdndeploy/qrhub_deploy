# QRHub – GDPR Audit & Gap Analysis

**Data audit:** 2026-05-17  
**Versione:** 1.0  
**Scope:** intera piattaforma multi-tenant (backend FastAPI + frontend React + landing page pubbliche)  
**Modalità:** read-only — no codice modificato

---

## A. COMPLIANCE SUMMARY

| Dimensione | Stato |
|---|---|
| **GDPR Ready per produzione?** | 🟠 **PARTIAL** — base solida ma con almeno 2 issue **CRITICI bloccanti** e un mismatch tra privacy policy dichiarata e codice reale |
| Documenti legali | 🟠 partial — 1 pagina note legali, mancano Privacy Policy formale, ToS, DPA |
| Multi-tenant isolation | 🟠 partial risk — `_tenant_filter` ben usato, ma 1 endpoint critico bypassa |
| Auth | 🟡 ok-ish — JWT 24h, bcrypt, ma nessun rate-limit né revoke |
| Diritti interessato (export/erasure) | 🔴 missing — nessun endpoint GDPR |
| Cookie/tracking | 🟢 quasi compliant — solo cookie tecnici + banner opzionale per-tenant |
| Subprocessor SCC / data residency | 🟠 partial — citati ma SCC non menzionate |
| Security headers | 🔴 missing — no HSTS/CSP/X-Frame-Options |

---

## B. RISK MAP

### 🔴 CRITICAL (blocking launch / fonte di sanzione)

| # | Gap | Dove | Impatto |
|---|---|---|---|
| **C1** | **Mismatch dichiarazione vs codice: IP utenti finali sono salvati per 7 giorni in `geo_cache`**, mentre il file `Legal.js` riga 91 dichiara "Indirizzi IP… poi scartati" | `server.py:1474-1498` + `geo_cache` collection | Privacy policy ingannevole → **violazione art. 13 GDPR (informativa scorretta)** + falso art. 5(1)(a) (liceità, correttezza, trasparenza). Sanzione fino a 4% fatturato globale (qui irrilevante perché no-profit, ma comunque illecito) |
| **C2** | **Cross-tenant data leak via PDF export**: `/api/analytics/export/pdf` autentica l'utente ma NON applica `_tenant_filter`. Un org_admin di Org A può richiedere `vendor_id` di Org B e ottenere il PDF con metriche/città/device degli utenti finali di un'altra organizzazione | `server.py:1739-1742` | Violazione art. 32 GDPR (sicurezza), confidenzialità multi-tenant compromessa, possibile data breach notificabile ex art. 33 |

### 🟠 HIGH PRIORITY

| # | Gap | Dove | Impatto |
|---|---|---|---|
| **H1** | Nessun rate-limiting su `/auth/login` e `/vendor-auth/login` → brute force banale (3 utenti reali in prod, password 12 char) | `server.py:338, 1364` | Account takeover, NIS2/art. 32 GDPR |
| **H2** | Nessun endpoint **diritto alla portabilità** (art. 20) né **diritto all'oblio** (art. 17) per utenti finali, vendor o admin. Solo "elimina organizzazione" lato super admin (cascade fa cleanup). Nessun export JSON dati personali | server.py | Mancato adempimento art. 15/17/20 GDPR |
| **H3** | Nessun **session revoke / "logout all devices"**. JWT stateless 24h → password change non invalida sessioni esistenti | server.py auth flow | Compromesso credenziali non recuperabile finché token non scade |
| **H4** | **Privacy Policy formale assente**. C'è solo una pagina note legali interna (`/dashboard/legal`) destinata agli org admin, non agli utenti finali delle landing page | nessun file dedicato | Art. 13 GDPR — informativa obbligatoria mancante per i visitatori delle landing `/v/:vendorId` |
| **H5** | **Cookie banner è opzionale per ogni tenant** (flag `cookie_banner_enabled` in `OrgSettings`). Il link "Privacy policy" del banner è opzionale e free-text → tenant può lasciarlo vuoto. Per cookie tecnici è OK senza consenso, ma manca link sempre visibile a un'informativa | `VendorLanding.js:13-50` + `OrgSettings.js` | Mancata informativa → violazione art. 122 Codice Privacy + Linee Guida Garante 10/06/2021 |
| **H6** | **Nessun DPA** (Data Processing Agreement) tra QRHub (processor) e organizzazione (controller). Legal.js dichiara i ruoli ma non c'è documento firmabile/accettabile | nessun file | Art. 28(3) GDPR — contratto scritto obbligatorio |
| **H7** | **Nessuna identificazione del titolare del trattamento** nelle landing page `/v/:vendorId`. Mostrano `brand_name` del tenant ma non c'è dicitura tipo "Titolare del trattamento: [Org Name], P.IVA: …, contatto privacy: …" | `VendorLanding.js` | Art. 13(1)(a) GDPR — identità del titolare obbligatoria |

### 🟡 MEDIUM

| # | Gap | Dove | Impatto |
|---|---|---|---|
| **M1** | Cloudinary upload usa solo 2 folder (`uploads`, `posts`) **non prefissati per tenant** | `server.py:1036-1057` | I `public_id` sono UUID lunghi → enumeration improbabile, ma media URL pubbliche → soft isolation issue |
| **M2** | Nessun **security header**: HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy non impostati | `server.py:2458-…` (solo CORSMiddleware) | Vulnerabilità clickjacking/XSS, MITM su sottodomini |
| **M3** | Nessuna **retention policy** sugli analytics. La collection cresce all'infinito (oggi 24 doc, ma su scala 1 anno + 100 vendor = milioni) | `db.analytics` | Art. 5(1)(e) GDPR — conservazione limitata |
| **M4** | `JWT_SECRET` default in chiaro nel codice (`'your-secret-key-change-this'`) + warning "key is 27 bytes" sotto i 32 raccomandati per HS256 | `server.py:50` + log produzione | Token forgiabili in caso di default; warning va silenziato con secret più lungo |
| **M5** | **SCC non menzionate** in Legal.js. Cloudinary di default è in US → trasferimento extra-UE soggetto a SCC/DPF. MongoDB Atlas region NON dichiarata (potrebbe essere US o EU). Vercel edge è globale | `Legal.js:66-82` | Art. 44-49 GDPR — trasferimenti internazionali |
| **M6** | **Nessuna validazione lunghezza/sanitizzazione input** su molti campi (`StoreCreate`, `VendorCreate`, `PostCreate` ecc.) — solo limiti su `cookie_banner_*`. Rischio storage XSS via campo `bio`, `post_text` ecc. quando renderizzati senza escape | `VendorLanding.js` + `PostsCarousel.js` da verificare | Stored XSS → confidenzialità sessioni admin |
| **M7** | **Nessuna CSRF protection** esplicita. Si affida a `samesite=lax` (default). OK per top-level navigation ma debole per `POST` cross-site da subdomain compromessi | server.py cookie config | Art. 32 GDPR |
| **M8** | **Logging**: l'app logga email utenti (`"Super admin created: superadmin@qrhub.it"`, `"Admin password updated"`). Nessuna password/token nei log (verificato), ma email è dato personale che finisce nei log Fly.io trattenuti X giorni | `server.py:logger.info` | Art. 5(1)(c) minimizzazione |

### 🟢 LOW / NICE TO HAVE

| # | Gap | Dove |
|---|---|---|
| L1 | Legal.js linka a `https://github.com` generico invece del repo reale (`vdndeploy/qrhub_deploy`) | `Legal.js:54-56, 158-161` |
| L2 | Nessuna versioning/timestamp degli accept-cookie. localStorage solo flag boolean | `VendorLanding.js:14` |
| L3 | Nessun consent record server-side (utile se mai si introduce marketing/profiling) | architettura |
| L4 | UA stringa `os/browser` salvata come full string (es. "Mac OS X 10.15.7", "Opera 127.0.0") → granularità leggermente sopra il minimo necessario | `server.py:1451-1452` |
| L5 | Privacy scrub all'avvio (`server.py:2596`) gira solo on startup, non come job schedulato. Se l'app sta su settimane non si ripulisce | `server.py:2596-2609` |

---

## C. AREA-BY-AREA AUDIT (dettaglio richiesto)

### 1. LEGAL DOCUMENTS

| Documento | Stato | Note |
|---|---|---|
| 1.1 Privacy Policy | 🟠 **partial** | Esiste `/dashboard/legal` (Legal.js) ma è una pagina **interna**, accessibile solo da utenti loggati nel pannello, non dai visitatori delle landing. Manca informativa pubblica per gli utenti finali del QR. Non distingue ruoli controller/processor in modo formale, non elenca SCC, **dichiara IP non salvati ma in realtà cache 7gg** |
| 1.2 Terms of Service | 🟠 **partial** | "As-is" e free tier menzionati in Legal.js ✓. Limitazione responsabilità contenuti tenant ✓. Disservizi provider menzionati ✓. Però non c'è un documento ToS separato accettato in fase di onboarding |
| 1.3 DPA | 🔴 **missing** | Nessun DPA. Legal.js dichiara org tenant come "titolare autonomo" ma non c'è documento bilaterale firmabile. Art. 28(3) richiede contratto scritto |

### 2. BACKEND COMPLIANCE

#### 2.1 Multi-tenant isolation — 🟠 **PARTIAL RISK**

- ✅ Helper `_tenant_filter(user, extra)` ben definito (server.py:153) — vuoto per super_admin, scoping per organization_id altrimenti
- ✅ Usato correttamente in 30+ endpoint (stores, posts, files, vendors, organizations)
- ❌ **Bypass in `/api/analytics/export/pdf`** (server.py:1739) — auth richiesta ma no tenant scoping → **C2 critico**
- ❌ Bypass parziale in `_build_detailed_analytics` quando `vendor_id` arriva da query string non validato
- ⚠️ `/api/analytics` POST (tracking pubblico) accetta qualsiasi `vendor_id` senza verifica esistenza → analytics poisoning + traffic inflation

#### 2.2 Auth system — 🟡 **OK-ish**

- ✅ JWT HS256 con bcrypt password hashing
- ✅ HttpOnly cookie + samesite lax
- ❌ Nessun refresh token (24h fisso)
- ❌ Nessun session revoke / blacklist
- ❌ Nessun rate-limit / brute force protection
- ⚠️ Default JWT_SECRET in chiaro nel codice

#### 2.3 GDPR endpoints — 🔴 **MISSING TOTALI**

| Endpoint | Esiste? |
|---|---|
| `GET /api/me/export` (portabilità dati) | ❌ NO |
| `DELETE /api/me` (cancellazione account) | ❌ NO |
| `DELETE /api/organizations/{id}` (cancellazione tenant) | ✅ SÌ (cascade su users/stores/vendors/posts/files/analytics, server.py:592-597) |
| `POST /api/me/revoke-all-sessions` | ❌ NO |
| `GET /api/vendors/{id}/analytics-data-export` | ❌ NO |
| `DELETE /api/analytics?vendor_id=...` (cancellazione analytics su richiesta) | ❌ NO |

#### 2.4 Data minimization — 🟠 **PARTIAL**

- ✅ Analytics aggregati: solo `device`, `os`, `browser`, `city`, `region`, `country`, `event_type`, `timestamp`
- ❌ **IP cached in `geo_cache` per 7 giorni** (server.py:1490, primary key = IP)
- ⚠️ User-agent `family + version` → granularità superiore al necessario (`Opera 127.0.0` invece di solo `Opera`)
- ✅ Nessun fingerprinting attivo
- ✅ Privacy scrub legacy events su startup

#### 2.5 Logging — 🟡 **OK con minor issue**

- ✅ Nessuna password nei log (verificato)
- ✅ Nessun JWT nei log
- ⚠️ Email amministratori loggate in chiaro durante seed/rotazione
- ❌ Nessun redaction middleware
- ❌ Log Fly.io retention non documentata

### 3. COOKIE & TRACKING — 🟢 **COMPLIANT (per la parte tecnica)**

- ✅ Solo 2 cookie tecnici: `access_token` (admin) e `vendor_token` (vendor dashboard)
- ✅ Nessun GA, Meta Pixel, hotjar, ecc.
- 🟠 Cookie banner presente nelle landing **ma opzionale** (per-tenant flag). Per cookie strettamente tecnici l'art. 122 Codice Privacy non richiede consenso, però l'**informativa** è obbligatoria
- ❌ Nessuna **cookie policy** dedicata (informazioni sui cookie sparse nella pagina Legal interna, non visibile ai visitatori)

### 4. FRONTEND LANDING QR — 🟠 **PARTIAL**

Per le pagine pubbliche `/v/:vendorId`:

- ✅ Dominio personalizzato per tenant (Vercel domains) → separation chiara
- ✅ Branding org (logo, primary_color) visibile
- ❌ **Manca identificazione formale del titolare** (Org name + P.IVA + email contatto privacy)
- ❌ **Manca link a privacy policy obbligatorio** (oggi opzionale via `cookie_banner_link`)
- ❌ Cookie banner mostra solo "Ho capito" → niente opt-out (OK per soli tecnici, ma serve banner anche senza consenso opzionale + link informativa)

### 5. DATA ISOLATION MODEL — 🟠 **PARTIAL**

- ✅ Ogni record ha `organization_id` (users, stores, vendors, posts, files, analytics indiretto via vendor)
- ⚠️ Indici NON dichiarati nel codice → potenziale query lenta + nessun unique index `(organization_id, slug)` per le org
- 🟠 Cloudinary: i media sono pubblici per URL (no signed URL). Folder NON tenant-scoped → enumeration teorica
- ❌ `analytics` collection non ha `organization_id` diretto, solo `vendor_id` → join indiretto. Se vendor cancellato, gli analytics orfani vengono cancellati con `await db.analytics.delete_many({'vendor_id': vendor_id})` ✓

### 6. SUBPROCESSOR COMPLIANCE — 🟠 **PARTIAL**

| Subprocessor | Dichiarato | SCC menzionate | Data residency |
|---|---|---|---|
| Fly.io | ✅ (Legal.js) | ❌ | Dichiarata `region: fra` ✓ (EU) |
| Vercel | ✅ | ❌ | ❌ (edge globale, US per default) |
| MongoDB Atlas | ✅ | ❌ | ❌ (cluster `clustervdn.dp4u4fo.mongodb.net` — region da verificare in console Atlas) |
| Cloudinary | ✅ | ❌ | ❌ (default US, no DPA esplicito) |

### 7. SECURITY COMPLIANCE — 🟠 **PARTIAL**

| Voce | Stato |
|---|---|
| HTTPS enforced | ✅ Fly + Vercel forzano HTTPS, ma nessun `HTTPSRedirectMiddleware` lato FastAPI |
| Password hashing | ✅ bcrypt cost 12 |
| Rate limiting login | ❌ assente |
| Input sanitization | ❌ molto debole |
| CSRF protection | 🟠 solo samesite=lax |
| Secrets fuori repo | ✅ in Fly secrets + Mongo `config` collection |
| Security headers (HSTS, CSP, X-Frame, X-Content) | ❌ assenti |
| Dependency vulnerability scan | ❌ non documentato |

---

## D. IMPLEMENTATION TODO LIST (ordinata)

### 🔴 BLOCKER (fix prima di promuovere "ready for production")

1. **[C1] Stop salvare IP in `geo_cache`** → 2 opzioni:
   - **(a) Veloce**: hash SHA-256(salt + IP) come chiave cache (irreversibile, ma serve a deduplicare lookup)
   - **(b) Pulito**: niente cache lato server, usa direttamente ipapi.co per ogni evento (max 1000/giorno free) e in-memory LRU per la sessione del processo
   - **(c) Best**: pre-popolare `geo_cache` con CIDR ranges-only (no IP precisi), tipo `185.10.0.0/16 → Verona` — perde precisione di pochi km ma è realmente anonimo
   - Allineare il testo di `Legal.js` riga 91 alla realtà tecnica
   - Pulire `geo_cache` esistente: oggi 3 IP reali da rimuovere

2. **[C2] Bloccare cross-tenant analytics export PDF**:
   - In `/api/analytics/export/pdf` aggiungere check: se `vendor_id` fornito → verificare che il vendor appartiene a `user.organization_id`
   - Se `vendor_id` non fornito → applicare `qf = {'vendor_id': {'$in': org_vendor_ids}}` invece di `{}`
   - Stessa logica per `_build_detailed_analytics`

### 🟠 HIGH PRIORITY (1-2 settimane)

3. **[H1] Rate limiting login** — aggiungere `slowapi` o `fastapi-limiter` (5 tentativi/15min per IP+email, lockout progressivo)
4. **[H2] Endpoint diritti interessato**:
   - `GET /api/me/data-export` → JSON con tutti i dati personali dell'utente loggato
   - `DELETE /api/me` → soft-delete user account (anonymize) + cancellazione cascade
   - `GET /api/vendors/{vendor_id}/data-export` (solo per il vendor stesso)
5. **[H3] Session revoke** — aggiungere `token_version` su user + check in `get_current_user`, incrementare su password change/logout-all
6. **[H4+H7] Informativa privacy pubblica per landing** — nuova pagina `/v/:vendorId/privacy` generata server-side con: titolare (org), subprocessor list, finalità, base giuridica, durata conservazione, diritti, contatti
7. **[H5] Cookie banner sempre visibile con link informativa obbligatorio** (oggi è opzionale)
8. **[H6] DPA template** — markdown standardizzato accettabile dall'org admin al primo login (`accepted_dpa_version: '1.0'` su user)

### 🟡 MEDIUM (1 mese)

9. [M1] Cloudinary folder tenant-prefixed: `org_{id}/uploads`, `org_{id}/posts`
10. [M2] Security headers via `secure` middleware o custom: HSTS, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy=strict-origin-when-cross-origin, CSP base
11. [M3] Analytics retention policy: TTL index su `timestamp` (es. 365 giorni) o cron mensile di archive/delete
12. [M4] Imporre `JWT_SECRET` ≥32 byte all'avvio: `assert len(JWT_SECRET) >= 32`, rigenerare via panel
13. [M5] Aggiornare Legal.js con sezione esplicita "Trasferimenti extra-UE e SCC" + region Atlas/Cloudinary effettiva
14. [M6] `max_length` su tutti i campi Pydantic + escape HTML lato frontend (DOMPurify) sui campi user-content (`bio`, `post_text`, `post_title`, `cookie_banner_text`)
15. [M7] CSRF token su mutating endpoint o switch a `samesite=strict` per accessi non cross-site
16. [M8] Redaction email nei log: helper `_log_user(u)` → `"user(id=…)"` invece di email

### 🟢 NICE TO HAVE

17. [L1] Fix link GitHub in Legal.js → repo reale
18. [L2] Versioning del consent cookie (date + version del banner accettato)
19. [L3] Tabella `consent_records` server-side per audit
20. [L4] Ridurre granularità UA: salvare solo `family` senza versione minor
21. [L5] Privacy scrub schedulato giornaliero (apscheduler / cron job)
22. **PWA / service worker** (deferred su tua richiesta, ripreso dopo)

---

## E. CONCLUSIONE

> **QRHub NON è "GDPR-ready" per dichiararsi compliant in produzione oggi**, ma è **anche molto distante dall'essere strutturalmente non conforme**.

**Punti forti** della baseline:
- Architettura multi-tenant pulita con helper `_tenant_filter`
- Cookie tecnici minimi, nessun tracker terzo
- Dichiarazione esplicita "no scopo di lucro / open source" che riduce esposizione contrattuale
- Privacy by design già implementata in larga parte (no fingerprint, no PII utenti finali)

**Punti di rottura immediati** (i 2 critici **C1 + C2** sono fixabili in mezza giornata, sono il blocco vero):
- IP cached vs dichiarazione "non salvati" → contraddizione formale che da sola può causare un richiamo del Garante
- PDF export cross-tenant → un singolo client malintenzionato può vederlo

**Verdetto**: parzialmente conforme. NON serve refactor strutturale: serve un **GDPR Hardening Sprint** mirato su ~10 task per portarlo a "production-ready compliant".

---

## F. SUGGERIMENTO DI INTERVENTO

Se vuoi possiamo procedere così, in ordine:

1. **Oggi** (~1h): fix C1 + C2 + pulizia `geo_cache` + allineamento Legal.js (i 2 blocker)
2. **Domani** (~3-4h): H1 (rate limit) + H4/H5/H7 (informativa pubblica landing + cookie banner sempre visibile)
3. **Dopodomani** (~3-4h): H2 (export/erasure endpoints) + H3 (session revoke)
4. **Settimana 2**: blocco MEDIUM
5. **Poi**: PWA (deferred)

Fammi sapere da quale partiamo.
