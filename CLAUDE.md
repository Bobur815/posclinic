# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Project:** Parasitology clinic POS (`posclinic`) — developed on Linux Ubuntu.
> **Since v2.0.0** the till is offline-only and **licensed by posgro** (same pattern as SavdoChef). Clinics are created and managed only in the posgro super-admin dashboard. Contract: `.claude/rules/licensing.md`.

---

# Commands

## Development
```bash
npm run dev:pos           # Electron till; POSCLINIC_API_URL in .env.pos points a dev build at posgro staging
# Frozen legacy (do not extend): npm run dev:server, src/web
```

## Build & Deploy
```bash
npm run build:server      # Compile NestJS → dist/server/
npm run build:pos         # Build Electron app + AppImage/deb packages (Linux)
cd src/web && npm run build  # Build web dashboard → dist/web/ (served by NestJS)
```

## Database
```bash
npm run prisma:generate         # PostgreSQL Prisma client
npm run prisma:generate:sqlite  # SQLite Prisma client → src/generated/prisma-sqlite/
npm run prisma:migrate:dev      # Create + apply PostgreSQL migration
npm run prisma:migrate:deploy   # Apply migrations in production
npm run prisma:push:sqlite      # Push SQLite schema without migrations
npm run prisma:seed             # Seed PostgreSQL database
```

## Code Quality
```bash
npm run lint     # ESLint on src/**/*.ts,tsx
npm run format   # Prettier on src/**/*.{ts,tsx,json}
npm test         # node:test via tsx, matches src/**/*.test.ts
npm run typecheck
```

---

# Architecture

## System Overview
- **Electron till** — offline-only; all clinic data (patients, visits, services) lives in its SQLite file and never leaves it.
- **posgro** (separate repo, module `src/server/modules/posclinic/`) — the clinic is a `Store` with `product = POSCLINIC`. The super admin creates it, sets the plan (`TRIAL | START | PRO | ENTERPRISE | VIP`) and issues a one-time activation code. posgro only licenses the till; it never receives clinic data.
- **Frozen legacy:** `src/server/` (NestJS), `src/web/`, `prisma/schema.prisma` (PostgreSQL). Superseded by posgro; kept until the posgro module is verified on staging, then to be deleted.

## Source Layout
| Path | Purpose |
|------|---------|
| `src/main/` | Electron main process (IPC handlers, licence, printer) |
| `src/main/license/` | posgro licence: verify (Ed25519), till state, per-call gate, trusted clock |
| `src/renderer/` | React UI for POS terminal |
| `src/server/`, `src/web/` | Frozen legacy server + dashboard |
| `src/shared/` | Types, utils, constants shared across all targets |
| `src/generated/prisma-sqlite/` | Generated SQLite Prisma client (gitignored; `npm run prisma:generate:sqlite`) |
| `prisma/schema.prisma` | PostgreSQL schema (VPS) |
| `prisma/schema.sqlite.prisma` | SQLite schema (POS terminal) |

## IPC Architecture (Electron)
```
Renderer (React) → hooks → ipc-client.ts → preload.ts (contextBridge) → main process IPC handlers → SQLite
```
- `src/main/preload.ts` exposes `window.electronAPI` with namespaced methods
- `src/main/ipc/` contains handler files per domain (products, sales, auth, settings, etc.)
- Never call `ipcRenderer` directly; always go through `window.electronAPI`

## Licensing Flow (no data sync)
1. Setup wizard: owner phone + activation code → main `license:activate` → posgro `POST /posclinic/activate` → signed licence stored in `userData/license-state.json`; the clinic DB `clinic-<storeId>.db` is opened.
2. Setup step 2 creates the first admin (phone login) and seeds parasitology services (`src/main/database/seed-parasitology.ts`).
3. Check-in `POST /posclinic/licenses/renew`: 20 s after start, every 6 h, and Settings → Subscription → "check now". Missing `checkinBy` makes the till read-only.
4. Every domain IPC handler is registered with `handle()` (`src/main/ipc/ipc-safe.ts`), which runs the licence gate (`license-core.ts` `refusal`) first: read-only mode, plan features (`reports`, `multiDoctor`, `printPrescription`, `debt`) and limits (`monthlyVisits`).
5. Identity is the phone (`+998XXXXXXXXX`, `src/shared/phone.ts`); email is optional; no OTP or verification; password recovery is done by the clinic admin (Telegram login planned).

