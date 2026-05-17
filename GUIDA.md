# GUIDA — QRHub (QRHub)

Guida completa per riprendere il progetto in qualsiasi momento, anche da un account Emergent diverso o da una macchina locale.

> 📌 **Cosa è questo progetto**: piattaforma multi-tenant (super admin + organizzazioni) per generare e gestire landing page con QR code per venditori, con analytics, post a carosello, branding personalizzato e dashboard di deploy integrata.
>
> 🛠️ **Creato e mantenuto da**: QRHub — progetto **open source MIT**, senza scopo di lucro.
> **l'organizzazione cliente** è una delle organizzazioni che utilizzano la piattaforma (tenant), non il proprietario del codice.

---

## 🗺️ Indice

1. [Architettura](#-architettura)
2. [Account e credenziali](#-account-e-credenziali)
3. [Riprendere il progetto da zero (nuovo account Emergent)](#-riprendere-il-progetto-da-zero-nuovo-account-emergent)
4. [Avvio in locale (senza Emergent)](#-avvio-in-locale-senza-emergent)
5. [Deploy in produzione](#-deploy-in-produzione)
6. [Gestire produzione dal pannello "Deploy"](#-gestire-produzione-dal-pannello-deploy)
7. [Rotazione credenziali](#-rotazione-credenziali)
8. [Monitoraggio uptime](#-monitoraggio-uptime)
9. [Sottodomini Aruba (per cliente)](#-sottodomini-aruba-per-cliente)
10. [Backup e ripristino dati](#-backup-e-ripristino-dati)
11. [Troubleshooting](#-troubleshooting)

---

## 🏗️ Architettura

```
┌───────────────────────────┐         ┌────────────────────────┐
│  Vercel (frontend)        │ ──HTTP──▶│  Fly.io (backend)       │
│  React 19 + CRACO + Shadcn│          │  FastAPI + Motor        │
└───────────────────────────┘          └────────────┬───────────┘
                                                    │
                              ┌─────────────────────┴────────────┐
                              │                                  │
                  ┌───────────▼───────────┐         ┌────────────▼──────────┐
                  │  MongoDB Atlas        │         │  Cloudinary           │
                  │  (DB principale)      │         │  (storage media)      │
                  └───────────────────────┘         └───────────────────────┘
```

- **Repo GitHub**: `https://github.com/<your-github-org>/<repo>`
- **Backend** (`/backend`): FastAPI, prefix `/api`, server in `server.py`
- **Frontend** (`/frontend`): React 19 + CRACO + Tailwind + shadcn/ui
- **DB**: MongoDB Atlas — cluster `clustervdn.dp4u4fo.mongodb.net` (account QRHub) → DB `windtre_vendor_db`
- **Storage media**: Cloudinary (`doqp3gr5e`)

---

## 🔑 Account e credenziali

### Default (cambia subito in produzione!)
| Ruolo | Email | Password | Dove |
|-------|-------|----------|------|
| Super Admin | `superadmin@qrhub.it` | `changeme123` | Pannello cross-tenant, deploy, monitoring |
| Org Org Admin | `admin@example.com` | `admin123` | Pannello operativo organizzazione |

### Servizi esterni necessari
- **MongoDB Atlas**: connection string già nel `.env`
- **Cloudinary**: account `doqp3gr5e` già configurato (vedi DEPLOY.md per nuovo account)
- **Fly.io**: account + token (`https://fly.io/user/personal_access_tokens`)
- **Vercel**: account + token (`https://vercel.com/account/tokens`)
- **GitHub** (opzionale): per CI/CD futuro
- **Aruba DNS**: pannello hosting per record CNAME

---

## 🚀 Riprendere il progetto da zero (nuovo account Emergent)

Se hai cambiato account Emergent o vuoi ripartire da capo:

### Opzione A — Da Emergent (consigliato)
1. **Login** sul nuovo account Emergent.
2. Crea un nuovo progetto con prompt:
   > `clona https://github.com/<your-github-org>/<repo> e configura per usare MongoDB Atlas`
3. Quando l'agente chiede credenziali, fornisci:
   ```
   mongodb+srv://vdndeploy_db_user:7FMONVsq6oCr65EC@clustervdn.dp4u4fo.mongodb.net/
   ```
4. L'agente clona automaticamente, ripristina `.env`, installa dipendenze e avvia.
5. Il database Atlas mantiene **tutti i dati** (organizzazioni, venditori, analytics, config deploy).

### Opzione B — Da locale (Linux/macOS)
```bash
git clone https://github.com/<your-github-org>/<repo>.git
cd qr-hub
```
Poi segui [Avvio in locale](#-avvio-in-locale-senza-emergent).

> ⚠️ **Importante**: il file `.env` con la connection string Mongo **non** è nel repo (e non deve esserci). Riprendi quella reale da:
> - Pannello superadmin → tab "Secrets" → MONGO_URL (se già salvata in DB)
> - Oppure questa guida (cluster: `clustervdn.dp4u4fo.mongodb.net`, user: `vdndeploy_db_user`)

---

## 💻 Avvio in locale (senza Emergent)

### Prerequisiti
- Node.js ≥ 18, Yarn 1.x
- Python ≥ 3.11
- MongoDB (locale o Atlas)

### Setup
```bash
# 1. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. .env (CREALO — NON è nel repo)
cat > .env <<'EOF'
MONGO_URL=mongodb+srv://vdndeploy_db_user:7FMONVsq6oCr65EC@clustervdn.dp4u4fo.mongodb.net/
DB_NAME=windtre_vendor_db
CORS_ORIGINS=*
JWT_SECRET=cambiami-in-produzione
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
SUPERADMIN_EMAIL=superadmin@qrhub.it
SUPERADMIN_PASSWORD=changeme123
FRONTEND_URL=http://localhost:3000
CLOUDINARY_CLOUD_NAME=doqp3gr5e
CLOUDINARY_API_KEY=984179873275136
CLOUDINARY_API_SECRET=cO9He7MFo4_z6rVR_HsVrxg8f2g
EOF

# 3. Avvia backend
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

In un altro terminale:
```bash
# 4. Frontend
cd frontend
yarn install

# 5. .env frontend (CREALO)
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env

# 6. Avvia
yarn start
```

Apri `http://localhost:3000` → login con `superadmin@qrhub.it / changeme123`.

---

## 🌍 Deploy in produzione

Hai 2 percorsi: **manuale (CLI)** o **dal pannello Deploy** (consigliato dopo il primo deploy).

### Primo deploy — da CLI (una volta sola)

#### Backend (Fly.io)
```bash
# 1. Installa flyctl
curl -L https://fly.io/install.sh | sh
fly auth login

# 2. Lancia (dalla cartella backend/)
cd backend
fly launch --no-deploy --copy-config --name qrhub-backend --region fra
fly volumes create app_uploads --size 1 --region fra

# 3. Imposta secrets (copiabili dal pannello "Deploy" → tab Fly.io)
fly secrets set --app qrhub-backend \
  MONGO_URL="mongodb+srv://..." \
  DB_NAME="windtre_vendor_db" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  ADMIN_EMAIL="admin@example.com" \
  ADMIN_PASSWORD="..." \
  SUPERADMIN_EMAIL="superadmin@qrhub.it" \
  SUPERADMIN_PASSWORD="..." \
  FRONTEND_URL="https://<vercel-app>.vercel.app" \
  CORS_ORIGINS="https://<vercel-app>.vercel.app" \
  CLOUDINARY_CLOUD_NAME="doqp3gr5e" \
  CLOUDINARY_API_KEY="984179873275136" \
  CLOUDINARY_API_SECRET="cO9He7MFo4_z6rVR_HsVrxg8f2g"

# 4. Deploy
fly deploy --app qrhub-backend
```

Verifica: `curl https://qrhub-backend.fly.dev/api/auth/me` → `{"detail":"Not authenticated"}` = OK.

#### Frontend (Vercel)
1. Vai su https://vercel.com/new → importa repository GitHub `<your-github-org>/<repo>`.
2. **Root Directory**: `frontend`
3. **Framework Preset**: Create React App (auto)
4. **Environment Variables** (Production + Preview + Development):
   - `REACT_APP_BACKEND_URL` = `https://qrhub-backend.fly.dev`
5. **Deploy**.
6. Dopo il primo deploy, vai su Vercel Project → Settings → Git → **Deploy Hooks** → crea hook "production-main" → copia l'URL.
7. Incollalo nel pannello superadmin → tab Vercel → "Deploy Hook URL".

#### Update CORS post-deploy
Aggiorna `FRONTEND_URL` e `CORS_ORIGINS` su Fly con l'URL Vercel reale:
```bash
fly secrets set FRONTEND_URL=https://<vercel-app>.vercel.app CORS_ORIGINS=https://<vercel-app>.vercel.app
```

---

## 🎛️ Gestire produzione dal pannello "Deploy"

Dopo il primo deploy, **tutto** si fa dal pannello super admin (`/dashboard/settings`):

### Tab Fly.io
- **Token & Nome App** → salvati in MongoDB (cifrati in `db.config`)
- **Applica Secrets a Fly.io** → invia tutti i `prod_*` + Cloudinary via GraphQL `setSecrets`
- **Redeploy immagine attuale** → ridistribuisce l'ultima immagine (applica i secrets staged)
- **Aggiorna stato** → mostra release corrente + machines live

### Tab Vercel
- **Deploy Hook URL** (consigliato): triggera deploy senza esporre token
- **Triggera Deploy Vercel** → POST al hook (o API se hook assente)

### Tab Secrets
- Tutti i secrets di produzione modificabili da UI con toggle show/hide
- **Genera JWT casuale** → 64 hex chars sicuri

### Tab Monitor
- Uptime % 24h, latenza media, downtime count
- Chart latenza ora-per-ora (recharts)
- Log ultimi 15 check
- Auto-refresh ogni 60s
- "Esegui check ora" per check manuale

### Tab Cloudinary / GitHub
- Riferimenti read-only e link rapidi

---

## 🔄 Rotazione credenziali

Sempre dal pannello super admin → tab Secrets → riquadro rosso **"Ruota credenziali ora"**:

1. Attiva i toggle che vuoi ruotare (JWT_SECRET, password admin, password super admin)
2. (Opzionale) inserisci una password custom, altrimenti viene generata casualmente
3. Toggle "**Applica anche su Fly.io**" → push immediato dei nuovi secrets
4. Click "Ruota credenziali ora" → conferma nel dialog
5. **Salva subito le password mostrate** nel banner verde — non saranno più recuperabili

Cosa succede dietro le quinte:
- `password_hash` aggiornato in MongoDB locale (test_database) e in produzione (windtre_vendor_db)
- `prod_jwt_secret`, `prod_admin_password`, `prod_superadmin_password` salvati in `db.config`
- Fly.io riceve i nuovi secrets via GraphQL `setSecrets`
- **Importante**: per attivare il nuovo JWT_SECRET in produzione devi anche fare **Redeploy** dalla tab Fly.io

---

## 📊 Monitoraggio uptime

Il backend esegue un ping background ogni 60s su `<FLY_URL>/api/auth/me`. I dati restano 48h in `db.uptime_checks` poi vengono ruotati automaticamente.

Endpoint API (super admin):
- `GET /api/deploy/uptime/summary` — riassunto + chart
- `POST /api/deploy/uptime/check-now` — check on-demand

Configurazione (tab Monitor):
- **Health path**: default `/api/auth/me` (qualsiasi endpoint che risponde 200/401/403 va bene)
- **Intervallo**: minimo 30s
- **Abilitato**: toggle on/off

---

## 🌐 Sottodomini Aruba (per cliente)

L'org admin gestisce i domini senza mai accedere a Vercel. Il backend usa il token Vercel salvato dal super admin per collegare il dominio automaticamente al progetto.

### Workflow utente finale
1. Login come org admin (es. `admin@example.com`)
2. `/dashboard/organization` → sezione "Domini personalizzati"
3. Inserisci dominio (es. `qr.tuodominio.it`) → click `+`
4. **Il backend lo aggiunge automaticamente al progetto Vercel** (chiamata `POST /v10/projects/{id}/domains`)
5. Compare una card con:
   - Badge "In attesa DNS" (giallo) / "Verificato" (verde)
   - Istruzioni DNS pronte da copiare (tipo, host, valore, TTL)
   - Bottoni "Copia record", "Verifica ora", "Rimuovi"
6. L'utente va sul pannello DNS Aruba e inserisce il record CNAME indicato
7. Attende 2-5 minuti, click "Verifica ora" → certificato SSL emesso automaticamente da Vercel

### Prerequisito (una sola volta)
Il super admin deve aver compilato in `/dashboard/settings` → tab Vercel:
- Vercel Token
- Project ID
- Org/Team ID (se progetto team)

Senza queste credenziali l'org admin riceve "Vercel non è ancora configurato dal super admin. Riprova più tardi."

### Endpoint backend
- `GET /api/organizations/{org_id}/domains` — lista
- `POST /api/organizations/{org_id}/domains` — aggiunge (chiama Vercel)
- `GET /api/organizations/{org_id}/domains/{domain}/status` — refresh verifica
- `POST /api/organizations/{org_id}/domains/{domain}/verify` — triggera verifica
- `DELETE /api/organizations/{org_id}/domains/{domain}` — rimuove (anche da Vercel)

> 🔒 **Sicurezza**: ogni endpoint verifica che `user.organization_id == org_id` (oppure super admin). Cross-tenant impossibile. Backend mantiene `allowed_domains` su `organizations` sincronizzato con la collection `vercel_domains`.

---

## 💾 Backup e ripristino dati

### Backup MongoDB Atlas
Atlas fa **snapshot automatici giornalieri** sul tier M0+. Per backup manuali:
```bash
mongodump --uri="mongodb+srv://vdndeploy_db_user:7FMONVsq6oCr65EC@clustervdn.dp4u4fo.mongodb.net/windtre_vendor_db" -o ./backup
```

### Ripristino
```bash
mongorestore --uri="mongodb+srv://..." ./backup
```

### Backup Cloudinary
Tutte le immagini/video caricati sono su Cloudinary CDN — replicati automaticamente. Per export massivo:
```bash
# Da Cloudinary console → Media Library → Backup
# Oppure via API: GET /resources/image?max_results=500
```

---

## 🐛 Troubleshooting

| Sintomo | Causa | Fix |
|---------|-------|-----|
| Login dashboard fallisce | Password cambiata o DB vuoto | Aspetta il seed automatico (15s dopo startup backend) o reset manualmente |
| `MONGO connection refused` | IP non in whitelist Atlas | Atlas → Network Access → `0.0.0.0/0` (o IP Fly.io) |
| `CORS error` nel browser | `CORS_ORIGINS` non aggiornato | Tab Secrets → CORS_ORIGINS → Apply Secrets → Redeploy |
| `Fly: You must be authenticated` | Token Fly.io errato o scaduto | Tab Fly.io → rigenera token su https://fly.io/user/personal_access_tokens |
| Vercel deploy 401 | Token scaduto | https://vercel.com/account/tokens → crea nuovo → tab Vercel |
| Upload Cloudinary fallisce | API secret errato | Tab Cloudinary → controlla i 3 valori |
| Backend Fly 502 cold start | Machine in stop (auto-stop) | Prima richiesta lenta (~2s) — normale con `auto_stop_machines = stop` |
| Monitor sempre "Offline" | Health path errato | Tab Monitor → cambia path (deve rispondere 200/401/403) |
| Frontend bianco/build error | Mismatch versioni React/Node | `cd frontend && rm -rf node_modules && yarn install` |
| QR rimanda a localhost | `FRONTEND_URL` non impostato | Tab Secrets → FRONTEND_URL = URL produzione Vercel → Apply Secrets |

### Log Fly.io
```bash
fly logs --app qrhub-backend
```

### Log Vercel
Project → Deployments → click sul deployment → Functions / Build logs.

### Health check manuale
```bash
curl -i https://qrhub-backend.fly.dev/api/auth/me
# Atteso: HTTP/2 401 con {"detail":"Not authenticated"} → backend alive
```

---

## 📬 Contatti & riferimenti utili

- **Repo**: https://github.com/<your-github-org>/<repo>
- **MongoDB Atlas**: https://cloud.mongodb.com
- **Fly.io Dashboard**: https://fly.io/dashboard
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Cloudinary Console**: https://console.cloudinary.com
- **Aruba**: https://admin.aruba.it

---

## 🆕 Changelog

- **2026-02-12** – Privacy: rimosso tracking IP address. Solo dati aggregati (città/paese/device) sono salvati. Pannello super admin semplificato: solo Organizzazioni + Deploy.
- **2026-02-12** – Domini personalizzati ora gestiti dall'org admin senza accedere a Vercel (auto-add via API).
- **2026-02-12** – Aggiunto pannello Deploy super admin con operazioni live (apply secrets, redeploy, rotate credentials, uptime monitor)
- **2026-02-12** – Clone iniziale da GitHub + setup MongoDB Atlas

## 🔒 Privacy & GDPR

- **Nessun indirizzo IP** viene memorizzato negli eventi analytics
- **Nessun user-agent grezzo** viene memorizzato
- Vengono salvati solo: timestamp, tipo evento, città/regione/paese (aggregato), categoria device (mobile/tablet/desktop), OS family e browser family
- Cookie: solo essenziali (`access_token`, `vendor_token`) per autenticazione — niente cookie di tracking
- Cache geo IP → città mantenuta in `db.geo_cache` per max 7 giorni, ruotata automaticamente
- Eventi analytics legacy (pre-Feb 2026) vengono "scrubbati" automaticamente allo startup del backend (campi `ip` e `user_agent` rimossi)
- **Cookie banner customizzabile** sulla landing pubblica: l'org admin lo abilita/personalizza in Impostazioni Organizzazione → si memorizza l'accettazione in `localStorage` (no server roundtrip)
- **Pagina Note Legali** integrata accessibile da `/dashboard/legal` per super admin e org admin con: disclaimer MIT, limiti free tier servizi terzi, responsabilità org admin sul proprio dominio
