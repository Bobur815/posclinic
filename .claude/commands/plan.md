---
description: Plan a task the way CLAUDE.md requires - explore, ask, write tasks/todo.md, wait
argument-hint: <task description>
---

Task: $ARGUMENTS

Do NOT write or edit any code yet.

1. Explore the real code for every area this touches (main/IPC, renderer, SQLite bootstrap, licensing contract, and posgro's `modules/posclinic` if the licence or plans change). Point to the files and patterns you will follow.
2. Ask every clarifying question you need: numbered, one line each, max 7. Design decisions are questions, not assumptions.
3. Write the plan to `tasks/todo.md` with checkable items: files per area, SQLite changes (in-place upgrade), licence/feature gating, i18n ru+uz, version bump, tests and how you will verify.
4. Stop and wait for explicit approval.
