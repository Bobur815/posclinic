---
paths:
  - "prisma/**"
  - "src/main/database/**"
---

# Prisma rules (two schemas)

## SQLite — the till (`prisma/schema.sqlite.prisma`)
- Client in `src/generated/prisma-sqlite/` (`npm run prisma:generate:sqlite`).
- The DB file is **created and upgraded by raw SQL** in `src/main/database/schema.ts` (`createSchemaIfNeeded` + idempotent `*IfNeeded` upgrades). It has no Electron import, so tests build a real DB. A schema change touches both, with the same column names.
- Tills are in the field (from v2.0.0): **additive only**. That means a new table, a nullable column, a column with a default, or an index. Upgrades run in place, and patient and appointment rows must survive. Never wipe or recreate a clinic DB.
- After a change: generate, bump version, run the `migration-reviewer` agent.

## PostgreSQL — the posclinic server (`prisma/schema.prisma`)
- Active again since v2.1 (cloud sync + web dashboard, contract `.claude/rules/server-api.md`). Fresh baseline `20261115100000_baseline` (no real data existed before it).
- From the first deploy with real clinic data: **additive migrations only**. Create with `npm run prisma:migrate:dev -- --create-only --name <snake_case>`, then **read the SQL**. Never edit an applied migration.
- Synced columns must match the till's row shapes (contract). Every table carries `clinicId` + `syncedAt`.
- Postgres `db push`, `migrate reset`, `migrate deploy` and Prisma's data-loss flags are blocked by hook. The user runs them.
