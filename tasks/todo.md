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

---

# Uzbekistan address selection (v2.4.0, till only) — done

Decisions (owner, 2026-11-15): till only, no server tables/API; no React Query (session cache in the renderer); 2 levels (region → district/city) + street text.

- [x] Verified SOATO dataset (stat.uz classifier 2022 + SIAT 2026 cross-check), 220 units, no invented codes → `src/main/database/data/admin-units.json`, provenance + gaps in `docs/addresses.md`, `docs/addresses/GAPS.md`, build scripts in `tools/soato/`
- [x] `admin_units` table + `patients.region_code/district_code` (in-place, additive)
- [x] Idempotent import on DB open (hash version, deactivate never delete, failure never blocks opening)
- [x] IPC `addresses:regions`, `addresses:children`; patients:create/update validate the pair (`errors.invalidAddress`)
- [x] `AddressSelector` + `AddressText` + `useAdminUnits` cache; PatientForm / PatientDetails
- [x] i18n uz + ru
- [x] Tests `src/main/ipc/address.test.ts` (11); `npm run check` 117/117; pos build OK

## Review

- `patients.city` keeps "District, Region" (Uzbek) for the server/web, which have no dataset; the till shows names in the app language from the codes.
- Legacy patients keep their free-text city until a region is chosen (shown as a hint in the form).
- Not verified by hand in the running till yet.

---

# Plan: Clinical workflow (reception → doctor → analysis → treatment), v2.5.0

## Decisions (owner, 2026-11-15)
1. A doctor's login is linked to their doctor record. Doctors see their own queue and never take money; payment is at reception only.
2. One **case** (episode) groups the whole journey. Each registration at reception is a paid order inside the case. The case shows its status.
3. Prepay always. A repeat consultation is **free automatically within 14 days** of the paid consultation in the same case. It is still registered at reception (price 0), so it appears in the doctor's queue.
4. Every service gets a type:
   - CONSULTATION: needs a doctor;
   - ANALYSIS: no doctor, has a structured result plus a comment;
   - PROCEDURE: no doctor, can be a course.

   Whoever has the result enters it, and the doctor confirms it.
5. The doctor's referral appears at reception, ready to register. A course can be paid in full upfront (with an optional discount) or per day. Sessions are ticked off ("3 of 10").
6. Vitals (height, weight, …) are recorded **per visit**, and the latest is shown. The doctor writes doses for now; calculation comes later when the owner gives the rules.
7. Setup:
   - reception = main till; doctor's PC = satellite; optional third PC for the nurse/lab (also a satellite).
   - Search by name, phone, patient code, region/district and last visit.
   - The queue ticket/receipt after payment is optional (a setting).
8. The new medical fields are added to the patient form. The owner's own form design comes later.

## Data model (SQLite; in-place upgrades in `schema.ts` + `schema.sqlite.prisma`)
| Change | Kind |
|---|---|
| `services` + `kind` (CONSULTATION / ANALYSIS / PROCEDURE, default PROCEDURE; seeded PAR-CONS/PAR-CONS2 = CONSULTATION, analyses = ANALYSIS), `is_follow_up` (PAR-CONS2), `result_type` (QUALITATIVE / QUANTITATIVE / TEXT), `result_unit`, `reference_range` | new columns with defaults |
| `doctors` + `user_id` (unique, nullable): the doctor's login | new column |
| `patients` + `chronic_conditions` | new column |
| `clinical_cases` (case number, patient, lead doctor, status OPEN / WAITING_DOCTOR / WAITING_ANALYSIS / RESULT_READY / ON_TREATMENT / CLOSED, complaint, diagnosis, opened/closed at) | new table |
| `appointments` + `case_id`, `discount_amount`; **`doctor_id` becomes nullable** (an analysis or procedure order has no doctor) | see Q1 |
| `appointment_items` + `doctor_id` (nullable), `status` (WAITING / IN_PROGRESS / DONE / CANCELLED), `discount`, `referral_id`, `performed_by`, `started_at`, `completed_at` | new columns |
| `patient_vitals` (patient, case, height cm, weight kg, temperature, blood pressure, complaints, pregnancy flag, recorded by/at) | new table |
| `referrals` (case, patient, doctor, service, quantity, per day × days, instructions, registered quantity, status PENDING / PARTIAL / REGISTERED / CANCELLED) | new table |
| `analysis_results` (item, case, patient, service, result POSITIVE / NEGATIVE / value + unit, finding, comment, entered by/at, confirmed by/at) | new table |
| `treatment_sessions` (item, number, planned date, done at, done by) | new table |
| `settings`: `followUpFreeDays` = 14, `printTicketAfterPayment` = false, `maxDiscountPercent` (see Q2) | settings rows |

