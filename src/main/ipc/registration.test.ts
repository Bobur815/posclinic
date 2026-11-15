import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type { AppointmentDto, OpenCaseDto, PatientDto, QuoteDto } from '../../shared/clinic';
import { priceLines, sessionPlan, type PricingFacts } from '../clinic/pricing';
import { resetApprovalThrottle } from '../clinic/register-order';
import { useDatabaseClient } from '../database/sqlite-client';
import { createTestDb, type TestDb } from '../test-utils/db';
import { setupIpcHandlers } from './handlers';
import {
  type Actor,
  clearHandlers,
  configureHandlers,
  type HandlerContext,
  invokeHandler,
} from './ipc-safe';

/**
 * Reception flow (v2.5): register services in a case, free follow-up within 14 days, doctor's
 * referrals, courses (sessions, discount, admin approval), quotes, open cases, patient search.
 */

let t: TestDb;
const actor = (role: string, id: string, phone: string): Actor => ({
  id,
  fullName: role,
  phone,
  email: null,
  role,
  clinicId: null,
});
const admin = actor('CLINIC_ADMIN', 'admin-1', '+998900000001');
const desk = actor('RECEPTIONIST', 'desk-1', '+998900000002');
const ctxOf = (a: Actor): HandlerContext => ({
  actor: a,
  setActor: () => undefined,
  terminalId: 'T1',
});
const as =
  (a: Actor) =>
  <R>(channel: string, ...args: unknown[]) =>
    invokeHandler(channel, ctxOf(a), args) as Promise<R>;
const call = as(desk);
const refusedWith = (p: Promise<unknown>, key: string) =>
  assert.rejects(p, (e: Error) => e.message === key);

const ids = { cons: 's-cons', follow: 's-follow', stool: 's-stool', enema: 's-enema' };
let doctorId: string;
let patient: PatientDto;
let other: PatientDto;

before(async () => {
  t = await createTestDb();
  useDatabaseClient(t.db);
  clearHandlers();
  setupIpcHandlers();
  configureHandlers({ gate: async () => null, onWrite: () => undefined, emit: () => undefined });
  const hash = await bcrypt.hash('secret1', 4);
  for (const u of [admin, desk]) {
    await t.db.user.create({
      data: { id: u.id, phone: u.phone, password: hash, role: u.role, fullName: u.fullName },
    });
  }
  doctorId = (await t.db.doctor.create({ data: { id: 'd1', fullName: 'Dr Aliyev' } })).id;
  await t.db.service.createMany({
    data: [
      {
        id: ids.cons,
        code: 'PAR-CONS',
        name: 'Konsultatsiya',
        price: 150000,
        kind: 'CONSULTATION',
      },
      {
        id: ids.follow,
        code: 'PAR-CONS2',
        name: 'Takroriy',
        price: 100000,
        kind: 'CONSULTATION',
        isFollowUp: true,
      },
      {
        id: ids.stool,
        code: 'PAR-OP',
        name: 'Najas tahlili',
        price: 80000,
        kind: 'ANALYSIS',
        resultType: 'QUALITATIVE',
      },
      { id: ids.enema, code: 'PAR-ENEMA', name: 'Huqna', price: 50000, kind: 'PROCEDURE' },
    ],
  });
  await t.db.patient.create({
    data: {
      id: 'p1',
      patientCode: 'P-1',
      fullName: 'Aziz Karimov',
      phone: '+998901234567',
      regionCode: null,
    },
  });
  await t.db.patient.create({
    data: { id: 'p2', patientCode: 'P-2', fullName: 'Boshqa', phone: '+998907654321' },
  });
  patient = (await t.db.patient.findUnique({ where: { id: 'p1' } })) as unknown as PatientDto;
  other = (await t.db.patient.findUnique({ where: { id: 'p2' } })) as unknown as PatientDto;
});

after(async () => {
  await t.close();
});

