# Plan — Clinic web dashboard + satellite tills (v2.1)

Previous plan (posgro licensing, v2.0.0) is done and committed in `2856f9d`; its review is in git history.

## Decisions (owner, 2026-11-15)
1. **Data home:** revive the posclinic server (`src/server`, Postgres). The **main till** syncs up to it; the owner uses `src/web`. posgro stays licensing-only.
2. **Scope:** patients/visits/reports read-only on the web; **services, prices, doctors, staff** editable on the web and synced down.
3. **Web users:** clinic admins only (`CLINIC_ADMIN`/`SUPER_ADMIN` till roles), same phone + password as on the till.
4. **Tills:** one main till (database, licence, sync) plus **satellite tills on the LAN** that do everything the main can, by remote calls to the main (SavdoChef design).
5. **Hosting:** new container stack on the posgro VPS, own domain + staging copy.
6. **Plans:** dashboard and satellites on **all plans**; satellites limited only by the licence `terminals` (devices = terminals − 1; VIP unlimited).
7. **Satellite:** full till (register, visit, checkout, print). Licence, LAN, updater and setup stay per machine.

## Architecture
```
 satellite till ──LAN RPC──▶ MAIN TILL (SQLite = source of truth) ──HTTPS sync──▶ posclinic server (Postgres) ◀── web dashboard (admins)
                                   │                                     ▲
                                   └──── licence check-in ──▶ posgro ────┘ (server verifies the posgro licence with the public key)
```
- **Till → server credential = the posgro licence token** (same idea as posgro `licenses/renew`). The server holds only the POSCLINIC **public** key, verifies the signature, and takes `storeId` as the clinic id. No passwords or secrets on the till; a blocked licence stops sync. No posgro change needed.
- **Sync rules:** up (main → server): patients, appointments + items, users (bcrypt hash), doctors, services. Down (server → main): doctors, services, users edited on the web. Catalog conflicts: last-write-wins by `updatedAt`, ids are UUIDs everywhere, deletes are soft (`active=false`). Visits and patients are only created on tills, so there are no conflicts there.
- **Satellite RPC:** the `handle(channel, fn)` helper in `src/main/ipc/ipc-safe.ts` becomes the single branch point. On a satellite it forwards `{channel, args}` to the main over LAN; on the main it runs the same handler with a per-caller context. Licence, roles and validation all run on the main.

## Phase 0 — housekeeping
- [ ] Commit pending work on `feature/posgro-licensing`: the updater, release scripts, icons, the `import type` controller fix, the `src/web` proxy.
- [ ] New branch `feature/clinic-dashboard`. Update CLAUDE.md: `src/server` + `src/web` are **active again** (no longer frozen).

## Phase 1 — posclinic server (`src/server`, `prisma/schema.prisma`)
- [ ] **Schema** (new migration; see open question A on existing data):
  - `Tenant`/`Clinic` keyed by the posgro `storeId` (`Clinic.id = storeId`); drop `clinicCode`, self-registration, `contactEmail` unique.
  - `User`: `phone` required, unique per clinic, `+998XXXXXXXXX`; `email` optional; drop `emailVerified`, `googleId`, OTP table. `role` mirrors the till roles.
  - Plan/tier no longer stored as an enum: `licensePlan String?` and `licenseExpiresAt` copied from the last verified licence, for display only.
  - Sync bookkeeping: `TerminalHeartbeat` reused (main + satellites count, last sync).
- [ ] **Remove** OTP, email (`mail.service.ts`, nodemailer), Google OAuth, `/auth/register|request-otp|verify-otp|set-password|create-clinic|forgot-password|reset-password`, `electron/setup`, platform-admin clinic list (posgro owns clinics).
- [ ] **Licence auth:** `LicenseGuard` reads `Authorization: License <token>`, verifies Ed25519 with `POSCLINIC_LICENSE_PUBLIC_KEY` (shared contract), rejects other products, stale `checkinBy`, or a blocked state → `request.clinicId = storeId`. Clinic row auto-created on first sync.
- [ ] **Sync API** (idempotent, batched ≤ 200, one `$transaction` per batch):
  - `POST /sync/push` `{patients, appointments, users, doctors, services}` → upsert by id. Appointments upsert their items. Users carry the hash, never plaintext.
  - `GET /sync/pull?since=` → doctors, services, users changed since the cursor (including inactive), plus `serverTime`.
  - Fixes the old bug: patients were never pushed, so appointment foreign keys failed.
