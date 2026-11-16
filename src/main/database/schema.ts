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
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
  // biome-ignore lint/suspicious/noExplicitAny: Prisma's batch and interactive transaction types
  $transaction(arg: any, options?: { maxWait?: number; timeout?: number }): Promise<any>;
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
    await addAddressTablesIfNeeded(prisma);
    await addClinicalWorkflowIfNeeded(prisma);
    await addServiceImageIfNeeded(prisma);
    await addCustomTypesIfNeeded(prisma);
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

  await prisma.$executeRawUnsafe(appointmentsTableSql('appointments'));
  await prisma.$executeRawUnsafe(appointmentItemsTableSql('appointment_items', 'appointments'));

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
  await addAddressTablesIfNeeded(prisma);
  await addClinicalWorkflowIfNeeded(prisma);
  await addServiceImageIfNeeded(prisma);
  await addCustomTypesIfNeeded(prisma);
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

/**
 * v2.4.0, Uzbekistan addresses (SOATO): the `admin_units` reference table and two optional
 * codes on patients. Additive and idempotent: runs on fresh and existing databases alike; the
 * data itself is imported by admin-units.ts.
 */
async function addAddressTablesIfNeeded(prisma: SchemaClient): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS admin_units (
      code TEXT PRIMARY KEY,
      parent_code TEXT REFERENCES admin_units(code),
      type TEXT NOT NULL,
      level INTEGER NOT NULL,
      name_uz TEXT NOT NULL,
      name_uz_cyrl TEXT,
      name_ru TEXT,
      name_en TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_admin_units_parent ON admin_units(parent_code, active)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_admin_units_level ON admin_units(level, active)`;

  const cols = await prisma.$queryRaw<{ name: string }[]>`PRAGMA table_info(patients)`;
  const has = new Set(cols.map((c) => c.name));
  if (!has.has('region_code')) {
    await prisma.$executeRaw`ALTER TABLE patients ADD COLUMN region_code TEXT REFERENCES admin_units(code)`;
  }
  if (!has.has('district_code')) {
    await prisma.$executeRaw`ALTER TABLE patients ADD COLUMN district_code TEXT REFERENCES admin_units(code)`;
  }
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_patients_region ON patients(region_code)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_patients_district ON patients(district_code)`;
}

// ── v2.5.0, clinical workflow: cases, queues, referrals, results, courses ─────────────────────

/**
 * Appointments are paid orders inside a case. `doctor_id` is nullable (analysis and procedure
 * orders have no doctor).
 */
const appointmentsTableSql = (name: string) => `
    CREATE TABLE IF NOT EXISTS ${name} (
      id TEXT PRIMARY KEY,
      appointment_number TEXT UNIQUE NOT NULL,
      patient_id TEXT NOT NULL,
      doctor_id TEXT,
      case_id TEXT,
      appointment_date DATETIME NOT NULL,
      status TEXT DEFAULT 'SCHEDULED',
      total_amount REAL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
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
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (case_id) REFERENCES clinical_cases(id)
    )`;

/** `appointments` = the table the items point at (a temporary name during the rebuild). */
const appointmentItemsTableSql = (name: string, appointments: string) => `
    CREATE TABLE IF NOT EXISTS ${name} (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      doctor_id TEXT,
      referral_id TEXT,
      status TEXT NOT NULL DEFAULT 'WAITING',
      performed_by TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (appointment_id) REFERENCES ${appointments}(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (referral_id) REFERENCES referrals(id)
    )`;

async function columnsOf(prisma: SchemaClient, table: string): Promise<Map<string, number>> {
  const cols = await prisma.$queryRawUnsafe<{ name: string; notnull: number | bigint }[]>(
    `PRAGMA table_info(${table})`,
  );
  return new Map(cols.map((c) => [c.name, Number(c.notnull)]));
}

/** Adds the column unless present; true when it was just added. */
async function addColumnIfMissing(
  prisma: SchemaClient,
  table: string,
  column: string,
  ddl: string,
): Promise<boolean> {
  if ((await columnsOf(prisma, table)).has(column)) return false;
  await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  return true;
}

async function countRows(prisma: SchemaClient, table: string): Promise<number> {
  const r = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(
    `SELECT COUNT(*) AS n FROM ${table}`,
  );
  return Number(r[0].n);
}

const APPOINTMENT_COPY_COLUMNS = [
  'id',
  'appointment_number',
  'patient_id',
  'doctor_id',
  'appointment_date',
  'status',
  'total_amount',
  'paid_amount',
  'payment_status',
  'payment_method',
  'diagnosis',
  'prescription',
  'notes',
  'terminal_id',
  'synced',
  'synced_at',
  'created_at',
  'updated_at',
].join(', ');

