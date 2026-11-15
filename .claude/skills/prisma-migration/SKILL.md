---
name: prisma-migration
description: Safe SQLite schema change on the clinic till (schema.sqlite.prisma + raw-SQL bootstrap/upgrade in sqlite-client.ts). Use whenever the user wants to add or change a table, column, index, or says migration, schema, prisma, "add a field".
---

# Till schema change

The PostgreSQL schema (`prisma/schema.prisma`) is frozen legacy; clinic/plan/licence data lives in posgro (use posgro's own `prisma-migration` skill there).

1. State the change in one sentence; it must be additive (new table, nullable column, column with default, index).
2. Edit `prisma/schema.sqlite.prisma`; `npx prisma validate --schema=prisma/schema.sqlite.prisma`.
3. In `src/main/database/sqlite-client.ts`: add the column/table to the fresh-create SQL **and** an idempotent in-place upgrade (`PRAGMA table_info` check, then `ALTER TABLE ... ADD COLUMN`). Existing rows must survive.
4. `npm run prisma:generate:sqlite`.
5. Update handlers, serializers, types.
6. Run the `migration-reviewer` agent, bump version, `/check`.
