---
description: Typecheck, test and compile-check the till
allowed-tools: Bash(npx tsc --noEmit*), Bash(npm test*), Bash(npx cross-env APP_MODE=pos electron-vite build*), Bash(git diff*), Bash(git status*)
---

Uncommitted:

!`git status --short`

Run in order, stopping at the first failure (fix it, then re-run that stage):

1. `npx tsc --noEmit -p tsconfig.json`
2. `npm test`
3. `npx cross-env APP_MODE=pos electron-vite build` (not the full installer)

Then check: every new i18n key exists in both `ru.json` and `uz.json`; every SQLite schema change has a matching in-place upgrade in `sqlite-client.ts`; no `.env*` or `.db` staged; `package.json` version bumped if `src/main|renderer|shared` changed. Finish with 3 lines: what passed, what you fixed, what is left.