/**
 * The one non-additive upgrade (owner decision 2026-11-15): v2.4 `appointments.doctor_id` is NOT
 * NULL, which SQLite cannot relax in place. Both tables are copied in ONE transaction:
 *
 *   appointments → appointments_v25; appointment_items → appointment_items_v25, which points at
 *   appointments_v25. The old child table goes before its parent, so the ON DELETE CASCADE from
 *   items to appointments has nothing to fire on; then both renames (SQLite rewrites the
 *   reference from appointments_v25 to appointments).
 *
 * Row counts are compared before anything is removed; a mismatch or any error rolls the whole
 * transaction back and the old tables stay exactly as they were. Idempotent: skipped once
 * doctor_id is nullable.
 */
async function rebuildAppointmentsIfNeeded(prisma: SchemaClient): Promise<void> {
  if ((await columnsOf(prisma, 'appointments')).get('doctor_id') !== 1) return;

  await prisma.$transaction(
    async (tx: SchemaClient) => {
      const appts = await countRows(tx, 'appointments');
      // A line whose visit is gone cannot exist with foreign keys on; if one ever does, it is
      // kept aside in its own table (never silently lost) instead of failing every start.
      const orphans = Number(
        (
          await tx.$queryRawUnsafe<{ n: number | bigint }[]>(
            `SELECT COUNT(*) AS n FROM appointment_items
             WHERE appointment_id NOT IN (SELECT id FROM appointments)`,
          )
        )[0].n,
      );
      if (orphans > 0) {
        await tx.$executeRawUnsafe(
          `CREATE TABLE IF NOT EXISTS appointment_items_orphaned AS
           SELECT * FROM appointment_items WHERE 0`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO appointment_items_orphaned SELECT * FROM appointment_items
           WHERE appointment_id NOT IN (SELECT id FROM appointments)`,
        );
        console.warn(`[db] appointments rebuild: ${orphans} line(s) without a visit set aside`);
      }
      const items = (await countRows(tx, 'appointment_items')) - orphans;

      await tx.$executeRawUnsafe(appointmentsTableSql('appointments_v25'));
      await tx.$executeRawUnsafe(
        `INSERT INTO appointments_v25 (${APPOINTMENT_COPY_COLUMNS})
         SELECT ${APPOINTMENT_COPY_COLUMNS} FROM appointments`,
      );
      await tx.$executeRawUnsafe(
        appointmentItemsTableSql('appointment_items_v25', 'appointments_v25'),
      );
      // Existing lines take their order's state and doctor: a completed visit is done.
      await tx.$executeRawUnsafe(`
        INSERT INTO appointment_items_v25
          (id, appointment_id, service_id, service_name, quantity, unit_price, total, doctor_id,
           status, completed_at)
        SELECT i.id, i.appointment_id, i.service_id, i.service_name, i.quantity, i.unit_price,
               i.total, a.doctor_id,
               CASE a.status WHEN 'COMPLETED' THEN 'DONE'
                             WHEN 'CANCELLED' THEN 'CANCELLED'
                             WHEN 'NO_SHOW' THEN 'CANCELLED'
                             ELSE 'WAITING' END,
               CASE a.status WHEN 'COMPLETED' THEN a.updated_at ELSE NULL END
        FROM appointment_items i JOIN appointments a ON a.id = i.appointment_id
      `);
      if ((await countRows(tx, 'appointments_v25')) !== appts) {
        throw new Error('appointments copy: row count mismatch');
      }
      if ((await countRows(tx, 'appointment_items_v25')) !== items) {
        throw new Error('appointment_items copy: row count mismatch');
      }

      await tx.$executeRawUnsafe('DROP TABLE appointment_items');
      await tx.$executeRawUnsafe('DROP TABLE appointments');
      await tx.$executeRawUnsafe('ALTER TABLE appointments_v25 RENAME TO appointments');
      await tx.$executeRawUnsafe('ALTER TABLE appointment_items_v25 RENAME TO appointment_items');
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
  console.log('[db] Rebuilt appointments: doctor optional, case + queue columns');
}

const SEEDED_CONSULTATIONS = ['PAR-CONS', 'PAR-CONS2'];
const SEEDED_ANALYSES = [
  'PAR-OP',
  'PAR-ENT',
  'PAR-GIA',
  'PAR-ASC',
  'PAR-TOX',
  'PAR-ECH',
  'PAR-OPI',
  'PAR-MAL',
];

/**
 * v2.5.0: cases, per-visit vitals, referrals, analysis results, course sessions; service types;
 * doctor logins; chronic conditions; the appointments rebuild above. Idempotent; runs on fresh
 * and existing databases alike.
 */
async function addClinicalWorkflowIfNeeded(prisma: SchemaClient): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS clinical_cases (
      id TEXT PRIMARY KEY,
      case_number TEXT UNIQUE NOT NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      doctor_id TEXT REFERENCES doctors(id),
      status TEXT NOT NULL DEFAULT 'OPEN',
      complaint TEXT,
      diagnosis TEXT,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES clinical_cases(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      doctor_id TEXT REFERENCES doctors(id),
      service_id TEXT NOT NULL REFERENCES services(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      per_day INTEGER,
      days INTEGER,
      instructions TEXT,
      registered_qty INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS patient_vitals (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      case_id TEXT REFERENCES clinical_cases(id),
      height_cm REAL,
      weight_kg REAL,
      temperature REAL,
      bp_systolic INTEGER,
      bp_diastolic INTEGER,
      pregnant INTEGER,
      complaints TEXT,
      recorded_by TEXT,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await rebuildAppointmentsIfNeeded(prisma);

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS analysis_results (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES appointment_items(id),
      case_id TEXT REFERENCES clinical_cases(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      service_id TEXT NOT NULL REFERENCES services(id),
      outcome TEXT,
      value REAL,
      unit TEXT,
      finding TEXT,
      comment TEXT,
      sample_taken_at DATETIME,
      entered_by TEXT,
      entered_at DATETIME,
      confirmed_by TEXT,
      confirmed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS treatment_sessions (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES appointment_items(id),
      number INTEGER NOT NULL,
      planned_date DATETIME,
      done_at DATETIME,
      done_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (item_id, number)
    )
  `;

  // Services: the type of service. The columns and the one-time classification of the seeded
  // parasitology codes go in ONE transaction, so a crash in between cannot leave them
  // unclassified; after that the admin's choice on the Services page wins.
  const serviceCols = await columnsOf(prisma, 'services');
  const serviceAdds = [
    ['kind', "TEXT NOT NULL DEFAULT 'PROCEDURE'"],
    ['is_follow_up', 'INTEGER NOT NULL DEFAULT 0'],
    ['result_type', 'TEXT'],
    ['result_unit', 'TEXT'],
    ['reference_range', 'TEXT'],
  ].filter(([c]) => !serviceCols.has(c));
  if (serviceAdds.length > 0) {
    const list = (codes: string[]) => codes.map((c) => `'${c}'`).join(', ');
    const classify = !serviceCols.has('kind')
      ? [
          `UPDATE services SET kind = 'CONSULTATION' WHERE code IN (${list(SEEDED_CONSULTATIONS)})`,
          `UPDATE services SET is_follow_up = 1 WHERE code = 'PAR-CONS2'`,
          `UPDATE services SET kind = 'ANALYSIS', result_type = 'QUALITATIVE'
           WHERE code IN (${list(SEEDED_ANALYSES)})`,
        ]
      : [];
    await prisma.$transaction([
      ...serviceAdds.map(([c, ddl]) =>
        prisma.$executeRawUnsafe(`ALTER TABLE services ADD COLUMN ${c} ${ddl}`),
      ),
      ...classify.map((sql) => prisma.$executeRawUnsafe(sql)),
    ]);
  }

  await addColumnIfMissing(prisma, 'doctors', 'user_id', 'TEXT REFERENCES users(id)');
  await addColumnIfMissing(prisma, 'patients', 'chronic_conditions', 'TEXT');

  const indexes = [
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_user ON doctors(user_id)',
    // Recreated after the rebuild (they go with the old table).
    'CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_synced ON appointments(synced)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_updated ON appointments(updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_case ON appointments(case_id)',
    'CREATE INDEX IF NOT EXISTS idx_items_appointment ON appointment_items(appointment_id)',
    'CREATE INDEX IF NOT EXISTS idx_items_doctor ON appointment_items(doctor_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_items_status ON appointment_items(status)',
    'CREATE INDEX IF NOT EXISTS idx_cases_patient ON clinical_cases(patient_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_cases_doctor ON clinical_cases(doctor_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_vitals_patient ON patient_vitals(patient_id, recorded_at)',
    'CREATE INDEX IF NOT EXISTS idx_referrals_patient ON referrals(patient_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_referrals_case ON referrals(case_id)',
    'CREATE INDEX IF NOT EXISTS idx_results_patient ON analysis_results(patient_id)',
    'CREATE INDEX IF NOT EXISTS idx_results_case ON analysis_results(case_id)',
    'CREATE INDEX IF NOT EXISTS idx_results_item ON analysis_results(item_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_planned ON treatment_sessions(planned_date, done_at)',
  ];
  for (const sql of indexes) await prisma.$executeRawUnsafe(sql);
}

/** v2.5.0: a picture per service (till only, never synced). Additive and idempotent. */
async function addServiceImageIfNeeded(prisma: SchemaClient): Promise<void> {
  await addColumnIfMissing(prisma, 'services', 'image', 'TEXT');
}

/**
 * v2.5.0: order and staff types the clinic adds in Settings → Types, and the links from services
 * and users. Additive and idempotent.
 */
async function addCustomTypesIfNeeded(prisma: SchemaClient): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS service_types (
      id TEXT PRIMARY KEY,
      name_uz TEXT NOT NULL,
      name_ru TEXT,
      behavior TEXT NOT NULL,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS staff_types (
      id TEXT PRIMARY KEY,
      name_uz TEXT NOT NULL,
      name_ru TEXT,
      access TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await addColumnIfMissing(prisma, 'services', 'service_type_id', 'TEXT REFERENCES service_types(id)');
  await addColumnIfMissing(prisma, 'users', 'staff_type_id', 'TEXT REFERENCES staff_types(id)');
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS idx_service_types_updated ON service_types(updated_at)',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS idx_staff_types_updated ON staff_types(updated_at)',
  );
}
