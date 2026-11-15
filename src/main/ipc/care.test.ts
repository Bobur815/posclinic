import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type {
  AppointmentDto,
  CaseDetailDto,
  DoctorDto,
  OpenCaseDto,
  PatientDto,
  QueueItemDto,
} from '../../shared/clinic';
import { useDatabaseClient } from '../database/sqlite-client';
import { createTestDb, type TestDb } from '../test-utils/db';
import { setupIpcHandlers } from './handlers';
import {
  type Actor,
  clearHandlers,
  configureHandlers,
  type HandlerContext,
  invokeHandler,
  writtenEntities,
} from './ipc-safe';

/**
 * The doctor's side (v2.5, P3): doctor logins, the doctor's queue, reception's overview, the
 * case page, vitals, referrals back to reception, and what each role may do.
 */

let t: TestDb;
const mk = (role: string, id: string, phone: string): Actor => ({
  id,
  fullName: role,
  phone,
  email: null,
  role,
  clinicId: null,
});
const admin = mk('CLINIC_ADMIN', 'admin-1', '+998900000001');
const desk = mk('RECEPTIONIST', 'desk-1', '+998900000002');
let drA: Actor;
let drB: Actor;
const as =
  (a: Actor) =>
  <R>(channel: string, ...args: unknown[]) =>
    invokeHandler(
      channel,
      { actor: a, setActor: () => undefined, terminalId: 'T1' } as HandlerContext,
      args,
    ) as Promise<R>;
const refusedWith = (p: Promise<unknown>, key: string) =>
  assert.rejects(p, (e: Error) => e.message === key);

let patient: PatientDto;
let visit: AppointmentDto;

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
  await t.db.doctor.createMany({
    data: [
      { id: 'dA', fullName: 'Dr A' },
      { id: 'dB', fullName: 'Dr B' },
    ],
  });
  await t.db.service.createMany({
    data: [
      {
        id: 's-cons',
        code: 'PAR-CONS',
        name: 'Konsultatsiya',
        price: 150000,
        kind: 'CONSULTATION',
      },
      {
        id: 's-op',
        code: 'PAR-OP',
        name: 'Najas',
        price: 80000,
        kind: 'ANALYSIS',
        resultType: 'QUALITATIVE',
      },
      { id: 's-enema', code: 'PAR-ENEMA', name: 'Huqna', price: 50000, kind: 'PROCEDURE' },
    ],
  });
  patient = await as(desk)<PatientDto>('patients:create', {
    fullName: 'Aziz Karimov',
    phone: '+998901234567',
    allergies: '',
  });
});

after(async () => {
  await t.close();
});

describe('doctor logins (Doctors page)', () => {
  it('an admin gives a doctor a login; nobody else can, and a phone is used once', async () => {
    await refusedWith(
      as(desk)('doctors:createLogin', 'dA', { phone: '+998911111111', password: 'secret1' }),
      'errors.forbidden',
    );
    const d = await as(admin)<DoctorDto>('doctors:createLogin', 'dA', {
      phone: '91 111 11 11',
      password: 'secret1',
    });
    assert.equal(d.user?.phone, '+998911111111');
    const u = await t.db.user.findUnique({ where: { phone: '+998911111111' } });
    assert.equal(u?.role, 'DOCTOR');
    drA = mk('DOCTOR', u?.id as string, '+998911111111');

    await refusedWith(
      as(admin)('doctors:createLogin', 'dA', { phone: '+998922222222', password: 'secret1' }),
      'errors.loginExists',
    );
    await refusedWith(
      as(admin)('doctors:createLogin', 'dB', { phone: '+998911111111', password: 'secret1' }),
      'errors.phoneTaken',
    );
    await refusedWith(
      as(admin)('doctors:createLogin', 'dB', { phone: '+998922222222', password: '123' }),
      'errors.passwordTooShort',
    );
    await as(admin)('doctors:createLogin', 'dB', { phone: '+998922222222', password: 'secret1' });
    const ub = await t.db.user.findUnique({ where: { phone: '+998922222222' } });
    drB = mk('DOCTOR', ub?.id as string, '+998922222222');

    const list = await as(admin)<DoctorDto[]>('doctors:getAll');
    assert.ok(list.every((x) => x.user?.phone && !('password' in (x.user as object))));
  });
});

