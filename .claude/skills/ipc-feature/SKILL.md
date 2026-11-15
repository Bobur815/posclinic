---
name: ipc-feature
description: Build a clinic till feature end to end (SQLite, main-process IPC handler, licence gate, preload, Zustand store, React page, i18n ru/uz, version bump). Use whenever the user asks for a new screen, till feature, settings option, or anything in src/renderer or src/main.
---

# Till feature workflow

1. **Read first.** Find the closest existing feature (e.g. `patient-handlers.ts` → `preload.ts` `patients` → `pages/Patients`) and follow its chain. Never invent a parallel pattern.
2. **Data:** schema change → skill `prisma-migration`. Fresh-create and in-place upgrade SQL both updated.
3. **Main:** handler in `src/main/ipc/<domain>-handlers.ts`: validate input (zod), check role, call the licence gate (`refusal`) if it creates business or needs a plan feature/limit, use SQLite, serialize `Decimal` → number, `ipcSafe()`.
4. **Plan feature?** Add it to `src/shared/license.ts` AND posgro `modules/posclinic/posclinic-config.ts` (same name), update `.claude/rules/licensing.md`. Unknown features are ignored by old tills, so roll out server-first.
5. **Bridge:** expose on `window.electronAPI` in `src/main/preload.ts` (namespaced, typed).
6. **Renderer:** store/hook → page with Styled Components tokens (light + dark), `HashRouter`. Hide plan-gated UI with `licensed(feature)`.
7. **i18n:** every string in BOTH `ru.json` and `uz.json`.
8. **Offline:** must work without network. No sync.
9. **Version bump** (patch = fix, minor = feature), then `/check`.