describe('pricing rules (pure)', () => {
  const facts = (over: Partial<PricingFacts> = {}): PricingFacts => ({
    services: new Map([
      [
        ids.cons,
        { id: ids.cons, name: 'K', price: 150000, kind: 'CONSULTATION', isFollowUp: false },
      ],
      [
        ids.follow,
        { id: ids.follow, name: 'T', price: 100000, kind: 'CONSULTATION', isFollowUp: true },
      ],
      [ids.enema, { id: ids.enema, name: 'H', price: 50000, kind: 'PROCEDURE', isFollowUp: false }],
    ]),
    referrals: new Map([
      ['r1', { id: 'r1', serviceId: ids.enema, quantity: 10, registeredQty: 0, perDay: 2 }],
    ]),
    doctors: new Set(['d1']),
    followUpIsFree: false,
    maxDiscountPercent: 10,
    adminApproved: false,
    ...over,
  });

  it('needs a doctor for a consultation and none for anything else', () => {
    assert.throws(
      () => priceLines([{ serviceId: ids.cons, quantity: 1 }], facts()),
      /doctorRequired/,
    );
    const [l] = priceLines([{ serviceId: ids.enema, quantity: 1, doctorId: 'd1' }], facts());
    assert.equal(l.doctorId, null);
  });

  it('makes a follow-up free only inside the window', () => {
    const line = [{ serviceId: ids.follow, quantity: 1, doctorId: 'd1' }];
    assert.equal(priceLines(line, facts()).at(0)?.total, 100000);
    assert.equal(priceLines(line, facts({ followUpIsFree: true })).at(0)?.total, 0);
    // A first consultation is never free.
    const first = [{ serviceId: ids.cons, quantity: 1, doctorId: 'd1' }];
    assert.equal(priceLines(first, facts({ followUpIsFree: true })).at(0)?.total, 150000);
  });

  it('discounts only a full course, within the limit unless an admin approved', () => {
    const course = { serviceId: ids.enema, quantity: 10, referralId: 'r1', fullCourse: true };
    const [l] = priceLines([{ ...course, discountPercent: 10 }], facts());
    assert.deepEqual([l.discount, l.total, l.perDay], [50000, 450000, 2]);
    assert.throws(
      () => priceLines([{ ...course, discountPercent: 20 }], facts()),
      /discountNeedsAdmin/,
    );
    assert.equal(
      priceLines([{ ...course, discountPercent: 20 }], facts({ adminApproved: true })).at(0)?.total,
      400000,
    );
    // Per day (2 of 10) is not a full course.
    assert.throws(
      () => priceLines([{ ...course, quantity: 2, discountPercent: 5 }], facts()),
      /discountNotAllowed/,
    );
    // More than the referral has left.
    assert.throws(() => priceLines([{ ...course, quantity: 11 }], facts()), /invalidQuantity/);
  });

  it('plans course sessions per day', () => {
    assert.deepEqual(sessionPlan(5, 2), [0, 0, 1, 1, 2]);
    assert.deepEqual(sessionPlan(3, null), [0, 1, 2]);
  });
});

