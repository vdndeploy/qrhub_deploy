# QRHub — PRD (Product Requirements Document)

> 📚 **Documenti gemelli:**
> - [`ROADMAP.md`](./ROADMAP.md) — cosa resta da fare, prioritizzato
> - [`CHANGELOG.md`](./CHANGELOG.md) — storico dettagliato di tutte le modifiche

---

## Coordinate produzione

| Componente | URL / valore |
|---|---|
| Repo | https://github.com/vdndeploy/qrhub_deploy |
| Frontend prod | https://qrhub-app.vercel.app (Vercel, Hobby plan) |
| Frontend dominio | https://qrhub.it (configurato + verificato) |
| Backend prod | https://qrhub.fly.dev (Fly.io, region `fra`, app `qrhub`) |
| Database | MongoDB Atlas — cluster `clustervdn.dp4u4fo.mongodb.net` / DB `qrhub_vendor_db` |
| Storage media | Cloudinary (`CLOUDINARY_CLOUD_NAME` env) |
| Costo mensile | ~$0.43 (solo Fly pay-as-you-go) · Atlas/Cloudinary/Vercel $0 |

---

## Problema originale dell'utente

> "continuiamo a fissare questo progetto è già in produzione su vercel, fly.io, cloudinary e mongodb con utenti registrati"

QRHub è una **piattaforma multi-tenant SaaS open source** (licenza PolyForm Noncommercial 1.0.0) che permette ai negozi/aziende di:

1. Generare landing page con QR code personalizzate per ogni venditore
2. Gestire annunci a carosello sincronizzati su più negozi (multi-store)
3. Vedere analytics aggregate GDPR-compliant (no PII finali)
4. Brandizzare ogni landing per cliente (logo, colori, dominio)
5. Stampare cartellini fisici fronte/retro pronti per vetrina

Sviluppata da un soggetto privato a titolo personale, senza struttura societaria, fornita ad organizzazioni gratuitamente in modalità self-served.

---

## Architettura

```
Browser ──→ qrhub.it / dominio-org ──→ Vercel (React SPA)
                                         │
                                         └──→ qrhub.fly.dev (FastAPI) ──→ MongoDB Atlas
                                                                            └──→ Cloudinary CDN
```

- **Backend**: FastAPI + Motor (Mongo async) — `backend/server.py` (in refactor) + `backend/routers/{deploy,media,analytics,super_admin}.py`
- **Frontend**: React 19 + CRACO + Tailwind + shadcn/ui — `frontend/`
- **Hosting**: Fly.io Hobby (singolo machine shared-cpu-1x, auto-stop quando idle) + Vercel Hobby
- **Routing multi-tenant**: `<DomainGuard>` legge `/api/platform/config` al boot e reindirizza richieste non-canonical al primary domain

---

## User personas

| Persona | Cosa fa | Pannello |
|---|---|---|
| **Super Admin** | Gestisce organizzazioni, deploy, secrets, backup | `/dashboard/*` con tab Domain / Deploy / Backup / Usage |
| **Org Admin** (cliente) | Gestisce i propri negozi, venditori, annunci, privacy, branding | `/dashboard/*` org-scoped |
| **Vendor** (venditore) | Vede metriche del proprio QR, gestisce foto profilo | `/vendor/dashboard` |
| **Utente finale** (visitatore) | Scansiona QR → arriva sulla landing | `/v/:vendorId` (o slug custom) |

---

## Core requirements (statici)

### Funzionali
- Multi-tenant con `organization_id` scope su ogni record
- Landing page pubbliche `/v/:vendorId` con branding per-org (logo, colori, manifest PWA)
- Slug personalizzato per QR code (`/v/gizwindtre`)
- Annunci multi-store sincronizzati via `group_id`
- Analytics aggregate per device/OS/browser/città (no IP, no fingerprint)
- Dominio custom per org (CNAME verificato via Vercel API)
- Export PDF report analytics (orario locale Europe/Rome)
- Backup DB + repository scaricabili manualmente dal super admin

