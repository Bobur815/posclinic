import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  applyPush,
  batchError,
  type RowMap,
  type StoredRef,
  type SyncDb,
  type SyncEntity,
  shouldApply,
} from './sync-apply';

const HASH = `$2a$10$${'a'.repeat(53)}`;

/** In-memory SyncDb: rows keyed by id, each with its clinic. */
class FakeDb implements SyncDb {
  rows: Record<
    SyncEntity,
    Map<string, { clinicId: string; row: RowMap[SyncEntity]; syncedAt: Date }>
  > = {
    users: new Map(),
    doctors: new Map(),
    services: new Map(),
    patients: new Map(),
    appointments: new Map(),
    cases: new Map(),
    referrals: new Map(),
    vitals: new Map(),
    results: new Map(),
    serviceTypes: new Map(),
    staffTypes: new Map(),
    products: new Map(),
    stockReceipts: new Map(),
    stockMovements: new Map(),
    expenses: new Map(),
    payments: new Map(),
  };
  writes = 0;

  async find(entity: SyncEntity, ids: string[]): Promise<StoredRef[]> {
    return ids.flatMap((id) => {
      const r = this.rows[entity].get(id);
      return r ? [{ id, clinicId: r.clinicId, updatedAt: r.row.updatedAt }] : [];
    });
  }
  async userIdByPhone(clinicId: string, phone: string) {
    for (const [id, r] of this.rows.users) {
      if (r.clinicId === clinicId && (r.row as RowMap['users']).phone === phone) return id;
    }
    return null;
  }
  async serviceIdByCode(clinicId: string, code: string) {
    for (const [id, r] of this.rows.services) {
      if (r.clinicId === clinicId && (r.row as RowMap['services']).code === code) return id;
    }
    return null;
  }
  async write<E extends SyncEntity>(entity: E, clinicId: string, row: RowMap[E], syncedAt: Date) {
    this.writes++;
    this.rows[entity].set(row.id, { clinicId, row, syncedAt });
  }
}

const T0 = '2026-11-15T08:00:00.000Z';
const T1 = '2026-11-15T09:00:00.000Z';
const T2 = '2026-11-15T10:00:00.000Z';
const NOW = new Date('2026-11-15T10:05:00Z');

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  fullName: 'Admin',
  phone: '90 111 22 33',
  email: null,
  role: 'CLINIC_ADMIN',
  active: true,
  passwordHash: HASH,
  createdAt: T0,
  updatedAt: T1,
  ...over,
});
const doctor = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  fullName: 'Dr',
  phone: null,
  specialty: null,
  licenseNo: null,
  active: true,
  createdAt: T0,
  updatedAt: T1,
  ...over,
});
const service = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  code: 'PAR-CONS',
  name: 'Consultation',
  description: null,
  price: 100000,
  duration: 20,
  active: true,
  createdAt: T0,
  updatedAt: T1,
  ...over,
});
const patient = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  patientCode: 'P-1',
  fullName: 'Patient',
  phone: '+998900000001',
  birthDate: null,
  gender: null,
  bloodType: null,
  allergies: null,
  address: null,
  city: null,
  notes: null,
  active: true,
  createdAt: T0,
  updatedAt: T1,
  ...over,
});
const appointment = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  appointmentNumber: 'A-1',
  patientId: 'p1',
  doctorId: 'd1',
  appointmentDate: T1,
  status: 'COMPLETED',
  totalAmount: 100000,
  paidAmount: 100000,
  paymentStatus: 'PAID',
  paymentMethod: 'CASH',
  diagnosis: null,
  prescription: null,
  notes: null,
  terminalId: 'T-1',
  createdAt: T0,
  updatedAt: T1,
  items: [
    {
      id: 'i1',
      serviceId: 's1',
      serviceName: 'Consultation',
      quantity: 1,
      unitPrice: 100000,
      total: 100000,
    },
  ],
  ...over,
});

const fullBatch = () => ({
  users: [user()],
  doctors: [doctor()],
  services: [service()],
  patients: [patient()],
  appointments: [appointment()],
});

describe('shouldApply (last write wins)', () => {
  it('writes new rows and strictly newer rows only', () => {
    assert.equal(shouldApply(null, new Date(T1)), true);
    assert.equal(shouldApply(new Date(T1), new Date(T2)), true);
    assert.equal(shouldApply(new Date(T1), new Date(T1)), false);
    assert.equal(shouldApply(new Date(T2), new Date(T1)), false);
  });
});

