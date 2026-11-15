# Plan — posclinic → posgro-licensed parasitology clinic POS (SavdoChef pattern)

Decisions (confirmed 2026-11-15):
- **Architecture:** posgro is the licensing + super-admin backend (like SavdoChef). posclinic till = offline-only, licensed by signed Ed25519 token. posclinic's own server/web/sync are frozen.
- **VIP:** perpetual, no price, all features, unlimited limits; assigned only by super admin.
- **POS login:** phone + password. Phone required, email optional. No verification of any kind.
- **Password recovery:** none for now (super admin resets in posgro). Telegram OAuth later.
- **Parasitology:** `PARASITOLOGY` clinic type (default) + seeded ru/uz services. No lab module yet.

Assumption: no posclinic tills are live yet (repo has 3 commits) → SQLite changes may be non-additive this once. Tell me if that's wrong.

---

## Phase 0 — Hygiene & Claude config (posclinic)
- [ ] Scrub `.env.example`: remove SMTP creds/email, Google OAuth vars. **User: revoke the Gmail app password (it's in git history).**
- [ ] Add `tasks/lessons.md` (CLAUDE.md requires it).
- [ ] Port `.claude/` (Windows-native, Git Bash), merging the best of posgro + SavdoChef:
  - `settings.json`: allow/ask/deny (deny reading `.env*`, editing `src/generated/**`, `rm -rf`, force push, `reset --hard`, `migrate reset`, `db push` on Postgres)
  - hooks: `guard-bash.ts`, `format.ts` (Prettier), `session-start.ts` (branch + lessons), `stop-version-check.ts` (Electron change ⇒ bump). **Skip `branch-guard`** for now (posclinic works on `main`; enable once a `dev` branch exists).
  - rules: `electron.md`, `prisma.md`, `licensing.md` (new: the posgro contract), path-scoped
  - commands: `/plan`, `/check`; agents: `migration-reviewer`, `electron-security-reviewer`; skills: `ipc-feature`, `prisma-migration`
- [ ] Update CLAUDE.md: Windows dev env, new architecture (posgro licensing), remove sync/server sections or mark frozen.

## Phase 1 — posgro: POSCLINIC product (repo `C:\Users\user\posgro`, feature branch off `dev`, never `main`)
Mirror `src/server/modules/savdochef/` as `src/server/modules/posclinic/`, behind `POSCLINIC_ENABLED=true`.
- [ ] Prisma (additive): `ProductKind` += `POSCLINIC`. Reuse `Store.activationCodeHash/ExpiresAt`, `StoreTerminal`, `TrialClaim`. Migration via `--create-only`, read SQL, migration-reviewer agent.
- [ ] `posclinic-plans.ts`: `TRIAL, START, PRO, ENTERPRISE, VIP` (keeps posclinic's existing tier names; FREE dropped → use TRIAL). VIP = all features, `terminals/staff/monthlyVisits = null` (unlimited), no price, never expires.
- [ ] `posclinic-config.ts` (SiteConfig `posclinic_config`, editable by super admin):
  - features: `reports`, `advancedReports`, `multiDoctor`, `printPrescription`, `patientHistory`, `debt` + upcoming `labResults`, `telegramBot`
  - limits per plan: `terminals`, `staff` (was maxNurses), `monthlyVisits` (was maxMonthlyVisits)
- [ ] `posclinic-license.ts`: payload `{v:1, product:'POSCLINIC', storeId, storeName, plan, expiresAt, warnFrom, blockAt, issuedAt, checkinBy, seats, features[], limits{}}`, separate key `POSCLINIC_LICENSE_SIGNING_KEY`.
- [ ] Controller `/posclinic`: `GET plans`, `POST activate {phone, activationCode, terminal}`, `POST licenses/renew`. **No self-signup / no Telegram phone verification** (per "no verification at all") — clinics are created only by super admin.
- [ ] Admin `/posclinic/admin`: `GET/PUT config`, `POST stores/:id/activation-code`, `GET/DELETE stores/:id/terminals`.
- [ ] Web: `PosclinicPage.tsx` (list/create clinics, plan incl. VIP, expiry) + `PosclinicStorePage.tsx` (activation code shown once, terminals, reset admin) — copy SavdoChef pages; nav entry. ru/uz strings.
- [ ] Tests: `posclinic.service.test.ts` (activate one-shot code, VIP never blocks, seat limit, stale license rejected).
- [ ] Stores list `?product=POSCLINIC` filter works; POSGRO/SAVDOCHEF untouched (no N-1 impact on posgro tills).

## Phase 2 — posclinic till: licensing (port from restaurant-app `src/main/license/*`)
- [ ] `src/shared/license.ts`: features, plans, `knownPlan`, `TillMode`.
- [ ] `src/main/license/`: `license-core.ts` (verify, `tillState`, `refusal`), `license-public-key.ts`, `license-service.ts` (check-in 20 s after start, then every 6 h), `trusted-clock.ts`.
- [ ] SQLite: `LicenseState` single row (terminalId, storeId, storeName, token, lastCheckinAt, lastError, firstRunAt, clockMark). `LocalConfig.clinicId` ← storeId.
- [ ] IPC gate: every handler passes through `refusal(channel)` (readonly when blocked; feature + limit checks e.g. staff count, monthly visits). Renderer `licensed(feature)` only hides UI.
- [ ] Setup wizard → step 1 "link clinic" (phone + activation code `XXXX-XXXX`), step 2 create first admin (name, phone, password). Remove clinicCode+email flow.
- [ ] Settings → Subscription section (plan, expiry, features, "check now").
- [ ] Disable `SyncService` start + remove `VPS_API_URL` sync usage; replace with `POSCLINIC_API_URL` (default `https://api.posgro.uz/api`, dev override only when unpackaged).

## Phase 3 — posclinic till: phone instead of email
- [ ] SQLite `User`: `phone String @unique` (required), `email String?` (optional, not unique).
- [ ] Shared `normalizePhone()` (+998XXXXXXXXX, accepts `90 123 45 67`, `998…`, `+998…`) + zod validator, used everywhere.
- [ ] `auth-handlers.ts`: `auth:login(phone, password)`; session token payload uses phone.
- [ ] LoginPage, UserSettingsPage, user create/edit forms: phone field required, email optional; saved-credentials key migrates.
- [ ] i18n: `auth.phone`, errors (ru + uz).
- [ ] Remove "forgot password" UI; show "contact administrator" hint.

## Phase 4 — Parasitology
- [ ] `ClinicType` += `PARASITOLOGY` (shared types + SQLite setting default).
- [ ] First-run seed of services (ru/uz names, codes, default price 0, duration): consultation, stool O&P (ova & parasites), scotch-tape test (enterobiasis), ELISA Giardia, ELISA Toxocara, ELISA Echinococcus, ELISA Opisthorchis, ELISA Ascaris, blood smear (malaria), repeat consultation. User reviews the list before seeding.
- [ ] Branding text: "Parazitologiya klinikasi" defaults.

## Phase 5 — Freeze posclinic server/web
- [ ] Leave `src/server`, `src/web`, `prisma/schema.prisma` in place but untouched; note "frozen — superseded by posgro" in CLAUDE.md/README. Delete in a follow-up after posgro module is verified on staging. (The email→phone + VIP changes go into posgro, not this Postgres schema.)

## Versioning
- posclinic `package.json` 1.0.0 → **2.0.0** (major: licensing model + login identifier change).
- posgro: server/web only → no Electron bump.

## Verification
- posclinic: `npx tsc --noEmit`, `npm test` (license-core tests ported), `electron-vite build`; run `dev:pos` against posgro staging (`dev.web.posgro.uz`): create clinic in admin → activation code → link till → login by phone → VIP shows all features → set plan expired → till goes readonly.
- posgro: `npm run lint`, `npm test`, `build:server`, `npm --prefix src/web run build`, `/api-compat` shows no POSGRO/SAVDOCHEF break. Push only to a feature branch → you merge to `dev` (staging) and later `main`.

## Risks / open
1. **Multi-terminal clinics:** offline-only tills don't share patients. Phase 1 = one till per clinic (seat limit enforced). LAN satellites (SavdoChef `src/main/lan/`) is a follow-up if needed.
2. Existing patient/appointment data on posclinic server (if any) is not migrated.
3. Signing keypair: I generate an Ed25519 pair; private key goes only into posgro `.env` (you set it on VPS), public key compiled into the till.

## Review (2026-11-15)

Status: Phases 0–5 implemented. posclinic is uncommitted; posgro is committed on `feature/posclinic-licensing` (`e54b9ab`) and not pushed.

**Verified**
- posclinic: `npm test` 21/21; `tsc` clean outside the frozen `src/web` (7 errors there, all pre-existing: its own deps aren't installed); `electron-vite build` OK.
- posgro (agent): lint 0 errors, tsc clean, 2051 tests pass, `build:server` and web build OK.
- Cross-repo: posgro's real `buildPosclinicLicense`/`signPosclinicLicense` → till `readLicense`/`tillState` gives VIP=unlimited, PRO=active with limits, other till=no-seat, expired START=blocked.
- Security/migration review: no high findings. Fixed: the debt bypass via `appointments:update` (payment fields removed), NaN checkout amounts, one-ended report ranges, recovery when the licence file is lost (same clinic only), guarded `setup:launchApp`, storeId charset, DevTools off when packaged, corrected the trusted-clock comment.
- Found and fixed a pre-existing bug: the Daily report sent `{date}`, which the handler ignored, so it showed every appointment.

**Deviations from plan**
- Licence state lives in `userData/license-state.json`, not a SQLite table. The clinic DB file is chosen by storeId, so state has to exist before the DB does.
- Features are `reports, multiDoctor, printPrescription, debt` (+ upcoming `labResults, telegramBot`). I dropped the vague `advancedReports/patientHistory`.
- `limits.staff` is carried in the licence but not enforced: the till has no staff-management screen yet.
- posgro admin pages are English-only (posgro's super-admin has no i18n).

**Open / next**
1. User: set `POSCLINIC_ENABLED=true` and `POSCLINIC_LICENSE_SIGNING_KEY` on staging, push the branch, merge to `dev`, then test end to end on staging.
2. Staff management screen (enforce `limits.staff`, role checks in handlers).
3. A lost licence file means a new terminalId, so the old seat must be freed in the admin.
4. Existing (pre-change) error logs in handlers may include patient fields from Prisma errors; scrub them.
5. Delete the frozen `src/server`, `src/web` and `prisma/schema.prisma` after staging is verified.
6. Telegram login for password recovery.