describe('registration (appointments:create / quote)', () => {
  let firstVisit: AppointmentDto;

  it('opens a case for a new patient journey; the consultation is in the doctor’s order', async () => {
    firstVisit = await call<AppointmentDto>('appointments:create', {
      patientId: patient.id,
      items: [{ serviceId: ids.cons, quantity: 1, doctorId }],
    });
    assert.ok(firstVisit.caseId);
    assert.equal(firstVisit.doctorId, doctorId);
    assert.equal(firstVisit.totalAmount, 150000);
    assert.equal(firstVisit.items[0].status, 'WAITING');
    assert.equal(firstVisit.items[0].doctorId, doctorId);
    const c = await t.db.clinicalCase.findUnique({ where: { id: firstVisit.caseId as string } });
    assert.equal(c?.status, 'WAITING_DOCTOR');
    assert.match(c?.caseNumber ?? '', /^C\d{8}-001$/);
  });

  it('refuses a consultation without a doctor and a case of another patient', async () => {
    await refusedWith(
      call('appointments:create', {
        patientId: patient.id,
        items: [{ serviceId: ids.cons, quantity: 1 }],
      }),
      'errors.doctorRequired',
    );
    await refusedWith(
      call('appointments:create', {
        patientId: other.id,
        caseId: firstVisit.caseId,
        items: [{ serviceId: ids.stool, quantity: 1 }],
      }),
      'errors.caseUnavailable',
    );
  });

  it('a follow-up is charged before the consultation is paid and free after', async () => {
    const follow = {
      patientId: patient.id,
      caseId: firstVisit.caseId,
      items: [{ serviceId: ids.follow, quantity: 1, doctorId }],
    };
    assert.equal((await call<QuoteDto>('appointments:quote', follow)).totalAmount, 100000);
    await call('appointments:checkout', firstVisit.id, { paymentMethod: 'CASH', amount: 150000 });
    const paidVisit = await t.db.appointment.findUnique({ where: { id: firstVisit.id } });
    assert.equal(paidVisit?.status, 'SCHEDULED', 'paying does not complete the visit any more');

    const q = await call<QuoteDto>('appointments:quote', follow);
    assert.deepEqual([q.totalAmount, q.followUpIsFree], [0, true]);
    const before = await t.db.appointment.count();
    await call('appointments:quote', follow);
    assert.equal(await t.db.appointment.count(), before, 'a quote writes nothing');

    const free = await call<AppointmentDto>('appointments:create', follow);
    assert.deepEqual([free.totalAmount, free.paymentStatus], [0, 'PAID']);
    assert.equal(free.caseId, firstVisit.caseId);
  });

  it('a follow-up after 14 days is charged again', async () => {
    await t.db.appointment.update({
      where: { id: firstVisit.id },
      data: { appointmentDate: new Date(Date.now() - 15 * 24 * 3600 * 1000) },
    });
    const q = await call<QuoteDto>('appointments:quote', {
      patientId: patient.id,
      caseId: firstVisit.caseId,
      items: [{ serviceId: ids.follow, quantity: 1, doctorId }],
    });
    assert.equal(q.totalAmount, 100000);
    await t.db.appointment.update({
      where: { id: firstVisit.id },
      data: { appointmentDate: new Date() },
    });
  });

  it('registers a doctor’s course referral per day, then the rest in full with a discount', async () => {
    const r = await t.db.referral.create({
      data: {
        id: 'ref-1',
        caseId: firstVisit.caseId as string,
        patientId: patient.id,
        doctorId,
        serviceId: ids.enema,
        quantity: 10,
        perDay: 2,
        days: 5,
        instructions: '5 kun, kuniga 2 marta',
      },
    });

    const open = await call<OpenCaseDto[]>('cases:forPatient', patient.id);
    assert.equal(open.length, 1);
    assert.equal(open[0].referrals[0].remaining, 10);
    assert.ok(open[0].followUpFreeUntil);

    // Today only: 2 sessions, no discount allowed.
    await refusedWith(
      call('appointments:create', {
        patientId: patient.id,
        items: [{ serviceId: ids.enema, quantity: 2, referralId: r.id, discountPercent: 5 }],
      }),
      'errors.discountNotAllowed',
    );
    const today = await call<AppointmentDto>('appointments:create', {
      patientId: patient.id,
      items: [{ serviceId: ids.enema, quantity: 2, referralId: r.id }],
    });
    assert.equal(today.caseId, firstVisit.caseId, 'a referral continues its own case');
    assert.equal(today.doctorId, null, 'a procedure order has no doctor');
    assert.equal(today.totalAmount, 100000);
    const ref1 = await t.db.referral.findUnique({ where: { id: r.id } });
    assert.deepEqual([ref1?.registeredQty, ref1?.status], [2, 'PARTIAL']);
    const sessions = await t.db.treatmentSession.count({ where: { itemId: today.items[0].id } });
    assert.equal(sessions, 2);

    // The remaining 8 in full: 10 % by the receptionist, 25 % only with an admin's approval.
    const rest = { serviceId: ids.enema, quantity: 8, referralId: r.id, fullCourse: true };
    await refusedWith(
      call('appointments:create', {
        patientId: patient.id,
        caseId: firstVisit.caseId,
        items: [{ ...rest, discountPercent: 25 }],
      }),
      'errors.discountNeedsAdmin',
    );
    await refusedWith(
      call('appointments:create', {
        patientId: patient.id,
        caseId: firstVisit.caseId,
        items: [{ ...rest, discountPercent: 25 }],
        approval: { phone: desk.phone, password: 'secret1' }, // not an admin
      }),
      'errors.approvalFailed',
    );
    // A quote never checks the password (no oracle): it prices as approved and says so.
    const q = await call<QuoteDto>('appointments:quote', {
      patientId: patient.id,
      caseId: firstVisit.caseId,
      items: [{ ...rest, discountPercent: 25 }],
      approval: { phone: admin.phone, password: 'wrong' },
    });
    assert.deepEqual([q.totalAmount, q.needsAdminApproval], [300000, true]);
    const full = await call<AppointmentDto>('appointments:create', {
      patientId: patient.id,
      caseId: firstVisit.caseId,
      items: [{ ...rest, discountPercent: 25 }],
      approval: { phone: admin.phone, password: 'secret1' },
    });
    assert.deepEqual([full.totalAmount, full.discountAmount], [300000, 100000]);
    const planned = await t.db.treatmentSession.findMany({
      where: { itemId: full.items[0].id },
      orderBy: { number: 'asc' },
    });
    assert.equal(planned.length, 8);
    const days = planned.map((s) =>
      Math.round(
        ((s.plannedDate as Date).getTime() - planned[0].plannedDate!.getTime()) / 86400000,
      ),
    );
    assert.deepEqual(days, [0, 0, 1, 1, 2, 2, 3, 3]);
    const ref2 = await t.db.referral.findUnique({ where: { id: r.id } });
    assert.deepEqual([ref2?.registeredQty, ref2?.status], [10, 'REGISTERED']);

    // Fully registered: no longer offered, and cannot be registered again.
    assert.equal(
      (await call<OpenCaseDto[]>('cases:forPatient', patient.id))[0].referrals.length,
      0,
    );
    await refusedWith(
      call('appointments:create', {
        patientId: patient.id,
        items: [{ serviceId: ids.enema, quantity: 1, referralId: r.id }],
      }),
      'errors.referralUnavailable',
    );
  });

  it('a walk-in analysis opens its own case with no doctor', async () => {
    const a = await call<AppointmentDto>('appointments:create', {
      patientId: other.id,
      items: [{ serviceId: ids.stool, quantity: 1 }],
    });
    assert.equal(a.doctorId, null);
    const c = await t.db.clinicalCase.findUnique({ where: { id: a.caseId as string } });
    assert.deepEqual([c?.doctorId, c?.status], [null, 'WAITING_ANALYSIS']);
  });
});

