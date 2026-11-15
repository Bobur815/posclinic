import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '../../generated/prisma-sqlite';
import { createSchemaIfNeeded } from '../database/schema';

/**
 * A throwaway till database: the real generated client on a temp SQLite file with the real
 * schema (as src/main/sync/sync-engine.test.ts). Not a test file itself.
 */
export interface TestDb {
  db: PrismaClient;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const dir = mkdtempSync(path.join(tmpdir(), 'posclinic-test-'));
  // biome-ignore lint/suspicious/noExplicitAny: generated client constructor
  const { PrismaClient: Client } = require(
    path.join(process.cwd(), 'src', 'generated', 'prisma-sqlite'),
  ) as any;
  const db = new Client({
    datasources: { db: { url: `file:${path.join(dir, 'till.db')}` } },
  }) as PrismaClient;
  await db.$connect();
  await createSchemaIfNeeded(db);
  return {
    db,
    close: async () => {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