## Two Prisma Schemas
- PostgreSQL: `prisma/schema.prisma` → generates to `node_modules/.prisma/client`
- SQLite: `prisma/schema.sqlite.prisma` → generates to `src/generated/prisma-sqlite/`
- To add a SQLite field: edit the schema **and** the raw-SQL create/upgrade in `src/main/database/sqlite-client.ts`, then `npm run prisma:generate:sqlite` (needs `SQLITE_DATABASE_URL` set to anything, e.g. `file:./dev.db`). See skill `prisma-migration`.
- The PostgreSQL schema is frozen.

## Environment Files
- `.env.pos` — baked into the bundle (`electron.vite.config.ts`) and extractable: no secrets. Only `POSCLINIC_API_URL`, honoured only by unpackaged builds; packaged builds always use `https://api.posgro.uz/api`.
- posgro needs `POSCLINIC_ENABLED=true` and `POSCLINIC_LICENSE_SIGNING_KEY` (private half of the key in `src/main/license/license-public-key.ts`; never in any repo).
- See `.env.example` for all required variables

## Key Patterns
- **IPC:** register handlers with `handle()` from `src/main/ipc/ipc-safe.ts` (licence gate) and return `ipcSafe(value)` (strips Decimal/Date). A refusal throws and also emits `license:refused` with an i18n key, which `LicenseBanner` toasts.
- **Licence in the UI:** `useLicenseStore` / `useLicensed(feature)` only hide controls; main enforces.
- **State:** Zustand stores in `src/renderer/store/`; hooks in `src/renderer/hooks/` wrap store + IPC calls
- **Styling:** Styled Components with theme tokens (`spacing`, `colors`, `borderRadius`, `shadows`)
- **Routing:** HashRouter (required for Electron — no BrowserRouter)
- **i18n:** `src/renderer/i18n/locales/ru.json` + `uz.json`; bilingual DB fields use `nameRu`/`nameUz`

## Electron Build Notes
- Development and builds run on **Linux Ubuntu**; targets are `AppImage` and `deb` (configured in `electron-builder.config.js`)
- `asar: false` in `electron-builder.config.js` — Chromium ES modules can't load from `.asar`
- SQLite Prisma client at `src/generated/prisma-sqlite/` is committed and included in the bundle
- Native Prisma query engine binaries are bundled via `extraResources`
- Release channel: `https://posclinic.bobur-dev.uz/releases/`

---

# Workflow Orchestration

## 1. Plan Node Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

## 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

## 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

## 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

## 5. Demand Elegance (Balanced)
 POS app 
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

## 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

# Task Management

1. **Plan First:** Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan:** Check in before starting implementation
3. **Track Progress:** Mark items complete as you go
4. **Explain Changes:** High-level summary at each step
5. **Document Results:** Add review section to `tasks/todo.md`
6. **Capture Lessons:** Update `tasks/lessons.md` after corrections

---

# Versioning (Electron App)

When making changes to the Electron app (`src/main/`, `src/renderer/`, `src/shared/`), bump `package.json` version before finishing:

- **Bug fix** → `patch` (1.0.0 → 1.0.1)
- **New feature** → `minor` (1.0.0 → 1.1.0)
- **Breaking change / major redesign** → `major` (1.0.0 → 2.0.0)

Rules:
- Server-only changes (`src/server/`, `src/web/`) do NOT bump the version
- Always bump version when the task touches renderer UI, main process, or IPC
- Use `npm version patch|minor|major` or edit `package.json` directly

---

# Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary. Avoid introducing bugs.