describe('applyPush', () => {
  let db: FakeDb;
  beforeEach(() => {
    db = new FakeDb();
  });

  it('accepts a full batch in dependency order (appointment after its patient)', async () => {
    const r = await applyPush(db, 'c1', fullBatch(), NOW);
    assert.deepEqual(r.rejected, []);
    assert.deepEqual(r.accepted, {
      users: 1,
      doctors: 1,
      services: 1,
      patients: 1,
      appointments: 1,
      cases: 0,
      referrals: 0,
      vitals: 0,
      results: 0,
      serviceTypes: 0,
      staffTypes: 0,
      products: 0,
      stockReceipts: 0,
      stockMovements: 0,
      expenses: 0,
      payments: 0,
    });
    assert.equal(r.written, 5);
    assert.equal((db.rows.users.get('u1')?.row as RowMap['users']).phone, '+998901112233');
  });

  it('is idempotent: the same batch twice writes nothing the second time', async () => {
    await applyPush(db, 'c1', fullBatch(), NOW);
    const writes = db.writes;
    const again = await applyPush(db, 'c1', fullBatch(), NOW);
    assert.equal(db.writes, writes);
    assert.equal(again.written, 0);
    assert.deepEqual(again.rejected, []);
    assert.equal(again.accepted.appointments, 1);
  });

  it('ignores an older row and lets a newer one win', async () => {
    await applyPush(db, 'c1', { services: [service({ updatedAt: T1, price: 100 })] }, NOW);
    await applyPush(db, 'c1', { services: [service({ updatedAt: T0, price: 1 })] }, NOW);
    assert.equal((db.rows.services.get('s1')?.row as RowMap['services']).price, 100);
    await applyPush(db, 'c1', { services: [service({ updatedAt: T2, price: 200 })] }, NOW);
    assert.equal((db.rows.services.get('s1')?.row as RowMap['services']).price, 200);
  });

  it('never touches another clinic: a foreign id is rejected, references must be local', async () => {
    await applyPush(db, 'c1', fullBatch(), NOW);
    const r = await applyPush(db, 'c2', { patients: [patient({ updatedAt: T2 })] }, NOW);
    assert.deepEqual(r.rejected, [{ entity: 'patients', id: 'p1', reason: 'foreign_id' }]);
    assert.equal(db.rows.patients.get('p1')?.clinicId, 'c1');

    // c2 cannot attach a visit to c1's patient/doctor/service.
    const v = await applyPush(db, 'c2', { appointments: [appointment({ id: 'a2' })] }, NOW);
    assert.deepEqual(v.rejected, [{ entity: 'appointments', id: 'a2', reason: 'missing_patient' }]);
  });

  it('rejects bad rows without failing the batch', async () => {
    await applyPush(db, 'c1', { users: [user()] }, NOW);
    const r = await applyPush(
      db,
      'c1',
      {
        users: [
          user({ id: 'u2', updatedAt: T2 }), // same phone as u1
          user({ id: 'u3', phone: '123', updatedAt: T2 }),
          user({ id: 'u4', phone: '+998907777777', passwordHash: 'plaintext' }),
          user({ id: 'u5', phone: '+998908888888', role: 'OWNER' }),
        ],
        doctors: [doctor()],
        appointments: [
          appointment({ id: 'a9', items: [{ ...appointment().items[0], serviceId: 'nope' }] }),
        ],
      },
      NOW,
    );
    assert.deepEqual(
      r.rejected.map((x) => [x.id, x.reason]),
      [
        ['u3', 'phone_invalid'],
        ['u4', 'invalid'],
        ['u5', 'role_invalid'],
        ['u2', 'phone_taken'],
        ['a9', 'missing_patient'],
      ],
    );
    assert.equal(r.accepted.doctors, 1);
  });

  it('rejects a service code already used by another service of the clinic', async () => {
    await applyPush(db, 'c1', { services: [service()] }, NOW);
    const r = await applyPush(db, 'c1', { services: [service({ id: 's2' })] }, NOW);
    assert.deepEqual(r.rejected, [{ entity: 'services', id: 's2', reason: 'code_taken' }]);
    // Another clinic may use the same code.
    const other = await applyPush(db, 'c2', { services: [service({ id: 's3' })] }, NOW);
    assert.deepEqual(other.rejected, []);
  });
});

