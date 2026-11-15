import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { PrismaClient } from '../../generated/prisma-sqlite';
import { createSchemaIfNeeded } from './schema';

/**
 * v2.4 → v2.5 in place: a till database with the v2.4 shape (appointments.doctor_id NOT NULL)
 * and real-shaped rows is upgraded; every patient, visit and visit line must survive.
 */

let dir: string;
let db: PrismaClient;

// The v2.4 DDL of the tables the rebuild touches (src/main/database/schema.ts at b64d6a8).
const V24 = [
  `CREATE TABLE local_config (id TEXT PRIMARY KEY DEFAULT 'config', clinic_id TEXT NOT NULL,
     clinic_name TEXT NOT NULL, terminal_id TEXT NOT NULL, api_url TEXT NOT NULL,
     last_sync DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE users (id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL, email TEXT,
     password TEXT NOT NULL, role TEXT DEFAULT 'RECEPTIONIST', full_name TEXT NOT NULL,
     active INTEGER DEFAULT 1, clinic_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE patients (id TEXT PRIMARY KEY, patient_code TEXT UNIQUE NOT NULL,
     full_name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, birth_date DATETIME, gender TEXT,
     blood_type TEXT, allergies TEXT, address TEXT, city TEXT, notes TEXT, active INTEGER DEFAULT 1,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE doctors (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, phone TEXT, specialty TEXT,
     license_no TEXT, active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE services (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
     description TEXT, price REAL NOT NULL, duration INTEGER DEFAULT 30, active INTEGER DEFAULT 1,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE appointments (id TEXT PRIMARY KEY, appointment_number TEXT UNIQUE NOT NULL,
     patient_id TEXT NOT NULL, doctor_id TEXT NOT NULL, appointment_date DATETIME NOT NULL,
     status TEXT DEFAULT 'SCHEDULED', total_amount REAL DEFAULT 0, paid_amount REAL DEFAULT 0,
     payment_status TEXT DEFAULT 'PENDING', payment_method TEXT, diagnosis TEXT, prescription TEXT,
     notes TEXT, terminal_id TEXT, synced INTEGER DEFAULT 0, synced_at DATETIME,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY (patient_id) REFERENCES patients(id), FOREIGN KEY (doctor_id) REFERENCES doctors(id))`,
  `CREATE TABLE appointment_items (id TEXT PRIMARY KEY, appointment_id TEXT NOT NULL,
     service_id TEXT NOT NULL, service_name TEXT NOT NULL, quantity INTEGER DEFAULT 1,
     unit_price REAL NOT NULL, total REAL NOT NULL,
     FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
     FOREIGN KEY (service_id) REFERENCES services(id))`,
  `CREATE TABLE sync_queue (id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
     action TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER DEFAULT 0, last_error TEXT,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
];

const ROWS = [
  `INSERT INTO local_config (clinic_id, clinic_name, terminal_id, api_url) VALUES ('c1', 'Demo', 'T1', 'x')`,
  `INSERT INTO patients (id, patient_code, full_name, phone) VALUES ('p1', 'P-0001', 'Test', '+998901111111')`,
  `INSERT INTO doctors (id, full_name) VALUES ('d1', 'Dr')`,
  `INSERT INTO services (id, code, name, price) VALUES
     ('s1', 'PAR-CONS', 'Konsultatsiya', 150000), ('s2', 'PAR-CONS2', 'Takroriy', 0),
     ('s3', 'PAR-OP', 'Najas', 80000), ('s4', 'CUSTOM', 'Klizma', 50000)`,
  `INSERT INTO appointments (id, appointment_number, patient_id, doctor_id, appointment_date,
     status, total_amount, paid_amount, payment_status, diagnosis) VALUES
     ('a1', 'A-1', 'p1', 'd1', '2026-11-01T09:00:00Z', 'COMPLETED', 230000, 230000, 'PAID', 'Lyambliya'),
     ('a2', 'A-2', 'p1', 'd1', '2026-11-14T09:00:00Z', 'SCHEDULED', 150000, 0, 'PENDING', NULL),
     ('a3', 'A-3', 'p1', 'd1', '2026-11-10T09:00:00Z', 'CANCELLED', 80000, 0, 'PENDING', NULL)`,
  `INSERT INTO appointment_items (id, appointment_id, service_id, service_name, quantity, unit_price, total) VALUES
     ('i1', 'a1', 's1', 'Konsultatsiya', 1, 150000, 150000),
     ('i2', 'a1', 's3', 'Najas', 1, 80000, 80000),
     ('i3', 'a2', 's1', 'Konsultatsiya', 1, 150000, 150000),
     ('i4', 'a3', 's3', 'Najas', 1, 80000, 80000)`,
];

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'posclinic-upgrade-'));
  // biome-ignore lint/suspicious/noExplicitAny: generated client constructor
  const { PrismaClient: Client } = require(
    path.join(process.cwd(), 'src', 'generated', 'prisma-sqlite'),
  ) as any;
  db = new Client({ datasources: { db: { url: `file:${path.join(dir, 'till.db')}` } } });
  await db.$connect();
  for (const sql of [...V24, ...ROWS]) await db.$executeRawUnsafe(sql);
  await createSchemaIfNeeded(db);
  await createSchemaIfNeeded(db); // idempotent: the second run must change nothing
});

after(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe('v2.4 → v2.5 upgrade', () => {
  it('keeps every visit and visit line, with the old values', async () => {
    assert.equal(await db.appointment.count(), 3);
    assert.equal(await db.appointmentItem.count(), 4);
    const a1 = await db.appointment.findUnique({ where: { id: 'a1' }, include: { items: true } });
    assert.equal(a1?.doctorId, 'd1');
    assert.equal(a1?.diagnosis, 'Lyambliya');
    assert.equal(Number(a1?.paidAmount), 230000);
    assert.equal(Number(a1?.discountAmount), 0);
    assert.equal(a1?.caseId, null);
    assert.equal(a1?.items.length, 2);
  });

  it('gives old lines a queue state from their visit and the visit doctor', async () => {
    const items = await db.appointmentItem.findMany({ orderBy: { id: 'asc' } });
    assert.deepEqual(
      items.map((i) => [i.id, i.status, i.doctorId]),
      [
        ['i1', 'DONE', 'd1'],
        ['i2', 'DONE', 'd1'],
        ['i3', 'WAITING', 'd1'],
        ['i4', 'CANCELLED', 'd1'],
      ],
    );
    assert.ok(items[0].completedAt, 'a done line keeps when its visit was completed');
    assert.equal(items[2].completedAt, null);
  });

  it('makes doctor optional and still cascades lines from their own visit', async () => {
    const cols = await db.$queryRawUnsafe<{ name: string; notnull: number | bigint }[]>(
      'PRAGMA table_info(appointments)',
    );
    assert.equal(Number(cols.find((c) => c.name === 'doctor_id')?.notnull), 0);
    await db.appointment.create({
      data: {
        id: 'a4',
        appointmentNumber: 'A-4',
        patientId: 'p1',
        appointmentDate: new Date(),
        items: {
          create: [{ id: 'i5', serviceId: 's3', serviceName: 'Najas', unitPrice: 1, total: 1 }],
        },
      },
    });
    const refs = await db.$queryRawUnsafe<{ table: string; from: string; on_delete: string }[]>(
      'PRAGMA foreign_key_list(appointment_items)',
    );
    const toVisit = refs.find((r) => r.from === 'appointment_id');
    assert.equal(toVisit?.table, 'appointments');
    assert.equal(toVisit?.on_delete, 'CASCADE');
    const fk = await db.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check');
    assert.deepEqual(fk, []);
    await db.appointment.delete({ where: { id: 'a4' } });
    assert.equal(await db.appointmentItem.count({ where: { id: 'i5' } }), 0);
    assert.equal(await db.appointmentItem.count(), 4);
  });

  it('classifies the seeded services and leaves custom ones as procedures', async () => {
    const s = await db.service.findMany({ orderBy: { id: 'asc' } });
    assert.deepEqual(
      s.map((x) => [x.code, x.kind, x.isFollowUp, x.resultType]),
      [
        ['PAR-CONS', 'CONSULTATION', false, null],
        ['PAR-CONS2', 'CONSULTATION', true, null],
        ['PAR-OP', 'ANALYSIS', false, 'QUALITATIVE'],
        ['CUSTOM', 'PROCEDURE', false, null],
      ],
    );
  });

  it('adds the new tables and leaves no temporary tables behind', async () => {
    const t = await db.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = t.map((x) => x.name);
    for (const n of [
      'clinical_cases',
      'patient_vitals',
      'referrals',
      'analysis_results',
      'treatment_sessions',
    ]) {
      assert.ok(names.includes(n), n);
    }
    assert.ok(!names.some((n) => n.endsWith('_v25')), names.join(','));
  });
});
