/**
 * The till's SQLite schema: created by raw SQL on a fresh file and upgraded in place on an
 * existing one (tills hold patient data that exists nowhere else, so never wipe or recreate).
 * No Electron import, so tests can build a real till database (src/main/sync/*.test.ts).
 * Keep in step with prisma/schema.sqlite.prisma.
 */

/** The part of PrismaClient this file uses. */
export interface SchemaClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $executeRawUnsafe(query: string): Promise<number>;
  // biome-ignore lint/suspicious/noExplicitAny: Prisma's batch transaction type
  $transaction(queries: any[]): Promise<unknown>;
}

/** Staff log in by phone; email is optional and not unique. */
const usersTableSql = (name: string) => `
    CREATE TABLE IF NOT EXISTS ${name} (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'RECEPTIONIST',
      full_name TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      clinic_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`;

/**
 * v2.0.0: v1 tables have `email UNIQUE NOT NULL` and an optional phone. Rebuild them with
 * `phone UNIQUE NOT NULL` and an optional email, in one transaction. A row without a phone (v1
 * dev data only: no v1 till was ever deployed) keeps its email in the phone column so the row
 * survives. Idempotent: does nothing once the table has the v2 shape.
 */
async function migrateUsersTableIfNeeded(prisma: SchemaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ sql: string }[]>`
    SELECT sql FROM sqlite_master WHERE type='table' AND name='users'
  `;
  const ddl = rows[0]?.sql ?? '';
  if (!ddl || /phone\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i.test(ddl)) return;

  await prisma.$transaction([
    prisma.$executeRawUnsafe(usersTableSql('users_v2')),
    prisma.$executeRawUnsafe(`
      INSERT INTO users_v2 (id, phone, email, password, role, full_name, active, clinic_id, created_at, updated_at)
      SELECT id, COALESCE(NULLIF(phone, ''), email, id), email, password, role, full_name, active,
             clinic_id, created_at, updated_at
      FROM users
    `),
    prisma.$executeRawUnsafe('DROP TABLE users'),
    prisma.$executeRawUnsafe('ALTER TABLE users_v2 RENAME TO users'),
  ]);
  console.log('[db] Migrated users table: login by phone');
}

export async function createSchemaIfNeeded(prisma: SchemaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM sqlite_master WHERE type='table' AND name='local_config'
  `;

  if (rows.length > 0) {
    // DB already exists — run any pending in-place upgrades (each one idempotent)
    await migrateUsersTableIfNeeded(prisma);
    await addSyncTablesIfNeeded(prisma);
    await addLanTablesIfNeeded(prisma);
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

  await prisma.$executeRawUnsafe(usersTableSql('users'));

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

  await addSyncTablesIfNeeded(prisma);
  await addLanTablesIfNeeded(prisma);
}

/**
 * v2.1.0, cloud sync (src/main/sync): one cursor row per synced entity, plus indexes on
 * updated_at so "changed since" stays cheap. Additive and idempotent: runs on fresh and
 * existing databases alike.
 */
async function addSyncTablesIfNeeded(prisma: SchemaClient): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS sync_state (
      entity TEXT PRIMARY KEY,
      push_cursor TEXT,
      pull_cursor TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  for (const table of ['patients', 'doctors', 'services', 'users', 'appointments']) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_${table}_updated ON ${table}(updated_at)`,
    );
  }
}

/**
 * v2.2.0, satellite tills (src/main/lan): a key/value `settings` table (the LAN role, port,
 * link, lineage, the session-signing secret) and the paired satellites. Additive and idempotent.
 */
async function addLanTablesIfNeeded(prisma: SchemaClient): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS lan_devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      ip TEXT,
      last_seen_at DATETIME,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
}