describe('security (review 2026-11-15)', () => {
  it('locks admin approvals after 5 wrong passwords', async () => {
    resetApprovalThrottle();
    const r = await t.db.referral.create({
      data: {
        id: 'ref-lock',
        caseId: (await t.db.clinicalCase.findFirstOrThrow({ where: { patientId: patient.id } })).id,
        patientId: patient.id,
        serviceId: ids.enema,
        quantity: 4,
      },
    });
    const input = {
      patientId: patient.id,
      items: [
        {
          serviceId: ids.enema,
          quantity: 4,
          referralId: r.id,
          fullCourse: true,
          discountPercent: 50,
        },
      ],
      approval: { phone: admin.phone, password: 'guess' },
    };
    for (let i = 0; i < 5; i++)
      await refusedWith(call('appointments:create', input), 'errors.approvalFailed');
    // Locked: even the right password waits.
    await refusedWith(
      call('appointments:create', {
        ...input,
        approval: { phone: admin.phone, password: 'secret1' },
      }),
      'errors.tooManyAttempts',
    );
    resetApprovalThrottle();
    const ok = await call<AppointmentDto>('appointments:create', {
      ...input,
      approval: { phone: admin.phone, password: 'secret1' },
    });
    assert.equal(ok.totalAmount, 100000);
  });

  it('asks the visit limit when a case is really opened, whatever caseId says', async () => {
    let asked = 0;
    configureHandlers({
      openCase: async () => {
        asked++;
        return 'license.limit.monthlyVisits';
      },
    });
    try {
      await assert.rejects(
        call('appointments:create', {
          patientId: other.id,
          caseId: true, // not a case id: must not skip the limit
          items: [{ serviceId: ids.stool, quantity: 1 }],
        }),
        (e: Error) => e.message === 'LICENSE:license.limit.monthlyVisits',
      );
      assert.equal(asked, 1);
      // Inside an existing open case: no new visit, not asked.
      const open = await t.db.clinicalCase.findFirstOrThrow({
        where: { patientId: other.id, status: { not: 'CLOSED' } },
      });
      await call('appointments:create', {
        patientId: other.id,
        caseId: open.id,
        items: [{ serviceId: ids.stool, quantity: 1 }],
      });
      assert.equal(asked, 1);
    } finally {
      configureHandlers({ openCase: async () => null });
    }
  });

  it('refuses a backdated registration', async () => {
    await refusedWith(
      call('appointments:create', {
        patientId: other.id,
        appointmentDate: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
        items: [{ serviceId: ids.stool, quantity: 1 }],
      }),
      'errors.invalidDate',
    );
  });

  it('cancels only an unpaid order, and its referral quantity returns to reception', async () => {
    const r = await t.db.referral.create({
      data: {
        id: 'ref-cancel',
        caseId: (await t.db.clinicalCase.findFirstOrThrow({ where: { patientId: patient.id } })).id,
        patientId: patient.id,
        serviceId: ids.stool,
        quantity: 1,
      },
    });
    const order = await call<AppointmentDto>('appointments:create', {
      patientId: patient.id,
      items: [{ serviceId: ids.stool, quantity: 1, referralId: r.id }],
    });
    assert.equal((await t.db.referral.findUnique({ where: { id: r.id } }))?.status, 'REGISTERED');
    await refusedWith(
      call('appointments:update', order.id, { status: 'COMPLETED' }),
      'errors.forbidden',
    );
    await refusedWith(
      call('appointments:update', order.id, { diagnosis: 'x' }),
      'errors.forbidden',
    );
    await call('appointments:update', order.id, { status: 'CANCELLED' });
    const back = await t.db.referral.findUnique({ where: { id: r.id } });
    assert.deepEqual([back?.registeredQty, back?.status], [0, 'PENDING']);

    const paid = await call<AppointmentDto>('appointments:create', {
      patientId: patient.id,
      items: [{ serviceId: ids.stool, quantity: 1, referralId: r.id }],
    });
    await call('appointments:checkout', paid.id, { paymentMethod: 'CASH', amount: 80000 });
    await refusedWith(
      call('appointments:update', paid.id, { status: 'CANCELLED' }),
      'errors.cannotCancelPaid',
    );
  });
});

