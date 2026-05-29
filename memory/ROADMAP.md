# QRHub — Roadmap

> Stato live: produzione su Fly v51 + Vercel · 0 bug aperti · costo mensile ~$0.43 (Fly uso reale)

## 🎯 Macro-stato funzionalità

| Area | Stato |
|---|---|
| Multi-tenant + org_id scope | ✅ Done |
| Landing pubblica `/v/:vendor` con branding org | ✅ Done |
| QR code + slug personalizzato | ✅ Done |
| Annunci multi-store + drag&drop sort | ✅ Done |
| Analytics aggregate GDPR-friendly | ✅ Done |
| Conta persone giornaliero (KPI) | ✅ Done |
| PDF report analytics | ✅ Done |
| Badge PDF stampa | ✅ Done |
| PWA per-org (icona + manifest) | ✅ Done |
| Custom domain + DNS verify (Vercel API) | ✅ Done |
| Media Library Cloudinary tenant-scoped | ✅ Done |
| Cambio password self-service | ✅ Done |
| DPA hardenizzato v1.1 (Art. 28 GDPR) | ✅ Done |
| Backup DB + Backup GitHub | ✅ Done |
| Free-tier Usage Monitor + Billing | ✅ Done |
| Refactor server.py Fase 1 (3 router) | ✅ Done |

---

## 🚧 Da fare — prioritizzato

### 🟡 P1 — Medio termine

| ID | Task | Effort | Note |
|---|---|---|---|
| **CAL-1** | **Calendario appuntamenti** sulla landing venditore con sync Google Calendar. Cliente prenota slot, vede disponibilità, lascia nome/cognome/telefono + consenso GDPR. Anti-doppia-prenotazione via lock Mongo + FreeBusy check. Tab "Calendario" nelle Impostazioni Negozio. | ~13h | Deferred 29/05 per budget. Scoping completo in ROADMAP.md sezione "Note scope" sotto |
| **EMAIL** | **Flusso "Cambia email"** in `MyAccount.js` con conferma via SMTP (Resend / SendGrid / Gmail SMTP da scegliere) | ~2h | Stub già presente in UI |
| **REFACTOR-2** | Refactor `server.py` Fase 2: estrarre `auth`, `orgs`, `vendors`, `users` in router modulari | ~4h | Fase 1 già completata |
| **OG-1** | Open Graph card dinamica per `/v/:vendor` con immagine 1200×630 brandizzata | ~3h | Migliora condivisione su WhatsApp/Telegram |
| **GDPR-H2** | Endpoint GDPR utente: `GET /api/me/data-export`, `DELETE /api/me`, `POST /api/me/revoke-all-sessions` | ~3h | Completa "diritti dell'interessato" GDPR |
| **GDPR-H3** | Session revoke server-side con `token_version` su user doc | ~1h | |

### 🟢 P2 — Backlog (nice-to-have)

| ID | Task | Effort |
|---|---|---|
| **PWA-LANDING** | Service Worker su `/v/:vendorId` per caricamento offline-first | ~3h |
| **BACKUP-REMIND** | Banner reminder "Ultimo backup DB: X giorni fa" nel dashboard super admin | ~30min |
| **USAGE-ALERT** | Alert email/toast quando un provider supera 80% del free tier | ~30min |
| **M1** | Cloudinary folder tenant-prefixed (`org_{id}/uploads`, `org_{id}/posts`) | ~1h |
| **M2** | Security headers middleware: HSTS, X-Frame-Options, CSP base | ~1h |
| **M3** | TTL index su `analytics.timestamp` (retention 365gg) | ~1h |
| **M5** | Sezione "Trasferimenti extra-UE e SCC" su Legal.js | ~30min |
| **M7** | CSRF token su mutating endpoints | ~2h |
| **M8** | Redaction email nei log applicativi | ~30min |
| **L1** | Fix link GitHub in Legal.js → repo reale `vdndeploy/qrhub_deploy` | ~5min |
| **L2** | Versioning cookie consent (date + version) | ~30min |
| **L4** | Granularità UA family-only (drop versione browser) | ~15min |
| **RL** | TTL index su `login_attempts.ts` + split rate-limit per evitare lockout NAT | ~45min |

---

## 📋 Note scope per task deferred

### CAL-1 — Calendario appuntamenti (scope dettagliato)

**Obiettivo**: clienti finali prenotano slot dalla landing `/v/:vendor` → evento creato nel Google Calendar del negozio (es. `legnago@vdn.srl`).

**Architettura preferita**:
- Google Calendar = fonte di verità (OAuth 2.0, refresh token salvato cifrato)
- FreeBusy API per slot liberi in tempo reale
- Create event su conferma prenotazione
- Lock Mongo + double-check FreeBusy = anti-doppia-prenotazione

**Per-store config** (nuova tab "Calendario" in Impostazioni Negozio):
- `google_calendar_id` (default: primary del account collegato)
- `google_refresh_token` (cifrato a riposo)
- `appointment_duration_minutes` (default 30)
- `appointment_buffer_minutes` (default 0)
- `appointment_advance_days` (max futuro, default 14)
- `appointment_min_notice_hours` (anticipo min, default 2)
- Riusa `store.hours` come finestra business hours

**Frontend**:
- Sulla landing: card "Prenota appuntamento" → date picker → griglia slot → form (nome, cognome, telefono, consenso GDPR) → conferma
- Nel pannello: tab "Calendario" con bottone "Connetti Google Calendar" (OAuth flow)

**GDPR**:
- Telefono = PII → aggiungere all'informativa landing (per-org)
- Retention: 6 mesi dopo l'appuntamento → cancellazione automatica
- Diritto cancellazione: link univoco "cancella prenotazione" via email/SMS

**Decisioni aperte** (da chiedere quando si riprende):
- Connessione: OAuth per-negozio vs Service Account con DWD?
- Notifiche cliente: email (Resend)? SMS (Twilio)? niente?
- Annullamento cliente: link self-service o solo telefono?
- Categorie appuntamento: predefinite, libere, nessuna?

**Pre-requisito tecnico**: serve un Google Cloud Project con Calendar API attiva + OAuth Client (utente lo creerà al momento, guida disponibile su Cloud Console).

---

## ✋ Tasks rinviati o annullati

- **POSTS-MULTISTORE** (P0 storico 24/05) → ✅ Completato 27/05 con `group_id` system invece di `store_ids` array (scelta semplice in fase di implementazione)
- **DPA flow per org_admin H6** → ✅ Completato 29/05 con bump v1.0→v1.1 (DPA gate al login)
