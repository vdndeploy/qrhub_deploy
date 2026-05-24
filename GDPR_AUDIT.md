# QRHub – GDPR Audit & Gap Analysis

**Ultimo aggiornamento:** 2026-05-23 (sprint pre-beta)
**Versione documento:** 2.0
**Scope:** intera piattaforma multi-tenant (backend FastAPI + frontend React + landing page pubbliche)
**Verdetto attuale:** 🟢 **READY** — GDPR-compliant per il lancio beta

---

## A. COMPLIANCE SUMMARY — stato attuale

| Dimensione | Stato |
|---|---|
| **GDPR Ready per produzione?** | 🟢 **READY** — tutti i blocker critici risolti; controlli organizzativi (DPA) e tecnici (security + diritti) implementati |
| Documenti legali | 🟢 ok — Privacy Policy interna + landing dedicata (`/v/:vendorId/privacy`) + Terms pubblici (`/terms`) + License (`/license`) |
| Multi-tenant isolation | 🟢 ok — `_tenant_filter` applicato a 100% degli endpoint sensibili (analytics, vendors, stores, posts, files, audit) |
| Auth | 🟢 ok — JWT + bcrypt + rate-limit login + session revoke (token_version) + password change |
| Diritti interessato (export/erasure) | 🟢 ok — `GET /api/me/data-export`, `DELETE /api/me`, `POST /api/me/revoke-all-sessions` |
| Cookie/tracking | 🟢 ok — solo cookie tecnici, banner sempre visibile sulle landing, link informativa obbligatorio |
| Subprocessor SCC / data residency | 🟢 ok — sezione SCC esplicita su Legal.js con region/clausole per Fly/Atlas/Cloudinary/Vercel |
| Security headers | 🟢 ok — HSTS + X-Frame-Options + X-Content-Type-Options + Referrer-Policy + Permissions-Policy + CSP frame-ancestors |
| DPA controller↔processor | 🟢 ok — flow di accettazione `/dashboard/dpa` + **DPA gating sulle landing pubbliche** |
| Audit trail | 🟢 ok — collection `db.audit_log` + pagina `/dashboard/audit` |

---

## B. STATO DELLE ISSUE STORICHE

### 🔴 CRITICAL (originariamente blocker pre-launch) — TUTTE RISOLTE

| # | Gap originale | Stato | Risoluzione |
|---|---|---|---|
| **C1** | IP utenti finali salvati 7gg in `geo_cache` (mismatch con Legal.js) | ✅ **CHIUSA** | Cache ora chiavata su `subnet` anonimizzato (`/24` IPv4, `/48` IPv6). Pulizia legacy + testo Legal.js allineato |
| **C2** | Cross-tenant data leak via `/api/analytics/export/pdf` | ✅ **CHIUSA** | Tenant scoping applicato + `_build_detailed_analytics` con `vendor_id` validato contro la org dell'utente |

### 🟠 HIGH PRIORITY — TUTTE RISOLTE

| # | Gap originale | Stato | Risoluzione |
|---|---|---|---|
| **H1** | Nessun rate-limit su login | ✅ **CHIUSA** | 5 tentativi / 15 min per (email+IP) — admin + vendor login |
| **H2** | Nessun endpoint diritti interessato | ✅ **CHIUSA** | `GET /api/me/data-export`, `DELETE /api/me`, vendor counterparts |
| **H3** | Nessun session revoke | ✅ **CHIUSA** | `token_version` su user + `POST /api/me/revoke-all-sessions`; password change bumpa il version |
| **H4** | Privacy Policy assente per visitatori landing | ✅ **CHIUSA** | Pagina `/v/:vendorId/privacy` generata server-side con titolare, finalità, retention, diritti, contatti |
| **H5** | Cookie banner opzionale | ✅ **CHIUSA** | Banner sempre visibile su tutte le landing + link informativa obbligatorio |
| **H6** | DPA template assente | ✅ **CHIUSA** | DPA v1.0 + flow accept `/dashboard/dpa` + banner pending al primo login. **Inoltre**: DPA gating sulle landing pubbliche — vedi sezione D.1 |
| **H7** | Titolare del trattamento non identificato sulle landing | ✅ **CHIUSA** | Footer landing con legal_name, P.IVA, sede, email privacy (pull da `organizations.legal_*`) + trust badge "Titolare verificato" quando completo |

### 🟡 MEDIUM — TUTTE RISOLTE

