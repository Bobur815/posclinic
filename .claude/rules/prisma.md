---
paths:
  - "prisma/**"
  - "src/main/database/**"
---

# Prisma / SQLite rules

- `prisma/schema.sqlite.prisma` is the till's schema (client in `src/generated/prisma-sqlite/`). The DB file is **created and upgraded by raw SQL** in `src/main/database/sqlite-client.ts` (`createSchemaIfNeeded` + `migrate*IfNeeded`). A schema change must touch both, with the same column names.
- `prisma/schema.prisma` (PostgreSQL) belongs to the **frozen** legacy posclinic server. Don't extend it; clinics, plans and licences live in posgro.
- Once tills are in the field (from v2.0.0): **additive only**. New table, nullable column, column with default, index. Upgrades run in place, detected via `PRAGMA table_info`; patient and appointment rows must survive. Never wipe or recreate a clinic DB.
- After editing the SQLite schema: `npm run prisma:generate:sqlite`, bump version, run the `migration-reviewer` agent.
- Postgres `db push`, `migrate reset` and Prisma's data-loss flags are blocked by hook.
