import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createSchemaIfNeeded } from '../database/schema';
import {
  BATCH,
  cursorOf,
  isNewer,
  type PullAnswer,
  type PushAnswer,
  parseCursor,
  pendingCount,
  runSync,
  type SyncDb,
  type SyncTransport,
} from './sync-engine';

// The real generated till client against a throwaway SQLite file with the real schema.
// biome-ignore lint/suspicious/noExplicitAny: generated client
const { PrismaClient } = require(
  path.join(process.cwd(), 'src', 'generated', 'prisma-sqlite'),
) as any;

const dir = mkdtempSync(path.join(tmpdir(), 'posclinic-sync-'));
// biome-ignore lint/suspicious/noExplicitAny: generated client
let db: any;

before(async () => {
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'till.db')}` } } });
  await db.$connect();
  await createSchemaIfNeeded(db);
  await createSchemaIfNeeded(db); // the upgrade path is idempotent
});

after(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

class FakeServer implements SyncTransport {
  pushes: Record<string, Record<string, unknown>[]>[] = [];
  pullSince: (string | null)[] = [];
  next: Omit<PullAnswer, 'serverTime'> = { doctors: [], services: [], users: [] };
  reject = new Set<string>();
  time = '2026-11-15T10:00:00.000Z';

  async push(body: Record<string, unknown[]>): Promise<PushAnswer> {
    this.pushes.push(body as Record<string, Record<string, unknown>[]>);
    const [entity, rows] = Object.entries(body)[0]!;
    const rejected = (rows as { id: string }[])
      .filter((r) => this.reject.has(r.id))
      .map((r) => ({ entity, id: r.id, reason: 'phone_taken' }));
    return {
      accepted: { [entity]: rows.length - rejected.length },
      rejected,
      serverTime: this.time,
    };
  }

  async pull(since: string | null): Promise<PullAnswer> {
    this.pullSince.push(since);
    const answer = { ...this.next, serverTime: this.time };
    this.next = { doctors: [], services: [], users: [] };
    return answer;
  }

  sent(entity: string): Record<string, unknown>[] {
    return this.pushes.flatMap((p) => p[entity] ?? []);
  }
}

const sdb = () => db as SyncDb;

describe('cursor and LWW helpers', () => {
  it('round-trips a cursor and orders by time then id', () => {
    const c = cursorOf({ id: 'b', updatedAt: new Date('2026-11-15T09:00:00Z') });
    assert.deepEqual(parseCursor(c), { at: new Date('2026-11-15T09:00:00Z'), id: 'b' });
    assert.equal(parseCursor(null), null);
    assert.equal(parseCursor('garbage'), null);
  });

  it('last write wins only when strictly newer', () => {
    assert.equal(isNewer('2026-01-02', undefined), true);
    assert.equal(isNewer('2026-01-02', '2026-01-01'), true);
    assert.equal(isNewer('2026-01-01', '2026-01-01'), false);
    assert.equal(isNewer('2026-01-01', '2026-01-02'), false);
  });
});

describe('runSync against a real till database', () => {
  it('pushes in dependency order with wire shapes, then nothing twice', async () => {
    await db.user.create({
      data: {
        id: 'u1',
        phone: '+998901112233',
        password: '$2a$10$hash',
        role: 'CLINIC_ADMIN',
        fullName: 'Admin',
      },
    });
    await db.doctor.create({ data: { id: 'd1', fullName: 'Dr A' } });
    await db.service.create({ data: { id: 's1', code: 'PAR-OP', name: 'O&P', price: 50000 } });
    await db.patient.create({
      data: { id: 'p1', patientCode: 'P-1', fullName: 'Ali', phone: '+998901234567' },
    });
    await db.appointment.create({
      data: {
        id: 'a1',
        appointmentNumber: 'A20261115-001',
        patientId: 'p1',
        doctorId: 'd1',
        appointmentDate: new Date('2026-11-15T09:00:00Z'),
        totalAmount: 50000,
        items: {
          create: [
            {
              id: 'i1',
              serviceId: 's1',
              serviceName: 'O&P',
              quantity: 1,
              unitPrice: 50000,
              total: 50000,
            },
          ],
        },
      },
    });

    const server = new FakeServer();
    assert.equal(await pendingCount(sdb()), 5);
    const r = await runSync(sdb(), server);
    assert.equal(r.pushed, 5);
    assert.deepEqual(
      server.pushes.map((p) => Object.keys(p)[0]),
      ['users', 'doctors', 'services', 'patients', 'appointments'],
    );

    const user = server.sent('users')[0]!;
    assert.equal(user.passwordHash, '$2a$10$hash');
    assert.equal('password' in user, false, 'the column name never goes out');
    const appt = server.sent('appointments')[0]!;
    assert.equal(typeof appt.updatedAt, 'string');
    assert.equal((appt.items as unknown[]).length, 1);
    assert.equal('synced' in appt, false);

    const again = new FakeServer();
    assert.equal((await runSync(sdb(), again)).pushed, 0);
    assert.equal(again.pushes.length, 0);
    assert.equal(await pendingCount(sdb()), 0);
  });

  it('pushes an edited row again, and pages through more than one batch', async () => {
    await db.patient.update({ where: { id: 'p1' }, data: { notes: 'allergic' } });
    const rows = Array.from({ length: BATCH + 5 }, (_, i) => ({
      id: `bulk-${String(i).padStart(4, '0')}`,
      patientCode: `B-${i}`,
      fullName: `Bulk ${i}`,
      phone: `+99890${String(1000000 + i)}`,
    }));
    for (const data of rows) await db.patient.create({ data });

    const server = new FakeServer();
    const r = await runSync(sdb(), server);
    assert.equal(r.pushed, BATCH + 6);
    assert.equal(server.sent('patients').length, BATCH + 6);
    assert.ok(server.pushes.every((p) => (Object.values(p)[0] as unknown[]).length <= BATCH));
  });

  it('logs and skips rows the server refuses instead of blocking', async () => {
    await db.user.create({
      data: {
        id: 'u2',
        phone: '+998907778899',
        password: 'h',
        role: 'RECEPTIONIST',
        fullName: 'R',
      },
    });
    const server = new FakeServer();
    server.reject.add('u2');
    const warnings: string[] = [];
    const r = await runSync(sdb(), server, { warn: (m) => warnings.push(m) });
    assert.equal(r.rejected, 1);
    assert.equal(warnings.length, 1);
    assert.equal((await runSync(sdb(), new FakeServer())).pushed, 0, 'cursor moved past it');
  });

  it('pulls catalog edits with last-write-wins and keeps the server time as cursor', async () => {
    const server = new FakeServer();
    server.next = {
      services: [
        // newer price from the dashboard: applied
        {
          id: 's1',
          code: 'PAR-OP',
          name: 'O&P',
          description: null,
          price: 65000,
          duration: 15,
          active: true,
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2099-01-01T00:00:00.000Z',
        },
        // brand-new service made on the web: created
        {
          id: 's-web',
          code: 'PAR-NEW',
          name: 'New test',
          description: null,
          price: 1000,
          duration: 10,
          active: true,
          createdAt: '2026-11-15T00:00:00.000Z',
          updatedAt: '2026-11-15T00:00:00.000Z',
        },
      ],
      doctors: [
        // older than the till's own copy: ignored
        {
          id: 'd1',
          fullName: 'Stale name',
          phone: null,
          specialty: null,
          licenseNo: null,
          active: true,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      users: [
        {
          id: 'u-web',
          fullName: 'Web Nurse',
          phone: '+998905556677',
          email: null,
          role: 'RECEPTIONIST',
          active: true,
          passwordHash: '$2a$10$webhash',
          clinicId: 'x',
          syncedAt: 'x',
          createdAt: '2026-11-15T00:00:00.000Z',
          updatedAt: '2026-11-15T00:00:00.000Z',
        },
      ],
    };
    const r = await runSync(sdb(), server);
    assert.equal(r.pulled, 3);

    const s1 = await db.service.findUnique({ where: { id: 's1' } });
    assert.equal(Number(s1.price), 65000);
    assert.equal(
      s1.updatedAt.toISOString(),
      '2099-01-01T00:00:00.000Z',
      'Prisma keeps an explicit updatedAt instead of stamping now',
    );
    assert.equal((await db.doctor.findUnique({ where: { id: 'd1' } })).fullName, 'Dr A');
    const nurse = await db.user.findUnique({ where: { id: 'u-web' } });
    assert.equal(nurse.password, '$2a$10$webhash');

    await runSync(sdb(), server);
    assert.equal(server.pullSince.at(-1), '2026-11-15T10:00:00.000Z');
  });

  it('a pulled row that clashes locally is skipped, not fatal', async () => {
    const server = new FakeServer();
    server.next = {
      doctors: [],
      users: [],
      services: [
        {
          id: 's-clash',
          code: 'PAR-OP',
          name: 'Same code',
          description: null,
          price: 1,
          duration: 1,
          active: true,
          createdAt: '2026-11-15T00:00:00.000Z',
          updatedAt: '2026-11-15T00:00:00.000Z',
        },
      ],
    };
    const warnings: string[] = [];
    const r = await runSync(sdb(), server, { warn: (m) => warnings.push(m) });
    assert.equal(r.pulled, 0);
    assert.match(warnings[0] ?? '', /services s-clash/);
  });

  it('pushes the clinical records (v2.5): case first, sessions inside their line', async () => {
    await db.clinicalCase.create({
      data: { id: 'c1', caseNumber: 'C-1', patientId: 'p1', status: 'ON_TREATMENT' },
    });
    await db.referral.create({
      data: {
        id: 'r1',
        caseId: 'c1',
        patientId: 'p1',
        serviceId: 's1',
        quantity: 2,
        registeredQty: 2,
        status: 'REGISTERED',
      },
    });
    await db.appointment.create({
      data: {
        id: 'a-course',
        appointmentNumber: 'A-C',
        patientId: 'p1',
        caseId: 'c1',
        appointmentDate: new Date(),
        totalAmount: 90000,
        discountAmount: 10000,
        items: {
          create: [
            {
              id: 'i-course',
              serviceId: 's1',
              serviceName: 'Huqna',
              quantity: 2,
              unitPrice: 50000,
              discount: 10000,
              total: 90000,
              referralId: 'r1',
              sessions: {
                create: [
                  { id: 'ts1', number: 1 },
                  { id: 'ts2', number: 2, doneAt: new Date() },
                ],
              },
            },
          ],
        },
      },
    });
    await db.patientVitals.create({
      data: { id: 'v1', patientId: 'p1', caseId: 'c1', weightKg: 70.5 },
    });

    const server = new FakeServer();
    await runSync(sdb(), server);
    const order = server.pushes.map((p) => Object.keys(p)[0]);
    assert.ok(order.indexOf('cases') < order.indexOf('appointments'), order.join(','));
    assert.ok(order.indexOf('referrals') < order.indexOf('appointments'), order.join(','));
    const a = server.sent('appointments').find((x) => x.id === 'a-course') as Record<
      string,
      unknown
    >;
    assert.equal(a.doctorId, null);
    assert.equal(a.discountAmount, 10000);
    const [line] = a.items as Record<string, unknown>[];
    assert.equal(line.discount, 10000);
    const sessions = line.sessions as Record<string, unknown>[];
    assert.deepEqual(
      sessions.map((s) => s.number),
      [1, 2],
    );
    assert.equal(typeof sessions[1].doneAt, 'string');
    assert.ok(!('itemId' in sessions[0]));
    assert.equal(server.sent('vitals')[0]?.weightKg, 70.5);
  });
});
