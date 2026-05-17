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
- **Storage media**: Cloudinary `doqp3gr5e`
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

## What's been implemented (cronologia in questo workspace)

### 2026-05-17 — sessione di hardening

| Data | Modifica | Stato |
|---|---|---|
| 2026-05-17 | Clone repo `vdndeploy/qrhub_deploy` in `/app` + install deps + supervisor up | ✅ |
| 2026-05-17 | Connessione locale al DB di produzione (`qrhub_vendor_db`) | ✅ |
| 2026-05-17 | **Rinomina DB**: `windtre_vendor_db` → `qrhub_vendor_db` (copy + Fly secret update + verify + drop old) | ✅ deployato |
| 2026-05-17 | **Bug fix `/api/deploy/fly/redeploy`**: era `/restart` → `POST /machines/{id}` per applicare secret staged | ✅ deployato v12 |
| 2026-05-17 | **GDPR Sprint 1 (CRITICAL)** | ✅ deployato v13 |
| 2026-05-17 | - C1: IP raw in `geo_cache` → `subnet` anonimizzata (`/24` IPv4, `/48` IPv6); pulizia 3 IP legacy; testo Legal.js allineato | ✅ |
| 2026-05-17 | - C2: tenant scoping su `/api/analytics/export/pdf` (era bypass-abile cross-tenant) | ✅ |
| 2026-05-17 | **GDPR Sprint 2 (HIGH)** | ✅ deployato v14 |
| 2026-05-17 | - H1: rate-limit login (5 tentativi / 15 min) su `/auth/login` e `/vendor-auth/login` | ✅ |
| 2026-05-17 | - H4+H7: nuovo endpoint `/api/vendors/{id}/privacy-info` + pagina pubblica `/v/:vendorId/privacy` con titolare, sub-processor, basi giuridiche, diritti GDPR | ✅ |
| 2026-05-17 | - H5: cookie banner sempre visibile sulla landing + link "Informativa privacy" obbligatorio (default verso pagina auto-generata se org non ha URL custom) + link footer permanente | ✅ |
| 2026-05-17 | - Campi privacy nel form `OrgSettings`: denominazione legale, P.IVA, indirizzo, email privacy, URL policy custom | ✅ |
| 2026-05-17 | - I18n: messaggi login da "Invalid credentials" → "Credenziali non valide" | ✅ |

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