## Roles (till)
- **RECEPTIONIST:** register, pay, referrals inbox, queue overview, patient form.
- **DOCTOR:** my queue, case page, vitals, medical fields of the patient, referrals, confirm results. No checkout, no catalog.
- **NURSE** (lab/procedures): analysis queue (sample taken → result), treatment sessions to tick.
- **CLINIC_ADMIN:** everything, plus doctor/nurse logins (created on the till's Doctors/Staff page and on the web).
- Enforced in main (`handle()` role checks); the renderer only hides controls.

## Phases
### P1: Data + catalog
- [x] Schema upgrades above. Migration-reviewer pass (fixes applied: orphan lines set aside, atomic service classification, completed_at kept). Upgrade test on a v2.4 DB with real-shaped rows (`schema-upgrade.test.ts`).
- [x] Services page: type, follow-up flag, result type/unit/range. Seed update (in place, codes unchanged; + PAR-ENEMA procedure). `service-kind.test.ts`.

### P2: Reception: new registration flow (replaces NewAppointmentPage)
- [x] Step 1, Patient:
  - search by name, phone or code;
  - filters: region → district (AddressSelector), last visit;
  - "New patient" inline.
- [x] Step 2, Services:
  - the patient's open case and **pending referrals** first (one click adds them);
  - catalog by type; a doctor is picked only for consultations;
  - free follow-up applied automatically (≤ 14 days);
  - course: "full course (discount)" or "today only".
- [x] Step 3, Payment: the existing checkout page; optional ticket/receipt print (Settings → Clinic). Paying no longer completes the visit.
- [x] Reception queue overview: who is waiting for which doctor or nurse, live across tills. Done in P3 (/queue board).

### P3: Doctor workspace (doctor's PC, satellite)
- [x] Doctor login linked to the doctor record (Doctors page → Create login; plan staff limit checked). The home page is **My queue** (paid, waiting), live.
- [x] Case page:
  - complaint, vitals entry (height, weight, …);
  - allergies and chronic conditions;
  - diagnosis, history timeline (orders, results, sessions);
  - "Send to analysis" / "Prescribe course" = referrals;
  - confirm results; finish the consultation.
- [ ] Prescription/referral print (licence `printPrescription`). **Deferred**: the existing appointment prescription print still works; a referral print comes with P4.

### P4: Lab / procedures (nurse)
- [x] Analysis queue: sample taken → result entry (structured by `result_type`). The case moves to RESULT_READY; the doctor sees "results ready" on My queue and confirms on the case page.
- [x] Treatment sessions: sessions due up to today (overdue flagged), tick done, "3 of 10"; undo within 24 h on the case page.

### P5: Patient form
- [x] Add height, weight (written as a vitals record when changed), allergies, chronic conditions; the latest vitals and the patient's cases shown in PatientDetails.

### P6: Server + web (read-only display)
- [x] Sync up the new tables and fields (cases, referrals, vitals, results; sessions inside their line). Server `doctorId` nullable plus new columns/tables: migration `20261115200000_clinical_workflow` (staging applies it on container start). `TILL_ROLES` gains NURSE.
- [x] Web: cases, results, latest measurements on the patient page; service type in the web catalog; NURSE role on the Users page.
- [x] Till Staff page (/users): receptionist, nurse and admin logins; staff limit; no self-demotion.

### Throughout
- [ ] i18n uz + ru.
- [ ] Contract tests per channel (as `clinic-contract.test.ts`), a satellite e2e for the doctor queue.
- [ ] Version 2.5.0. `npm run check` plus a pos build. A hand run: reception till + doctor satellite through the full journey.

## Open questions (answer before P1)
- **Q1.** In SQLite, `appointments.doctor_id` is `NOT NULL` and can only become nullable by **rebuilding that one table**: copy into a new table in a transaction, verify the row counts, swap. That breaks the "additive only" rule once. The alternative is keeping a doctor on every order (the case's lead doctor, or a hidden "no doctor" placeholder), which is hacky and wrong for walk-in analyses. *Recommendation: rebuild once (you said no tills are in real use), reviewed by migration-reviewer.*
- **Q2.** Discount on a full course: who may give it and how much? *Recommendation: receptionist up to `maxDiscountPercent` (admin setting, default 10 %); more needs an admin login.*
- **Q3.** Can a patient register an analysis without a consultation first (a walk-in with a referral from another clinic)? *Recommendation: yes; it opens a case with no lead doctor.*
- **Q4.** Should the doctor be able to edit the patient's identity (name, phone, address) or only medical fields? *Recommendation: medical fields only; identity stays at reception.*

**Answers (owner, 2026-11-15):** Q1–Q4 all as recommended: rebuild `appointments` once so `doctor_id` is nullable; receptionist discount up to `maxDiscountPercent` (default 10 %), more needs an admin; walk-in analysis allowed (case without lead doctor); doctors edit medical fields only.

**More answers (owner, 2026-11-15):** the plan limit `monthlyVisits` counts **new cases** (patient journeys) per calendar month, not orders: till-side meaning only, posgro just stores the number. Commit after each finished phase (not pushed).

**Admin-doctors (owner, 2026-11-15):** a clinic admin can also be a doctor. Being a doctor is a profile linked to a login (`doctors.user_id`), not only the DOCTOR role: Doctors page → "Link existing login" (no extra staff seat, the role stays), setup option "I also see patients as a doctor", sidebar shows My queue to anyone with a profile. Admin-doctors may register and take payment (they are admins).

---

# Custom order and staff types + catalog cards (v2.5.0)

**Owner decisions (2026-11-16):** staff type = name + access (no login / reception / nurse-lab / admin); order type = name + colour + a fixed behaviour (doctor / lab result / course / **sold directly**: done at payment, no queue, no case); no stock for drugs yet; both synced to the server (web read-only).

- [x] SQLite: `service_types`, `staff_types`; `services.service_type_id`, `users.staff_type_id`; kind `DIRECT_SALE`; role `STAFF` (no login, no staff seat).
- [x] Main: types CRUD (admin), service kind follows its type, staff role follows its type; login refuses STAFF; direct-sale lines done at payment and never open a case.
- [x] Settings → Types (admin): order types and staff types.
- [x] Staff page: pick a built-in role or a custom type; Services page: pick a type.
- [x] Registration: catalog cards (bigger picture, type badge, price).
- [x] Sync + server migration (types tables, type ids, DIRECT_SALE, STAFF) + web shows type names.
- [x] Tests, i18n uz/ru, check + builds.

## v2.6 Fiscal receipts through REGOS:VCR (plan 2026-11-16, waiting for approval)

Copies SavdoChef F18 (`restaurant-app/src/main/fiscal/`: `vcr-client.ts`, `fiscal-service.ts`, `config.ts`, `order-status.ts`, `ofd-link.ts`, `shared/utils/fiscal-receipt.ts`, `test-utils/fake-vcr.ts`, `renderer/views/settings/fiscal-section.ts`) and posgro's tasnif lookups (`posgro/src/main/fiscal/tasnif.ts`). Same rules:
- REGOS:VCR runs on the **main till's** PC (`http://127.0.0.1:22298/`, JSON-RPC, login `cassir`). Satellites forward every call, so only the main till talks to VCR.
- "Allow, fiscalise later": a payment always commits; the receipt is sent after commit and retried.
- Never twice: receipt `code` = `PC-<db prefix>-<appointmentNumber>`, looked up with `Receipt.GetInfo` before a resend.
- VCR calls run one at a time. The VCR password is encrypted with safeStorage and never leaves main.

**tasnif findings (checked live 2026-11-16).** The goods search (`elasticsearch/search`) does not index services. Services are found with `GET https://tasnif.soliq.uz/api/cls-api/mxik/search/by-params?text=<words>&lang=ru|uz_cyrl|uz_latn&size=&page=` (only `text` and `mxikCode` filter). Package codes come from `integration-mxik/get/history/<mxik>` (`packageNames`). Medical services are class `10902`:

| Clinic service | MXIK | Package code (`xizmat (marta)`) |
|---|---|---|
| Parasitologist consultation (PAR-CONS, PAR-CONS2) | `10902001034000000` Консультация паразитолога | `1321927` |
| Lab analyses (PAR-OP … PAR-MAL) | `10902002003000999` Лабораторная диагностика, прочие | `1321964` |
| Procedures, courses (PAR-ENEMA) | `10902003035000000` Услуги паразитолога по лечению и проведению процедур | `1322001` |
| Ultrasound, if the clinic adds one | `10902002002000003` УЗИ | (look up) |

Each MXIK has its own package code: the package is always taken from the same MXIK, never mixed.

### SQLite (in-place, additive: `schema.ts` ADD COLUMN + `schema.sqlite.prisma`)
- [ ] `services`: `mxik TEXT`, `package_code TEXT` (null = the settings default for its kind).
- [ ] `appointments`:
  - `fiscal_status`: null = fiscal off when paid or never sent; otherwise `PENDING | FISCALIZED | FAILED | SKIPPED`.
  - `fiscal_error`, `fiscal_attempts INT DEFAULT 0`.
  - `fiscal_receipt_id`, `fiscal_receipt_no`, `fiscal_sign`, `fiscal_qr_url`, `fiscal_terminal_id`, `fiscal_at`.
  - Index on `fiscal_status`.
- [ ] Settings keys `fiscal_*` (as SavdoChef): enabled, host, port, login, password (encrypted), VAT mode, default MXIK + package per kind (consultation / analysis / procedure / direct sale), code prefix.
- [ ] One-time data upgrade: fill the seeded parasitology services' MXIK + package from the table above, only where empty (Q7).

### Main
- [ ] `src/main/fiscal/`:
  - `vcr-client.ts` and `ofd-link.ts`: copied.
  - `config.ts`: settings keys, per-kind defaults.
  - `fiscal-service.ts`: send, retry, look up by code, adopt, Z-report open and close, duplicate. No shifts, no debts, no edits.
- [ ] `src/shared/fiscal-receipt.ts`: a pure builder. One position per paid line:
  - `amount` = line `total` in tiyin; `quantity` x 1000;
  - `discount` = line discount in tiyin (the course discount);
  - `icps` / `package_code` from the service, or its kind's default;
  - `barcode` = service code; `vat_value` per VAT mode (Q3).
  - Payments per Q2. Throws on a missing MXIK, or when positions ≠ payments.
- [ ] `src/main/fiscal/tasnif.ts`:
  - `searchServices(text, lang)` (by-params) and `packagesFor(mxik)`.
  - 8 s timeout, called from main (no CORS).
  - Answers mapped to `{ code, name, className, packages }`.
- [ ] `appointments:checkout`: when the visit becomes PAID (Q1) and fiscal is on, set `fiscal_status = PENDING` in the same transaction; after commit, `fiscal.kick()`.
- [ ] Visit cancel and edit: refused on a FISCALIZED visit (Q5).
- [ ] IPC, all through `handle()`:
  - Admin: `fiscal:getConfig`, `fiscal:setConfig`, `fiscal:test`, `fiscal:zReport`, `fiscal:zOpen`, `fiscal:zClose`, `fiscal:searchMxik`, `fiscal:packages`.
  - Reception + admin: `fiscal:retry`, `fiscal:retryAll`.
  - Also: `fiscal:status`, `fiscal:duplicate`.
  - Host allow-list as SavdoChef (`isAllowedVcrHost`); `redirect: 'error'`.
- [ ] `index.ts`: create the FiscalService on the main till only; `start()` sends what is waiting once after start. `POSCLINIC_VCR_URL` override, unpackaged builds only.
- [ ] LAN: satellites forward `fiscal:*` like every channel; the password never travels (only `hasPassword`).

### Renderer
- [ ] Settings → **Fiscal receipt** (admin):
  - on/off; VCR host, port, login, password; test connection; VAT mode;
  - default MXIK + package per kind, each with the tasnif search;
  - Z-report state with Open / Close buttons;
  - "waiting / failed" counters with "Send again".
- [ ] Services form: an MXIK field with **Search tasnif**.
  - Type words → a list of `code — name`; pick one.
  - The package list is filled from tasnif, and the single `xizmat (marta)` is picked automatically.
  - Validation: 17 digits.
- [ ] Visit details and list:
  - a fiscal badge (Sent / Waiting / Failed with the reason);
  - "Send again"; "Print copy" (`Receipt.Duplicate`).
- [ ] i18n uz + ru for all of it; VCR error texts from SavdoChef (`describeVcrError`).

### Licence, sync, version
- [ ] Licence: no new plan feature in v1 (every plan may fiscalise). The gate still applies: read-only mode refuses `fiscal:*` writes, except a retry of a visit already paid.
- [ ] Sync: `services.mxik` / `package_code` synced (server column + migration + **SyncPushDto** + `sync.dto.test.ts`, lesson 2026-11-16). Fiscal receipt fields stay on the till in v1 (Q7).
- [ ] Version 2.5.0 → **2.6.0**.

### Tests and verification
- [ ] `fiscal-receipt.test.ts`: tiyin/milli rounding, course discount, VAT modes, per-kind defaults, missing MXIK, unbalanced, payment mapping.
- [ ] `vcr-client.test.ts` + `fiscal-service.test.ts` against a local fake VCR (copy `fake-vcr.ts`):
  - a sale;
  - a lost answer adopted by code;
  - busy retry;
  - an environment error keeps PENDING without counting an attempt;
  - a data refusal → FAILED;
  - Z-report auto-open on 704010.
- [ ] `tasnif.test.ts` against a fake HTTP server (answer shapes from the live calls above).
- [ ] `npm test`, typecheck, till build. One end-to-end pass: dev till → fake VCR (`POSCLINIC_VCR_URL`) → a paid visit → FISCALIZED with a receipt number.
- [ ] Not verified without you: a real REGOS:VCR + fiscal module on the clinic PC.

**Owner decisions (2026-11-16): all R, except 6: shifts like SavdoChef.** So:
- Payments become rows (`payments`: visit, shift, method, amount, who, when); `paidAmount` stays the running total. Checkout needs an open shift (one for the whole clinic, all desks).
- `shifts`: open with the opening cash; pay in / pay out (never edited; a mistake is undone by the opposite movement); close with the counted cash. The expected cash is frozen at close; history shows the difference. A shift with no payments or movements can be deleted (admin).
- The Z-report follows the shift: opened with it (in the background), closed with it after the waiting receipts are sent, with buttons for when the two disagree.
- A visit paid partly by transfer or insurance is SKIPPED as a whole (positions must equal the payments).
- Commits: (A) shifts + payment rows, (B) MXIK codes (+ tasnif search, seeded codes, server/web), (C) fiscal receipts.

### Questions (answered 2026-11-16)
1. **Partial payments:** one receipt when the visit is fully paid (R), or a receipt for every payment (needs advance-payment receipts, much harder)?
2. **Payment methods:** CASH → cash, CARD → card (R). TRANSFER and INSURANCE: not fiscalised, marked SKIPPED (R), or sent as cash?
3. **VAT:** medical services are VAT-exempt (Tax Code, art. 243): send "Без НДС" (R). Also a 12 % option in settings, for a clinic that pays VAT on goods?
4. **Direct-sale goods (drugs, ointments):** medicines need a marking code (Asl Belgisi) on the receipt. v1: services and unmarked goods only, and a marked drug line stops the receipt with a clear error (R)? Or leave direct-sale lines out of fiscal for now?
5. **Refunds:** v1: a fiscalised visit cannot be cancelled in the app, and refunds are done in the REGOS app (R)? Or build `Receipt.FullRefund` now (scan the paper receipt's QR, as SavdoChef)?
6. **Z-report:** posclinic has no shifts. Open it automatically before the first receipt of the day and close it with a button in Settings → Fiscal receipt (R)? Or also close it automatically at a set time?
7. **Codes:** prefill the seeded parasitology services with the MXIK/package codes above (R)? Sync MXIK/package to the server so the web shows them (R), with fiscal status staying on the till for now (R)?
