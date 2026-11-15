---
paths:
  - "src/main/**"
  - "src/renderer/**"
  - "src/shared/**"
---

# Electron till rules

- **Offline-only.** The till never syncs clinic data anywhere. The only network call is licensing to posgro (`.claude/rules/licensing.md`). Every feature works with no network.
- **IPC chain:** renderer → hook/store → `window.electronAPI` (`src/main/preload.ts`, namespaced) → `src/main/ipc/*-handlers.ts` → SQLite. Never call `ipcRenderer` from the renderer.
- **Licence gate lives in main.** Every handler that creates business (appointments, patients, doctors, staff, checkout) must pass `license.refusal(channel, input)` before writing. The renderer's `licensed(feature)` only hides controls.
- Serialize before crossing IPC: `Decimal` → number, wrap in `ipcSafe()`.
- **Identity is the phone** (`+998XXXXXXXXX`, `normalizePhone()` in `src/shared/phone.ts`). Email is optional, never unique, never used to log in. No verification flows (no OTP, no email).
- State: Zustand (`src/renderer/store`). Styling: Styled Components with theme tokens, light + dark. Routing: `HashRouter` only.
- i18n: every string in BOTH `src/renderer/i18n/locales/ru.json` and `uz.json`. Bilingual DB fields use `nameRu`/`nameUz`.
- Patient data is medical data: never log names, phones, diagnoses or request bodies.
- Version bump in `package.json` on any change here (Stop hook checks). `npm version <x> --no-git-tag-version`.
