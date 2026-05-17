# QRHub — by QRHub

Piattaforma multi-tenant per generare e gestire landing page con QR code per venditori, con analytics, post a carosello, branding per-cliente e dashboard di deploy integrata.

**Open source · MIT** · creato da [QRHub](https://github.com/<your-github-org>/<repo>) — senza scopo di lucro.

## Quick start

📖 **Per la documentazione completa leggi [GUIDA.md](./GUIDA.md)** — include setup, deploy, rotazione credenziali, monitoring, troubleshooting e come riprendere il progetto in futuro.

### Demo credenziali default
| Ruolo | Email | Password |
|-------|-------|----------|
| Super Admin | `superadmin@qrhub.it` | `changeme123` |
| Org Org Admin | `admin@example.com` | `admin123` |

> ⚠️ Cambia entrambe in produzione dal pannello super admin → tab Secrets → "Ruota credenziali".

## Stack

- **Backend**: FastAPI + Motor (MongoDB) — `/backend`
- **Frontend**: React 19 + CRACO + Tailwind + shadcn/ui — `/frontend`
- **DB**: MongoDB Atlas
- **Storage**: Cloudinary
- **Deploy**: Fly.io (backend) + Vercel (frontend)

## Avvio rapido

```bash
# Backend
cd backend && pip install -r requirements.txt
cp .env.example .env  # poi modifica con i tuoi valori
uvicorn server:app --reload --port 8001

# Frontend (altro terminale)
cd frontend && yarn install
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env
yarn start
```

Apri http://localhost:3000 → login con le credenziali default.

## Deploy

Tutto guidato dal pannello super admin → `/dashboard/settings`:
- Tab Fly.io: token, applica secrets, redeploy
- Tab Vercel: deploy hook
- Tab Secrets: rotazione JWT/password
- Tab Monitor: uptime live 24h
- Tab Cloudinary / GitHub: riferimenti

Vedi [DEPLOY.md](./DEPLOY.md) per il primo deploy via CLI e [GUIDA.md](./GUIDA.md) per tutto il resto.

## Licenza

Open source — **MIT License** — vedi [LICENSE](./LICENSE).

Creato e mantenuto da **QRHub** · Progetto senza scopo di lucro.

> l'organizzazione cliente è uno degli utilizzatori finali della piattaforma, non il proprietario del codice.