### Non-funzionali
- **GDPR-first**: nessuna PII di utenti finali in DB, subnet anonimizzate IPv4/24 + IPv6/48 con retention 7gg
- **Cookie tecnici only**: nessun cookie di profilazione (`access_token`, `vendor_token`, `qrhub_theme`)
- **Hosting free-tier sostenibile**: target ≤256MB RAM, 512MB DB, 25 crediti Cloudinary/mese
- **Open source**: licenza PolyForm Noncommercial 1.0.0
- **DPA art. 28 GDPR**: ogni org_admin deve accettare il DPA v1.1 prima di usare la piattaforma

---

## Stack tecnico

| Categoria | Strumento |
|---|---|
| Frontend framework | React 19 + CRACO |
| UI | Tailwind CSS + shadcn/ui + Recharts |
| State | React hooks + axios |
| Backend framework | FastAPI + Pydantic v2 |
| DB driver | Motor (Mongo async) |
| Auth | JWT HS256 in HttpOnly cookie + bcrypt cost 12 + token_version (revoke) |
| Rate limit | 5 tentativi / 15 min per (email, IP) su `/auth/login` |
| PDF | reportlab (export analytics) |
| QR | qrcode + Pillow |
| Image CDN | Cloudinary (folder tenant-prefixed `org_{id}/*`) |
| Hosting | Fly.io (FRA EU) + Vercel + MongoDB Atlas |
| Geo lookup | ipapi.co (subnet, no IP individuale) |

---

## Schema DB (collection principali)

| Collection | Documenti chiave |
|---|---|
| `users` | `id`, `email`, `role` (`super_admin`/`org_admin`), `organization_id`, `password_hash`, `token_version`, `accepted_dpa_*` |
| `organizations` | `id`, `name`, `logo_url`, `primary_color`, `legal_name`, `vat`, `address`, `privacy_email`, `pwa_icon_url`, `landing_headline`, `data_profiling_text`, `terms_text` |
| `stores` | `id`, `organization_id`, `name`, `hours` (structured `StoreHoursDay`), `hours_text`, `address`, `phone` |
| `vendors` | `id`, `organization_id`, `store_id`, `name`, `slug` (unique partial), `profile_image_url`, `bio`, `whatsapp_message` |
| `posts` | `id`, `organization_id`, `group_id` (multi-store sync), `enabled`, `media_public_id`, `cta_*`, `schedule_*` |
| `analytics` | `vendor_id`, `event_type` (page_view/click_*), `timestamp`, `device`, `os`, `browser`, `city` (subnet-derived) |
| `geo_cache` | `subnet`, `city`, `country`, `expires_at` (TTL 7gg) |
| `audit_log` | `actor_email`, `action`, `target_*`, `timestamp` |
| `platform_settings` | `_id: 'platform_domain'`, `primary_domain`, `verified_at` |
| `config` | secrets di deploy (Fly token, Vercel token, Cloudinary, Atlas opzionale) |

---

## Note tecniche operative

- **Locale connesso al DB produzione**: ogni modifica dati impatta produzione → cautela
- **Deploy Fly**: `flyctl deploy --remote-only` dal pod (token in `db.config.flyio_api_key`). Strategy `immediate` per single-machine.
- **Deploy Vercel**: gestito da utente via "Save to GitHub" → push automatico
- **Hot reload**: backend + frontend hot reload attivi via supervisor. Restart solo se cambi `.env` o installi dipendenze.
- **Test credentials**: in `/app/memory/test_credentials.md` (rigenerato a ogni boot, contiene solo `email` + nome env var)
- **DPA versione**: `CURRENT_DPA_VERSION = '1.1'` in `server.py`. Bump → tutti gli org admin vengono ri-promtati al prossimo login.
- **Routing crawler-aware**: `frontend/vercel.json` rewrita richieste OG/social a `qrhub.fly.dev/og/v/:id`, browser umani vanno alla SPA.

---

## Stato corrente (2026-06-01)

🟢 **Live e stabile** · 0 bug aperti · costi entro free tier (+ ~$0.43 Fly pay-as-you-go).
UI Desktop/Mobile ora unificata su card responsive per Vendors / Stores / Posts (componente `MobileActionBtn` riusabile).

Per il dettaglio di **cosa è stato fatto** → vedi `CHANGELOG.md`.  
Per il dettaglio di **cosa resta da fare** → vedi `ROADMAP.md`.