describe('patient search (NewAppointmentPage)', () => {
  it('finds by phone digits, and filters by district and visit date', async () => {
    await t.db.adminUnit.createMany({
      data: [
        { code: '1726', type: 'CITY', level: 1, nameUz: 'Toshkent shahri' },
        { code: '1726292', parentCode: '1726', type: 'DISTRICT', level: 2, nameUz: 'Yangihayot' },
      ],
    });
    await t.db.patient.update({
      where: { id: patient.id },
      data: { regionCode: '1726', districtCode: '1726292' },
    });
    const byPhone = await call<PatientDto[]>('patients:search', '90 123 45');
    assert.deepEqual(
      byPhone.map((p) => p.id),
      [patient.id],
    );
    const inDistrict = await call<PatientDto[]>('patients:search', { districtCode: '1726292' });
    assert.deepEqual(
      inDistrict.map((p) => p.id),
      [patient.id],
    );
    const today = new Date().toISOString().slice(0, 10);
    const visited = await call<PatientDto[]>('patients:search', {
      visitedFrom: today,
      visitedTo: today,
    });
    assert.deepEqual(visited.map((p) => p.id).sort(), [patient.id, other.id].sort());
    const none = await call<PatientDto[]>('patients:search', {
      q: 'Boshqa',
      districtCode: '1726292',
    });
    assert.equal(none.length, 0);
  });
});

describe('clinic settings', () => {
  it('only an admin changes them; values are checked', async () => {
    await refusedWith(call('clinic:setSettings', { maxDiscountPercent: 50 }), 'errors.forbidden');
    const s = await as(admin)<{ maxDiscountPercent: number }>('clinic:setSettings', {
      maxDiscountPercent: 15,
    });
    assert.equal(s.maxDiscountPercent, 15);
    await refusedWith(
      as(admin)('clinic:setSettings', { followUpFreeDays: -1 }),
      'errors.invalidSetting',
    );
  });
});