| # | Gap originale | Stato |
|---|---|---|
| **M1** | Cloudinary folder non tenant-prefixed | ✅ **CHIUSA** — folder `org_{id}/uploads`, `org_{id}/posts`, `platform/*` per super admin |
| **M2** | Security headers assenti | ✅ **CHIUSA** — HSTS, X-Frame, X-Content, Referrer, Permissions, CSP `frame-ancestors none` |
| **M3** | Retention analytics infinita | ✅ **CHIUSA** — TTL index 365gg + cleanup `login_attempts` ad ogni startup |
| **M4** | Default JWT_SECRET nel codice | ✅ **CHIUSA** — warning critico se < 32 byte all'avvio + JWT generator dal pannello |
| **M5** | Trasferimenti extra-UE / SCC non menzionati | ✅ **CHIUSA** — sezione dedicata su Legal.js con clausole per ogni sub-processor (Fly EU-only, Cloudinary US+SCC+DPF, Atlas SCC, Vercel SCC, ipapi EU) |
| **M6** | Data minimization debole | ✅ **CHIUSA** — `Field(..., max_length=N)` su tutti i Pydantic input (Login, Store, Vendor, Org, OrgUser, Password) |
| **M7** | CSRF / cookie policy | ✅ **MITIGATA** — `samesite=lax` + `secure` in prod + cookie HttpOnly. Endpoint mutating richiedono comunque auth header/cookie |
| **M8** | Email in chiaro nei log | ✅ **CHIUSA** — helper `_redact_email()` applicato a tutti i `logger.info` di auth/seed/rotate |

### 🟢 LOW / NICE TO HAVE

| # | Gap | Stato |
|---|---|---|
| L1 | Link GitHub generico in Legal.js | ✅ **CHIUSA** — sostituito con i nuovi link `/terms`, `/privacy`, `/license` |
| L2 | Versioning consent cookie | 🟡 parziale — il banner salva `ISO timestamp` su localStorage (`qrhub_cookie_ack_<orgId>`). Versioning esplicito (v1/v2) rimandato a futura iterazione |
| L3 | Tabella `consent_records` server-side | 🟡 deferred — non necessario finché non si introduce profilazione/marketing |
| L4 | Granularità UA ridotta | 🟡 deferred — oggi `family + version` è già lontano dal fingerprinting |
| L5 | Privacy scrub schedulato | ✅ **CHIUSA** — scrub on startup + TTL index su analytics → equivalente a un cron giornaliero |

---

## C. NUOVE FEATURE GDPR-RELATED IMPLEMENTATE NEL POST-AUDIT

| Feature | Riferimento codice |
|---|---|
| **DPA gating landing pubbliche** | `backend/server.py` → `get_vendor_public()` segna `inactive_reason: 'dpa_pending'` se l'org non ha alcun admin che ha firmato il DPA v1.0; `frontend/src/pages/VendorLanding.js` rende la schermata "Servizio non ancora attivo" se visitatore (preview admin esclusa) |
| **Preview admin via signed JWT** | `POST /api/vendors/{id}/preview-token` (admin auth) → JWT 30min scope `vendor_preview`; `GET /api/preview/check` valida senza cookie (cross-domain safe). Le sessioni preview NON tracciano analytics. |
| **GDPR backfill on startup** | `Organization.data_profiling_text` + `terms_text` popolati con default italiani idempotenti su org pre-esistenti |
| **Profilazione editabile per-org** | `OrgSettings.js` → due textarea che alimentano la pagina `/v/:id/privacy` |
| **OG/Twitter compatto** | `og:image` con trasformazione Cloudinary on-the-fly (`c_fill,g_face,w_400`) + `twitter:card = summary` → thumbnail tonda piccola su WhatsApp/Telegram |
| **Audit log centralizzato** | `db.audit_log` + `GET /api/audit` + pagina `/dashboard/audit` (tenant-scoped) |
| **Structured opening hours + "Aperto adesso"** | `HoursEditor.js` → modello strutturato per giorno con pausa pranzo; pure function `computeOpenStatus()` calcola lo stato in tempo reale (open/closing_soon/opening_soon/closed) |
| **UI Dark + Lime accessibile** | Toggle Light/Dark in dashboard, `prefers-color-scheme` rispettato al primo accesso |
| **Pulizia tab Secret** | Rimossi i secret legacy `ADMIN_EMAIL` / `ADMIN_PASSWORD` (org-admin si crea via pannello). `SUPERADMIN_PASSWORD` resta come unica credenziale infrastrutturale env-driven |
| **Ghost logout SPA fix** | `AuthContext.js` + `VendorAuthContext.js` ora persistono la sessione su navigazione SPA (no logout fantasma tra marketing → login) |
| **Footer legale Login** | `LoginLegalFooter.js` linkato in Login.js + VendorLogin.js → Termini · Privacy · Licenza |
| **Email contatto unificato** | `collaborazioni@qrhub.it` come canale unico per richieste GDPR / collaborazioni |

---

## D. CONTROLLI ARCHITETTURALI DEL POST-AUDIT