describe('the doctor’s queue', () => {
  it('a doctor never registers or takes money', async () => {
    await refusedWith(
      as(drA)('appointments:create', {
        patientId: patient.id,
        items: [{ serviceId: 's-cons', quantity: 1, doctorId: 'dA' }],
      }),
      'errors.receptionOnly',
    );
    await refusedWith(
      as(drA)('patients:create', { fullName: 'X', phone: '+998933333333' }),
      'errors.receptionOnly',
    );
  });

  it('shows a consultation only once it is paid, and only to its doctor', async () => {
    visit = await as(desk)<AppointmentDto>('appointments:create', {
      patientId: patient.id,
      items: [{ serviceId: 's-cons', quantity: 1, doctorId: 'dA' }],
    });
    assert.equal((await as(drA)<QueueItemDto[]>('queue:listMine')).length, 0);
    await refusedWith(
      as(drA)('appointments:checkout', visit.id, { paymentMethod: 'CASH', amount: 150000 }),
      'errors.receptionOnly',
    );
    await as(desk)('appointments:checkout', visit.id, { paymentMethod: 'CASH', amount: 150000 });

    const mine = await as(drA)<QueueItemDto[]>('queue:listMine');
    assert.equal(mine.length, 1);
    assert.equal(mine[0].appointment.patient.fullName, 'Aziz Karimov');
    assert.equal(mine[0].appointment.case?.status, 'WAITING_DOCTOR');
    assert.equal((await as(drB)<QueueItemDto[]>('queue:listMine')).length, 0);
    const board = await as(desk)<QueueItemDto[]>('queue:listOverview');
    assert.deepEqual(
      board.map((i) => i.doctor?.fullName),
      ['Dr A'],
    );
  });

  it('only the line’s doctor takes and finishes it; finishing completes the order', async () => {
    const [item] = await as(drA)<QueueItemDto[]>('queue:listMine');
    await refusedWith(as(drB)('queue:start', item.id), 'errors.forbidden');
    await as(drA)('queue:start', item.id);
    assert.equal((await as(drA)<QueueItemDto[]>('queue:listMine'))[0].status, 'IN_PROGRESS');
    await as(drA)('queue:finish', item.id);
    assert.equal((await as(drA)<QueueItemDto[]>('queue:listMine')).length, 0);
    const order = await t.db.appointment.findUnique({ where: { id: visit.id } });
    assert.equal(order?.status, 'COMPLETED');
    const c = await t.db.clinicalCase.findUnique({ where: { id: visit.caseId as string } });
    assert.equal(c?.status, 'OPEN');
    await refusedWith(as(drA)('queue:finish', item.id), 'errors.alreadyDone');
  });
});

describe('the case page', () => {
  it('records vitals, diagnosis and referrals that wait at reception', async () => {
    const caseId = visit.caseId as string;
    await refusedWith(
      as(drA)('cases:recordVitals', { patientId: patient.id, caseId, heightCm: 900 }),
      'errors.invalidVitals',
    );
    await as(drA)('cases:recordVitals', {
      patientId: patient.id,
      caseId,
      heightCm: 172,
      weightKg: 68.5,
      temperature: 36.7,
    });
    await as(drA)('cases:update', caseId, { complaint: 'Qorin og‘rig‘i', diagnosis: 'Lyambliya?' });
    await refusedWith(as(desk)('cases:update', caseId, { diagnosis: 'x' }), 'errors.forbidden');

    await as(drA)('cases:addReferral', caseId, { serviceId: 's-op', instructions: 'Ertalab' });
    await refusedWith(
      as(drA)('cases:addReferral', caseId, { serviceId: 's-cons' }),
      'errors.referralKind',
    );
    const course = await as(drA)<{ id: string; quantity: number }>('cases:addReferral', caseId, {
      serviceId: 's-enema',
      perDay: 2,
      days: 5,
      instructions: '5 kun, kuniga 2 marta',
    });
    assert.equal(course.quantity, 10);

    const page = await as(drA)<CaseDetailDto>('cases:get', caseId);
    assert.equal(page.status, 'WAITING_ANALYSIS');
    assert.equal(page.diagnosis, 'Lyambliya?');
    assert.equal(page.latestVitals?.weightKg, 68.5);
    assert.equal(page.referrals.length, 2);
    assert.equal(page.appointments[0].items[0].status, 'DONE');

    const atDesk = await as(desk)<OpenCaseDto[]>('cases:forPatient', patient.id);
    assert.deepEqual(
      atDesk[0].referrals.map((r) => [r.service.kind, r.remaining]),
      [
        ['ANALYSIS', 1],
        ['PROCEDURE', 10],
      ],
    );

    await as(drA)('cases:cancelReferral', course.id);
    assert.equal(
      (await as(desk)<OpenCaseDto[]>('cases:forPatient', patient.id))[0].referrals.length,
      1,
    );
  });

  it('a doctor edits medical fields only; name and phone stay', async () => {
    const u = await as(drA)<PatientDto>('patients:update', patient.id, {
      fullName: 'Changed',
      phone: '+998999999999',
      allergies: 'Penitsillin',
      chronicConditions: 'Gastrit',
    });
    assert.deepEqual(
      [u.fullName, u.phone, u.allergies, u.chronicConditions],
      ['Aziz Karimov', '+998901234567', 'Penitsillin', 'Gastrit'],
    );
  });

  it('closes and reopens a case', async () => {
    const caseId = visit.caseId as string;
    await as(drA)('cases:update', caseId, { close: true });
    assert.equal((await as(drA)<CaseDetailDto>('cases:get', caseId)).status, 'CLOSED');
    assert.equal((await as(desk)<OpenCaseDto[]>('cases:forPatient', patient.id)).length, 0);
    await as(drA)('cases:update', caseId, { reopen: true });
    assert.equal((await as(drA)<CaseDetailDto>('cases:get', caseId)).status, 'WAITING_ANALYSIS');
  });
});

describe('live updates', () => {
  it('reads announce nothing; clinical writes announce cases + appointments', () => {
    for (const ch of [
      'queue:listMine',
      'queue:listOverview',
      'cases:get',
      'cases:forPatient',
      'appointments:quote',
    ]) {
      assert.deepEqual(writtenEntities(ch), [], ch);
    }
    assert.deepEqual(writtenEntities('queue:finish'), ['cases', 'appointments']);
    assert.deepEqual(writtenEntities('cases:addReferral'), ['cases', 'appointments']);
    assert.deepEqual(writtenEntities('appointments:create'), ['appointments', 'cases']);
    assert.deepEqual(writtenEntities('doctors:createLogin'), ['doctors']);
  });
});