describe('applyPush: clinical workflow rows (till v2.5)', () => {
  let db: FakeDb;
  beforeEach(() => {
    db = new FakeDb();
  });
  const base = {
    users: [user()],
    doctors: [doctor()],
    services: [
      service(),
      service({ id: 's2', code: 'PAR-OP', kind: 'ANALYSIS', resultType: 'QUALITATIVE' }),
    ],
    patients: [
      patient({ regionCode: '1726', districtCode: '1726292', chronicConditions: 'Gastrit' }),
    ],
  };
  const theCase = (over: Record<string, unknown> = {}) => ({
    id: 'c-1',
    caseNumber: 'C20261115-001',
    patientId: 'p1',
    doctorId: 'd1',
    status: 'RESULT_READY',
    complaint: null,
    diagnosis: 'Lyambliya',
    openedAt: T0,
    closedAt: null,
    createdAt: T0,
    updatedAt: T1,
    ...over,
  });

  it('accepts an order without a doctor, its case, sessions, referral, vitals and result', async () => {
    const r = await applyPush(
      db,
      'c1',
      {
        ...base,
        cases: [theCase()],
        referrals: [
          {
            id: 'r-1',
            caseId: 'c-1',
            patientId: 'p1',
            doctorId: 'd1',
            serviceId: 's2',
            quantity: 1,
            perDay: null,
            days: null,
            instructions: 'Ertalab',
            registeredQty: 1,
            status: 'REGISTERED',
            createdAt: T0,
            updatedAt: T1,
          },
        ],
        appointments: [
          appointment({
            id: 'a2',
            doctorId: null,
            caseId: 'c-1',
            discountAmount: 0,
            items: [
              {
                id: 'i2',
                serviceId: 's2',
                serviceName: 'Najas',
                quantity: 2,
                unitPrice: 80000,
                discount: 16000,
                total: 144000,
                doctorId: null,
                referralId: 'r-1',
                status: 'DONE',
                completedAt: T1,
                sessions: [
                  { id: 'ts1', number: 1, plannedDate: T0, doneAt: T1, doneBy: 'u1' },
                  { id: 'ts2', number: 2, plannedDate: T0, doneAt: null, doneBy: null },
                ],
              },
            ],
          }),
        ],
        vitals: [
          {
            id: 'v-1',
            patientId: 'p1',
            caseId: 'c-1',
            heightCm: 172,
            weightKg: 68.5,
            temperature: null,
            bpSystolic: null,
            bpDiastolic: null,
            pregnant: null,
            complaints: null,
            recordedBy: 'u1',
            recordedAt: T1,
            updatedAt: T1,
          },
        ],
        results: [
          {
            id: 'res-1',
            itemId: 'i2',
            caseId: 'c-1',
            patientId: 'p1',
            serviceId: 's2',
            outcome: 'POSITIVE',
            value: null,
            unit: null,
            finding: 'Giardia',
            comment: null,
            sampleTakenAt: T0,
            enteredBy: 'u1',
            enteredAt: T1,
            confirmedBy: null,
            confirmedAt: null,
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      },
      NOW,
    );
    assert.deepEqual(r.rejected, []);
    assert.deepEqual(
      [
        r.accepted.cases,
        r.accepted.referrals,
        r.accepted.appointments,
        r.accepted.vitals,
        r.accepted.results,
      ],
      [1, 1, 1, 1, 1],
    );
    const a = db.rows.appointments.get('a2')?.row as {
      doctorId: unknown;
      items: { sessions: unknown[]; status: string }[];
    };
    assert.equal(a.doctorId, null);
    assert.equal(a.items[0].status, 'DONE');
    assert.equal(a.items[0].sessions.length, 2);
    const p = db.rows.patients.get('p1')?.row as {
      districtCode: string;
      chronicConditions: string;
    };
    assert.deepEqual([p.districtCode, p.chronicConditions], ['1726292', 'Gastrit']);
    const s2 = db.rows.services.get('s2')?.row as { kind: string; resultType: string };
    assert.deepEqual([s2.kind, s2.resultType], ['ANALYSIS', 'QUALITATIVE']);
  });

  it('still accepts a v2.4 till’s rows (no new fields) with their defaults', async () => {
    const r = await applyPush(db, 'c1', { ...base, appointments: [appointment()] }, NOW);
    assert.deepEqual(r.rejected, []);
    const a = db.rows.appointments.get('a1')?.row as {
      discountAmount: number;
      items: { status: string; discount: number }[];
    };
    assert.deepEqual([a.discountAmount, a.items[0].status, a.items[0].discount], [0, 'WAITING', 0]);
    assert.equal((db.rows.services.get('s1')?.row as { kind: string }).kind, 'PROCEDURE');
  });

  it('rejects clinical rows pointing at a case or patient the clinic does not have', async () => {
    const r = await applyPush(
      db,
      'c1',
      {
        ...base,
        cases: [
          theCase({ id: 'c-x', patientId: 'nobody' }),
          theCase({ id: 'c-bad', status: 'LOST' }),
        ],
        appointments: [appointment({ id: 'a3', caseId: 'c-x' })],
      },
      NOW,
    );
    assert.deepEqual(
      r.rejected.map((x) => [x.entity, x.id, x.reason]),
      [
        ['cases', 'c-bad', 'invalid'],
        ['cases', 'c-x', 'missing_patient'],
        ['appointments', 'a3', 'missing_case'],
      ],
    );
  });

  it('accepts the clinic’s own order and staff types, and a no-login STAFF user', async () => {
    const r = await applyPush(
      db,
      'c1',
      {
        serviceTypes: [
          {
            id: 'st1',
            nameUz: 'Dorilar',
            nameRu: null,
            behavior: 'DIRECT_SALE',
            color: '#7c3aed',
            sortOrder: 0,
            active: true,
            createdAt: T0,
            updatedAt: T1,
          },
          { id: 'st2', nameUz: 'X', behavior: 'MAGIC', active: true, createdAt: T0, updatedAt: T1 },
        ],
        staffTypes: [
          {
            id: 'sf1',
            nameUz: 'Farrosh',
            nameRu: null,
            access: 'NONE',
            active: true,
            createdAt: T0,
            updatedAt: T1,
          },
        ],
        users: [user({ id: 'u9', phone: '90 777 66 55', role: 'STAFF', staffTypeId: 'sf1' })],
        services: [service({ id: 's9', code: 'CREAM', kind: 'DIRECT_SALE', serviceTypeId: 'st1' })],
      },
      NOW,
    );
    assert.deepEqual(
      r.rejected.map((x) => [x.entity, x.id, x.reason]),
      [['serviceTypes', 'st2', 'invalid']],
    );
    assert.equal((db.rows.users.get('u9')?.row as { staffTypeId: string }).staffTypeId, 'sf1');
    assert.equal(
      (db.rows.services.get('s9')?.row as { serviceTypeId: string }).serviceTypeId,
      'st1',
    );
  });

  it('keeps a service’s fiscal codes (v2.6); a bad code is dropped, not the row', async () => {
    const r = await applyPush(
      db,
      'c1',
      {
        services: [
          service({ id: 'sm1', code: 'MX1', mxik: '10902001034000000', packageCode: '1321927' }),
          service({ id: 'sm2', code: 'MX2', mxik: '1090-junk', packageCode: 'abc' }),
          service({ id: 'sm3', code: 'MX3' }),
          service({ id: 'sm4', code: 'MX4', mxik: '1'.repeat(400), packageCode: 1321927 }),
        ],
      },
      NOW,
    );
    assert.deepEqual(r.rejected, []);
    const row = (id: string) =>
      db.rows.services.get(id)?.row as { mxik: string | null; packageCode: string | null };
    assert.deepEqual([row('sm1').mxik, row('sm1').packageCode], ['10902001034000000', '1321927']);
    assert.deepEqual([row('sm2').mxik, row('sm2').packageCode], [null, null]);
    assert.deepEqual([row('sm3').mxik, row('sm3').packageCode], [null, null]);
    assert.deepEqual(
      [row('sm4').mxik, row('sm4').packageCode],
      [null, null],
      'too long / not a string',
    );
  });

  it('accepts a NURSE login', async () => {
    const r = await applyPush(
      db,
      'c1',
      { users: [user({ id: 'n1', phone: '90 999 88 77', role: 'NURSE' })] },
      NOW,
    );
    assert.deepEqual(r.rejected, []);
  });
});

describe('applyPush: stock and money rows (till v2.10)', () => {
  let db: FakeDb;
  beforeEach(() => {
    db = new FakeDb();
  });

  const product = (over: Record<string, unknown> = {}) => ({
    id: 'pr1',
    name: 'Shpris 5 ml',
    category: 'TREATMENT',
    unit: 'dona',
    barcode: null,
    minQty: 10,
    qtyOnHand: -2,
    avgCost: 1200.5,
    serviceId: null,
    active: true,
    createdAt: T0,
    updatedAt: T1,
    ...over,
  });
  const movement = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    productId: 'pr1',
    type: 'TREATMENT',
    qty: -1.5,
    unitCost: 1200.5,
    receiptId: null,
    itemId: 'i1',
    sessionId: null,
    note: '',
    createdById: 'u1',
    createdAt: T1,
    updatedAt: T1,
    ...over,
  });
  const payment = (over: Record<string, unknown> = {}) => ({
    id: 'pay1',
    appointmentId: 'a1',
    method: 'CASH',
    amount: 100000,
    createdById: 'u1',
    createdAt: T1,
    updatedAt: T1,
    ...over,
  });

  it('accepts products, deliveries, movements, expenses and payments', async () => {
    const r = await applyPush(
      db,
      'c1',
      {
        ...fullBatch(),
        products: [product()],
        stockReceipts: [
          {
            id: 'r1',
            number: 'K-000001',
            supplier: 'Farm',
            docNo: null,
            receivedAt: T1,
            total: 12005,
            paidFrom: 'DRAWER',
            note: '',
            createdById: 'u1',
            voidedAt: null,
            voidedById: null,
            createdAt: T1,
            updatedAt: T1,
          },
        ],
        stockMovements: [movement()],
        expenses: [
          {
            id: 'e1',
            category: 'RENT',
            amount: 3000000,
            spentAt: T1,
            note: 'Noyabr',
            paidFrom: 'OUTSIDE',
            createdById: 'u1',
            voidedAt: null,
            voidedById: null,
            createdAt: T1,
            updatedAt: T1,
          },
        ],
        payments: [payment()],
      },
      NOW,
    );
    assert.deepEqual(r.rejected, []);
    assert.equal(r.written, 10);
    const m = db.rows.stockMovements.get('m1')?.row as RowMap['stockMovements'];
    assert.equal(m.qty, -1.5, 'out movements keep their minus');
    const p = db.rows.products.get('pr1')?.row as RowMap['products'];
    assert.equal(p.qtyOnHand, -2, 'stock below zero is kept as the till has it');
  });

  it('keeps a movement / payment that arrives before its product / visit; rejects bad rows', async () => {
    const r = await applyPush(
      db,
      'c1',
      {
        products: [product({ id: 'bad', category: 'FOOD' })],
        stockMovements: [movement({ productId: 'nope' })],
        payments: [payment({ appointmentId: 'nope' }), payment({ id: 'pay2', method: 'BITCOIN' })],
      },
      NOW,
    );
    assert.deepEqual(
      r.rejected.map((x) => [x.entity, x.id, x.reason]),
      [
        ['products', 'bad', 'invalid'],
        ['payments', 'pay2', 'invalid'],
      ],
    );
    // A sale made while a sync ran: its movement and payment are kept, never lost.
    assert.ok(db.rows.stockMovements.has('m1'));
    assert.ok(db.rows.payments.has('pay1'));
    assert.equal(r.accepted.stockMovements, 1);
    assert.equal(r.accepted.payments, 1);
  });

  it('never writes into another clinic’s product', async () => {
    await applyPush(db, 'c1', { products: [product()] }, NOW);
    const r = await applyPush(db, 'c2', { products: [product({ updatedAt: T2 })] }, NOW);
    assert.deepEqual(
      r.rejected.map((x) => x.reason),
      ['foreign_id'],
    );
  });
});

describe('batchError', () => {
  it('caps each array at 200 rows', () => {
    assert.equal(batchError({ patients: new Array(200).fill({}) }), null);
    assert.equal(batchError({ patients: new Array(201).fill({}) }), 'patients');
    assert.equal(batchError({ users: 'x' }), 'users');
  });
});
