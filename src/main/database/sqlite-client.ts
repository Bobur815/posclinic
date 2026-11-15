import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import { normalizePatientPhones } from './data-upgrades';
import { createSchemaIfNeeded } from './schema';

/**
 * Schema first (must succeed), then data upgrades. A failed data upgrade is logged and never
 * stops the clinic from opening: the old rows still work, they are just not normalised yet.
 */
// biome-ignore lint/suspicious/noExplicitAny: generated Prisma client
async function upgradeDatabase(db: any): Promise<void> {
  await createSchemaIfNeeded(db);
  try {
    const phones = await normalizePatientPhones(db);
    if (phones.updated || phones.skipped.length) {
      console.log(
        `[db] patient phones normalised: ${phones.updated}, skipped (duplicate): ${phones.skipped.length}`,
      );
    }
  } catch (error) {
    console.error('[db] patient phone normalisation failed (left as is):', error);
  }
}

import type { PrismaClient as GeneratedClient } from '../../generated/prisma-sqlite';

/**
 * Loaded on first use, not at import: handler modules import this file, and the tests
 * (plain node, no Electron `app`) give them a client of their own via `useDatabaseClient`.
 */
// biome-ignore lint/suspicious/noExplicitAny: the generated client's constructor
function PrismaClientCtor(): any {
  const prismaClientPath = path.join(app.getAppPath(), 'src', 'generated', 'prisma-sqlite');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(prismaClientPath).PrismaClient;
}

type PrismaClientType = GeneratedClient;

let prisma: PrismaClientType | null = null;

/** Tests only: the handlers use this (already connected, schema created) client. */
export function useDatabaseClient(client: PrismaClientType | null): void {
  prisma = client;
}

export function getPrismaClient(): PrismaClientType {
  if (!prisma) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return prisma;
}

const BOOTSTRAP_FILE = 'clinic-bootstrap.json';

export function getUserDataPath(): string {
  return app.getPath('userData');
}

export function readClinicBootstrap(): string | null {
  try {
    const raw = fs.readFileSync(path.join(getUserDataPath(), BOOTSTRAP_FILE), 'utf-8');
    const parsed = JSON.parse(raw) as { clinicId?: string };
    return parsed.clinicId || null;
  } catch {
    return null;
  }
}

export function writeClinicBootstrap(clinicId: string): void {
  fs.writeFileSync(
    path.join(getUserDataPath(), BOOTSTRAP_FILE),
    JSON.stringify({ clinicId }),
    'utf-8',
  );
}

export async function initializeDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData');
  const bootstrapClinicId = readClinicBootstrap();
  const dbFileName = bootstrapClinicId ? `clinic-${bootstrapClinicId}.db` : 'clinic-local.db';
  const dbPath = path.join(userDataPath, dbFileName);

  console.log(`[db] Opening database: ${dbFileName} (clinicId=${bootstrapClinicId ?? 'unset'})`);

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  process.env.SQLITE_DATABASE_URL = `file:${dbPath}`;

  const PrismaClient = PrismaClientCtor();
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  try {
    await prisma!.$connect();
    await upgradeDatabase(prisma!);
  } catch (error) {
    console.error('Failed to connect to database:', error);
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

export async function reinitializeDatabaseForClinic(clinicId: string): Promise<void> {
  await closeDatabase();
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, `clinic-${clinicId}.db`);
  process.env.SQLITE_DATABASE_URL = `file:${dbPath}`;
  const PrismaClient = PrismaClientCtor();
  prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
    log: ['error'],
  });
  await prisma!.$connect();
  await upgradeDatabase(prisma!);
}
