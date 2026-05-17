# PRD — QRHub Multi-tenant Platform

## Original Problem Statement
Clonare https://github.com/vdndeploy/qr1.1, configurare MongoDB Atlas, Cloudinary,
Vercel e Fly.io, e verificare il funzionamento di Cloudinary che era bloccato
sul fallback locale (CLOUDINARY_URL non letto correttamente per ordine import).

## Architecture
- **Frontend** (React 19 + CRACO + Tailwind + shadcn/ui) → **Vercel**: https://qrhub-deploy.vercel.app
- **Backend** (FastAPI + Motor) → **Fly.io app `qrhub`** (region `fra`): https://qrhub.fly.dev
- **DB** → **MongoDB Atlas** `clustervdn.dp4u4fo.mongodb.net` (DB `windtre_vendor_db`)
- **Storage media** → **Cloudinary** (cloud `doqp3gr5e`)

## What's been implemented (2026-05-17)
- ✅ Codice clonato da `vdndeploy/qr1.1` in /app
- ✅ Backend `.env` configurato con MongoDB Atlas + Cloudinary + JWT + admin seed
- ✅ Cloudinary OK — `CLOUDINARY_URL` parsato manualmente dopo `load_dotenv` (fix definitivo)
- ✅ Upload via `/api/upload` ritorna URL Cloudinary reale
- ✅ Servizi locali avviati via supervisor (backend:8001 + frontend:3000)
- ✅ Fix ESLint `react-hooks/exhaustive-deps` in `VendorLanding.js` per build Vercel
- ✅ Aggiunti `Dockerfile`, `fly.toml`, `.dockerignore` alla ROOT del repo
- ✅ Rimosso `emergentintegrations==0.1.0` (interno Emergent, non su PyPI)
- ✅ Deploy Fly.io completo via API token: app `qrhub` creata, volume `app_uploads` 1GB, secrets impostati, immagine buildata e deployata via remote-only build
- ✅ Deploy Vercel: env `CI=false` + `REACT_APP_BACKEND_URL=https://qrhub.fly.dev`
- ✅ Cookie cross-site: aggiunto `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true` (env-driven, default lax/false per locale)
- ✅ Login superadmin verificato via browser su https://qrhub-deploy.vercel.app
- ✅ Dashboard organizzazioni renderizzata correttamente (seed iniziale OK)

## Features in-place (heredità dal repo)
- Pannello superadmin multi-tenant (orgs, users, branding)
- Pannello org_admin: stores, vendors, QR generator, posts carousel
- Vendor portal `/v/:vendorId` (landing pubblica + analytics)
- Analytics dettagliate (geo-IP, device, hourly, export PDF)
- Pannello Deploy integrato (apply secrets, redeploy, uptime monitor)
- Rotazione credenziali da UI
- Gestione domini custom Aruba (via Vercel API)

## Backlog (P0/P1)
- P1: Implementare TUTTI gli endpoint deploy nel pannello superadmin (apply-secrets dovrebbe ora funzionare con il token salvato in DB)
- P1: Aggiornare CORS_ORIGINS e FRONTEND_URL via "Apply Secrets" del pannello superadmin (attualmente già pushati via flyctl CLI)
- P2: Test automatici end-to-end (testing agent) sui flussi multi-tenant
- P2: Configurare DNS Aruba per sottodomini per cliente (UI già pronta)

## Note
- **Fix Cloudinary**: il SDK fa auto-detect di `CLOUDINARY_URL` al momento di `import cloudinary` (riga 29), che avviene PRIMA di `load_dotenv` (riga 34). Soluzione: parsare manualmente `CLOUDINARY_URL` con `urlparse` dopo `load_dotenv` e chiamare `cloudinary.config()` esplicitamente.
- **Secrets Fly.io produzione**: tutti pushati via `flyctl secrets set` (MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL/PASSWORD, SUPERADMIN_EMAIL/PASSWORD, FRONTEND_URL, CORS_ORIGINS, CLOUDINARY_*, COOKIE_SAMESITE, COOKIE_SECURE).

## 2026-05-17 (later) — Bug fix + nuova feature
- ✅ **Fix 502 redeploy Fly.io**: `/api/deploy/fly/redeploy` ora rileva la piattaforma `machines` (nuova) vs `nomad` (legacy) e usa Machines REST API per restart (applica secrets staged senza rebuilder)
- ✅ **Nuovo endpoint** `/api/deploy/fly/update-image`: aggiorna ogni machine all'ultima image pushata su `registry.fly.io` (utile dopo `fly deploy` da CI/CD o per propagare secrets+immagine)
- ✅ **Nuovo bottone UI** "Force update image" nel tab Fly.io del pannello SuperAdmin
- ✅ Deploy Fly.io aggiornato (nuova machine deployment `01KRTN2M1YWCXAXJKAJWQN55KN`)

## 2026-05-17 (cont.) — Reset password utenti organizzazioni
- ✅ **Nuovo endpoint** `PUT /api/organizations/users/{user_email}/password` (super admin only)
  - Valida lunghezza ≥ 6 caratteri
  - Blocca reset di super_admin (HTTP 403, suggerisce "Ruota credenziali")
  - Salva metadati `password_reset_at` + `password_reset_by` nel documento user
- ✅ **UI**: bottone icona "Cambia password" (KeyRound indigo) accanto a "Elimina" per ogni utente esistente nel dialog "Utenti di {org}"
- ✅ Dialog di conferma con input password (min 6), suggerimento di comunicare la password via canale sicuro
- ✅ Deploy Fly.io aggiornato — endpoint attivo su `https://qrhub.fly.dev`

## 2026-05-17 (cont.) — Foto profilo venditore + fix cookie cross-site
- ✅ **Fix cookie cross-site venditore**: `set_cookie('vendor_token')` ora env-driven (`COOKIE_SAMESITE=none, COOKIE_SECURE=true` in prod) → vendor login funziona da `qrhub-deploy.vercel.app` → `qrhub.fly.dev`
- ✅ **Foto profilo venditore (stile Instagram)**:
  - Backend: `VendorProfileUpdate` model con `profile_image_url` + `profile_image_enabled`
  - `PUT /vendor/profile` accetta i nuovi campi
  - `GET /vendors/{id}` pubblico espone `profile_image_url` SOLO se toggle ON (sicurezza/privacy)
- ✅ **UI VendorDashboard**: card "Foto profilo" con avatar circolare preview, upload Cloudinary, Switch "Pubblica/Nascosta", bottone X per rimuovere
- ✅ **UI VendorLanding**: avatar circolare con `conic-gradient` (anello arancione stile IG) sopra l'hero title, responsive (116px mobile → 140px desktop)
- ✅ **Fix bug `update_config`**: `model_dump(exclude_unset=True)` per evitare di azzerare campi non passati
- ✅ **Recupero credenziali da oplog Atlas**: implementato script che recupera token Vercel/Fly.io dall'oplog MongoDB se persi
- ✅ **Fix `/api/vendors`**: ora include `email` + `has_credentials: bool` → la UI mostra correttamente lo stato credenziali
