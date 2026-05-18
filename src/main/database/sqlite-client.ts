import path from 'path';
import { app } from 'electron';
import fs from 'fs';

const prismaClientPath = path.join(app.getAppPath(), 'src', 'generated', 'prisma-sqlite');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require(prismaClientPath);

type PrismaClientType = InstanceType<typeof PrismaClient>;

let prisma: PrismaClientType | null = null;

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

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  try {
    await prisma.$connect();
    await createSchemaIfNeeded(prisma);
  } catch (error) {
    console.error('Failed to connect to database:', error);
    throw error;
  }
}

async function migrateUsersTableIfNeeded(prisma: PrismaClientType): Promise<void> {
  const cols = await prisma.$queryRaw<{ name: string }[]>`
    PRAGMA table_info(users)
  `;
  const hasEmail = cols.some((c: { name: string }) => c.name === 'email');
  if (hasEmail) return;

  // Old schema uses phone as unique key — recreate with email
  await prisma.$executeRaw`
    CREATE TABLE users_new (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'RECEPTIONIST',
      full_name TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      clinic_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  // Carry existing rows over; use phone value as email placeholder so auth still works
  // until the sync overwrites with real email values from the VPS
  await prisma.$executeRaw`
    INSERT INTO users_new (id, email, phone, password, role, full_name, active, clinic_id, created_at, updated_at)
    SELECT id, phone, phone, password, role, full_name, active, clinic_id, created_at, updated_at FROM users
  `;
  await prisma.$executeRaw`DROP TABLE users`;
  await prisma.$executeRaw`ALTER TABLE users_new RENAME TO users`;
  console.log('[db] Migrated users table: phone → email');
}

async function createSchemaIfNeeded(prisma: PrismaClientType): Promise<void> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM sqlite_master WHERE type='table' AND name='local_config'
  `;

  if (rows.length > 0) {
    // DB already exists — run any pending column migrations
    await migrateUsersTableIfNeeded(prisma);
    return;
  }

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS local_config (
      id TEXT PRIMARY KEY DEFAULT 'config',
      clinic_id TEXT NOT NULL,
      clinic_name TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      api_url TEXT NOT NULL,
      last_sync DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'RECEPTIONIST',
      full_name TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      clinic_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      patient_code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      birth_date DATETIME,
      gender TEXT,
      blood_type TEXT,
      allergies TEXT,
      address TEXT,
      city TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS doctors (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT,
      specialty TEXT,
      license_no TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      duration INTEGER DEFAULT 30,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      appointment_number TEXT UNIQUE NOT NULL,
      patient_id TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      appointment_date DATETIME NOT NULL,
      status TEXT DEFAULT 'SCHEDULED',
      total_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'PENDING',
      payment_method TEXT,
      diagnosis TEXT,
      prescription TEXT,
      notes TEXT,
      terminal_id TEXT,
      synced INTEGER DEFAULT 0,
      synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS appointment_items (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id)
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Indexes
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_patients_code ON patients(patient_code)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_appointments_synced ON appointments(synced)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity)`;
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
  prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
    log: ['error'],
  });
  await prisma.$connect();
  await createSchemaIfNeeded(prisma);
}

export { prisma };