- [ ] **Dashboard auth:** `POST /auth/login {phone, password}`; only active admins of a clinic whose last licence is not blocked (like posgro's `dashboardLoginBlockReason`). JWT `{sub, clinicId, role}`.
- [ ] **Catalog CRUD** for admins: services, doctors, users (create/edit/deactivate, reset password). Writes bump `updatedAt` so the main pulls them. Audit log row on every mutation.
- [ ] **Read APIs:** patients (search, detail + visits), appointments (filters), reports (daily, monthly, by doctor and service, debt).
- [ ] Every query scoped by `clinicId` from the JWT or the licence, never from the body. Logs carry ids only, never patient fields.
- [ ] Tests (node:test via tsx, like the till; service level with a fake Prisma, plus one run against the local Postgres): LicenseGuard, push idempotency, LWW pull, clinic scoping, login refusals.

## Phase 2 — main till sync (`src/main/sync/`, SQLite)
- [ ] SQLite, **additive in-place upgrade** (tills are in the field from 2.0.0):
  - new table `sync_state(entity TEXT PRIMARY KEY, push_cursor TEXT, pull_cursor TEXT)`;
  - index on `updated_at` for the synced tables.
  - Remove the unused `sync_queue` table only if it is empty (otherwise leave it).
- [ ] `sync-service.ts` (main only): push rows with `updated_at > push_cursor` in batches, then pull since `pull_cursor` and apply LWW. Runs every 60 s and after writes (debounced). Offline = silent retry with backoff.
- [ ] Every handler that writes sets `updated_at` (check patients/doctors/services/users/appointments handlers).
- [ ] Settings → "Cloud sync" status row (last sync, pending count, error).
- [ ] Contract update: `.claude/rules/licensing.md` gets "the licence is also the sync credential for the posclinic server".

## Phase 3 — web dashboard (`src/web`)
- [ ] Login by phone + password; remove Register, Google and forgot-password pages. Recovery is done by an admin (Telegram later).
- [ ] Pages: Dashboard (today, month, top services and doctors), Patients (list, search, detail with visit history, read-only), Appointments (filters, read-only), Reports daily/monthly (+ by doctor, by service, debt), **Services (CRUD, prices)**, **Doctors (CRUD)**, **Staff (CRUD, phone login, role, reset password)**, Devices (main + satellites, last seen, last sync), Subscription (plan/expiry from the licence, read-only).
- [ ] Remove `admin/clinics` and audit pages for platform admins (posgro is the super admin). Keep a per-clinic audit log page.
- [ ] i18n ru + uz for every string (shares the renderer locale files via the `@i18n` alias).
- [ ] Builds into `dist/web`, served by Nest at `/web` (as now).

## Phase 4 — satellites (port of SavdoChef `src/main/lan/`)
- [x] **Handler context refactor first:** handlers get `ctx = { actor, terminalId }` instead of reading the module-global `currentUser` (auth-handlers). Add role checks the review flagged (receptionist cannot edit services, doctors or staff).
- [x] Port `config.ts`, `devices.ts`, `pairing.ts`, `serve-policy.ts`, `server.ts`, `main-link.ts`, `lan-service.ts` + `lan.test.ts`, `satellite.e2e.test.ts`. Adapt:
  - app id `posclinic`, default port 5180;
  - header `Authorization: Posclinic <deviceId>.<secret>`;
  - `NOT_OVER_LAN` = `license:*`, `setup:*`, `update:*`, `lan:*`, `config:*`.
- [x] SQLite (additive): `lan_devices(id, name, secret_hash, ip, last_seen_at, active, created_at)`; `lan_role` and `lan_link` (secret encrypted with `safeStorage`) in a `settings` table (new).
- [x] RPC: `handle()` → on a satellite, forward; on the main, run with the caller's session actor. Login on a satellite gives a per-device session token on the main.
- [x] **Printing on a satellite stays local:** `print:*` runs on the satellite's own printer, fetching the visit over RPC.
- [x] Concurrency: `appointmentNumber` is generated inside a transaction with retry on the unique conflict (two desks at once).
- [x] Device limit = licence `terminals − 1` (null = unlimited). Satellites never contact posgro or the posclinic server; the main's licence gates every forwarded call.
- [x] Events: main → satellites SSE so lists refresh (`appointments/patients/catalog changed`).
- [x] Renderer (React):
  - setup wizard step 0 "Main till / Extra till";
  - join form (main address + 6-digit code);
  - Settings → Satellites (enable, port, addresses, code with countdown, devices + revoke, firewall command);
  - "Waiting for main till" overlay driven by link state.
- [x] i18n ru + uz.

### Phase 4 review (2026-11-15, v2.2.0)
- `handle()` only records handlers (`ipc/ipc-safe.ts`, Electron-free); `ipc/dispatch.ts` binds them to ipcMain and is the one branch point (main: run with the window's actor; satellite: forward over `lan/main-link.ts`).
- Deviations from SavdoChef: `license:status` is forwarded (a satellite shows and hides by its main's plan); `sync:*`, `app:*`, `print:*` are also local-only; join only from the setup wizard (no unattended re-pair; leave → setup again); patient codes get the same transaction + retry as visit numbers; the remember-me token is now HMAC-signed (old unsigned tokens are refused once, users sign in again after the update).
- Tests: `lan/lan.test.ts` (13) + `lan/satellite.e2e.test.ts` (19, real handlers over a real server on 127.0.0.1); `npm run check` 90/90, `electron-vite build` green.
- Not verified without two machines: real LAN + Windows firewall, safeStorage on the satellite, relaunch after join/leave, printing on a satellite printer (printing is still a log stub).

## Phase 5 — deploy (posgro VPS)
- [ ] `Dockerfile` + `docker-compose.yml` / `docker-compose.staging.yml` in posclinic: `posclinic-server` + its **own** `posclinic-postgres` (separate from posgro's database: medical data, own backups), not published publicly; `RUN_MIGRATIONS`.
- [ ] GitHub Actions `deploy-staging.yml` (dev) / `deploy.yml` (main) modelled on posgro's (ENV_FILE secret, ssh to `posgro-vps`).
- [ ] **User:** DNS for e.g. `clinic.posgro.uz` + `dev.clinic.posgro.uz`, nginx server blocks + TLS (certbot), GitHub secrets.
- [ ] Till: `POSCLINIC_SERVER_URL` compiled default (prod), dev override only when unpackaged (same rule as `POSCLINIC_API_URL`).

## Versioning
- Till: **2.1.0** (minor: new features, additive SQLite). Server/web: no Electron bump.

## Verification
- Server: tests + `build:server`; Swagger smoke test; push the same batch twice → no duplicates; a licence for another product → 401.
- Till: `npm run check`, the ported `lan.test.ts` + `satellite.e2e.test.ts` (real LAN server on 127.0.0.1), sync service tests with a fake server.
- End to end on staging:
  1. A main till links the Demo clinic and creates a patient and a visit. They appear on the web within 60 s.
  2. Edit a service price on the web. The main shows it after the next pull.
  3. Pair a satellite. A visit created there lands in the main DB and on the web, and prints on the satellite's printer.
  4. Revoke the satellite → refused. Exceed `terminals` → pairing refused.
  5. Expire the licence in posgro → sync refused and dashboard login refused.

## Risks
- **Medical data leaves the clinic again** → TLS only, licence auth, clinicId scoping, no patient fields in logs, own database with backups; VPS location vs the Uzbekistan personal-data localisation rule (owner to confirm).
- **LAN has no TLS** (SavdoChef design) → private-address-only plus pairing code plus 256-bit device secret. Option: pin a self-signed certificate at pairing (later).
- The main's IP changes break satellites → advise a DHCP reservation; "change main address" action (posgro `repointMain`) as a follow-up.
- Big change set → ship in phase order; each phase is usable on its own (1+2+3 = dashboard; 4 = satellites).

## Open (answer before Phase 1)
- **A.** Does `posclinic.bobur-dev.uz` (old server) hold any real clinic data? If none → reset to one fresh baseline migration. If yes → additive migrations + data mapping.
- **B.** Domain names: `clinic.posgro.uz` / `dev.clinic.posgro.uz`? Something else?