### D.1 DPA Gating delle Landing — flow operativo

```
1. Super-admin crea l'organizzazione X.
2. Org-admin di X effettua il primo login → banner "Devi firmare il DPA"
   blocca la dashboard finché non clicca su /dashboard/dpa.
3. Org-admin accetta DPA v1.0 → db.users[].accepted_dpa_version = '1.0',
   accepted_dpa_at/ip salvati nell'audit GDPR.
4. Da quel momento le landing /v/:vendorId dei vendor di X diventano pubbliche
   sul dominio canonico verificato dell'org.
5. Prima del punto 4, qualsiasi visitatore arriva su /v/:vendorId vede la
   pagina "Servizio non ancora attivo".
6. ECCEZIONE: gli admin possono comunque previewizzare la landing dal pannello
   (Vendors → Eye icon → preview-token JWT 30min) — il banner verde sticky
   segnala "DPA non ancora accettato" e gli analytics NON vengono tracciati.
```

### D.2 Domain Isolation

- `<DomainGuard>` (frontend) legge `/api/platform/config` al boot e applica
  policy host-based:
  - Su `qrhub.it` (primary domain platform) e su `*.preview.emergentagent.com`,
    `*.vercel.app`, `*.emergent.host`: **tutto** il pannello admin disponibile,
    le landing `/v/:vendorId` sono accessibili solo via preview-token o sul
    dominio canonical dell'org.
  - Su tenant custom domains (es. `app.vdn.srl`): solo `/v/*` viene servito;
    ogni altra route reindirizza al primary domain.

### D.3 GDPR Status per Organizzazione

`GET /api/organizations` (super-admin) enriches each org con:
```json
{
  "gdpr": {
    "dpa_required_version": "1.0",
    "dpa_admins_total": 2,
    "dpa_admins_accepted": 1,
    "dpa_status": "accepted",
    "dpa_last_accept_at": "2026-05-22T...",
    "controller_fields_filled": 4,
    "controller_fields_required": 4,
    "controller_complete": true
  }
}
```

---

## E. SUB-PROCESSOR REGISTER (aggiornato)

| Sub-processor | Ruolo | Data residency | Garanzie |
|---|---|---|---|
| **Fly.io** | Hosting backend | EU (region `fra`) | DPA pubblico + SCC |
| **MongoDB Atlas** | Database principale | EU multi-region | DPA + SCC |
| **Cloudinary** | Storage media (foto profilo, post) | US | DPA + SCC + DPF (Data Privacy Framework) |
| **Vercel** | Hosting frontend statico | Edge globale | DPA + SCC |
| **ipapi.co** | Geo-lookup IP→città (solo subnet anonimizzata) | EU | Privacy Policy + nessun PII conservato lato QRHub |

Nessun trasferimento dati personali verso paesi terzi senza adeguate garanzie. Le subnet IPv4/IPv6 anonimizzate inviate a ipapi.co non sono considerate dato personale ex Considerando 26 GDPR.

---

## F. APERTI / NICE-TO-HAVE (non-blocker)

| ID | Task | Effort | Priorità |
|---|---|---|---|
| Email-change flow | Integrazione SMTP (Resend/SendGrid) per cambio email self-service in `MyAccount.js` con link di conferma | ~2h | P1 |
| Server.py Phase-2 refactor | Estrarre `auth/orgs/vendors/users` da `server.py` in router modulari | ~4h | P1 |
| L2 — Consent versioning esplicito | Salvare `version` + `ts` nel localStorage del banner cookie | ~30m | P2 |
| L3 — Tabella `consent_records` server-side | Necessaria solo se si introduce profilazione/marketing | ~1h | P3 |
| L4 — UA family-only | Salvare solo browser family senza version minor | ~15m | P3 |
| PWA / Service Worker landing | Caricamento offline-first per `/v/:vendorId` | ~2-3h | P2 |

---

## G. CONCLUSIONE

> **QRHub è GDPR-compliant per il lancio beta.** Tutti i gap critici e high-priority dell'audit originale del 2026-05-17 sono stati risolti tra il 2026-05-17 e il 2026-05-23. Gli aperti residui (email-change, refactor interno, consent versioning, PWA) sono **enhancement non-blocker** che non incidono sulla conformità.

**Stato finale:** 🟢 **READY FOR BETA LAUNCH**

Prossimi passi consigliati:
1. Comunicare agli org-admin esistenti la pagina `/dashboard/dpa` per finalizzare l'accettazione del DPA v1.0 (necessaria per attivare le landing pubbliche).
2. Verificare con un test reale post-deploy che la pagina "Servizio non ancora attivo" venga renderizzata su un'org senza DPA accettato.
3. Pianificare il refactor `server.py` Phase 2 + email-change come prossima iterazione tecnica.
