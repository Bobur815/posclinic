import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type {
  AppointmentDto,
  CaseDetailDto,
  LabQueueDto,
  PatientDto,
  ResultsReadyDto,
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
} from './ipc-safe';

/** Lab and procedures (v2.5, P4): sample → result → doctor confirms; course sessions ticked. */

let t: TestDb;
const mk = (role: string, id: string, phone: string): Actor => ({
  id,
  fullName: role,
  phone,
  email: null,
  role,
  clinicId: null,
});
const desk = mk('RECEPTIONIST', 'desk-1', '+998900000002');
const nurse = mk('NURSE', 'nurse-1', '+998900000003');
const dr = mk('DOCTOR', 'dr-user', '+998900000004');
const other = mk('DOCTOR', 'dr2-user', '+998900000005');
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
let caseId: string;

before(async () => {
  t = await createTestDb();
  useDatabaseClient(t.db);
  clearHandlers();
  setupIpcHandlers();
  configureHandlers({ gate: async () => null, onWrite: () => undefined, emit: () => undefined });
  const hash = await bcrypt.hash('secret1', 4);
  for (const u of [desk, nurse, dr, other]) {
    await t.db.user.create({
      data: { id: u.id, phone: u.phone, password: hash, role: u.role, fullName: u.fullName },
    });
  }
  await t.db.doctor.create({ data: { id: 'd1', fullName: 'Dr', userId: dr.id } });
  await t.db.doctor.create({ data: { id: 'd2', fullName: 'Dr 2', userId: other.id } });
  await t.db.service.createMany({
    data: [
      { id: 's-cons', code: 'C', name: 'Konsultatsiya', price: 100, kind: 'CONSULTATION' },
      {
        id: 's-op',
        code: 'OP',
        name: 'Najas',
        price: 80,
        kind: 'ANALYSIS',
        resultType: 'QUALITATIVE',
      },
      {
        id: 's-gia',
        code: 'GIA',
        name: 'IFA Lyambliya',
        price: 90,
        kind: 'ANALYSIS',
        resultType: 'QUANTITATIVE',
        resultUnit: 'titr',
      },
      { id: 's-enema', code: 'EN', name: 'Huqna', price: 50, kind: 'PROCEDURE' },
    ],
  });
  patient = await as(desk)<PatientDto>('patients:create', {
    fullName: 'Bemor',
    phone: '+998901112233',
  });
  const v = await as(desk)<AppointmentDto>('appointments:create', {
    patientId: patient.id,
    items: [{ serviceId: 's-cons', quantity: 1, doctorId: 'd1' }],
  });
  caseId = v.caseId as string;
  await as(desk)('appointments:checkout', v.id, { paymentMethod: 'CASH', amount: 100 });
  await as(dr)('queue:finish', v.items[0].id);
});

after(async () => {
  await t.close();
});

describe('analyses', () => {
  let order: AppointmentDto;

  it('reaches the lab only when paid; sample, then a result shaped by its type', async () => {
    order = await as(desk)<AppointmentDto>('appointments:create', {
      patientId: patient.id,
      caseId,
      items: [
        { serviceId: 's-op', quantity: 1 },
        { serviceId: 's-gia', quantity: 1 },
      ],
    });
    assert.equal((await as(nurse)<LabQueueDto>('queue:listLab')).analyses.length, 0);
    await refusedWith(as(nurse)('results:sampleTaken', order.items[0].id), 'errors.notPaid');
    await as(desk)('appointments:checkout', order.id, { paymentMethod: 'CASH', amount: 170 });
    const lab = await as(nurse)<LabQueueDto>('queue:listLab');
    assert.equal(lab.analyses.length, 2);

    const [op, gia] = order.items;
    await as(nurse)('results:sampleTaken', op.id);
    assert.equal(
      (await t.db.appointmentItem.findUnique({ where: { id: op.id } }))?.status,
      'IN_PROGRESS',
    );
    await refusedWith(
      as(nurse)('results:save', op.id, { outcome: 'MAYBE' }),
      'errors.invalidResult',
    );
    await as(nurse)('results:save', op.id, { outcome: 'POSITIVE', finding: 'Giardia lamblia' });
    await refusedWith(as(nurse)('results:save', gia.id, { value: '' }), 'errors.invalidResult');
    await as(nurse)('results:save', gia.id, {
      value: 200,
      comment: '1:200',
    });

    const after = await t.db.appointment.findUnique({ where: { id: order.id } });
    assert.equal(after?.status, 'COMPLETED');
    const c = await as(dr)<CaseDetailDto>('cases:get', caseId);
    assert.equal(c.status, 'RESULT_READY');
    const gr = c.analysisResults.find((r) => r.serviceId === 's-gia');
    assert.deepEqual([gr?.value, gr?.unit], [200, 'titr']);
  });

  it('the case doctor sees results ready and confirms them', async () => {
    const ready = await as(dr)<ResultsReadyDto[]>('queue:listResultsReady');
    assert.equal(ready.length, 1);
    assert.equal(ready[0].analysisResults.length, 2);
    assert.equal((await as(other)<ResultsReadyDto[]>('queue:listResultsReady')).length, 0);

    const [r1, r2] = ready[0].analysisResults;
    await refusedWith(as(nurse)('results:confirm', r1.id), 'errors.forbidden');
    await refusedWith(as(other)('results:confirm', r1.id), 'errors.notYourPatient');
    await as(dr)('results:confirm', r1.id);
    await as(dr)('results:confirm', r2.id);
    await refusedWith(
      as(nurse)('results:save', order.items[0].id, { outcome: 'NEGATIVE' }),
      'errors.resultConfirmed',
    );
    assert.equal((await as(dr)<CaseDetailDto>('cases:get', caseId)).status, 'OPEN');
  });
});

describe('course sessions', () => {
  it('ticks sessions due today; the last one finishes the course; undo is for today only', async () => {
    const ref = await as(dr)<{ id: string }>('cases:addReferral', caseId, {
      serviceId: 's-enema',
      perDay: 2,
      days: 2,
    });
    assert.equal((await as(dr)<CaseDetailDto>('cases:get', caseId)).status, 'ON_TREATMENT');
    const course = await as(desk)<AppointmentDto>('appointments:create', {
      patientId: patient.id,
      items: [{ serviceId: 's-enema', quantity: 4, referralId: ref.id, fullCourse: true }],
    });
    await as(desk)('appointments:checkout', course.id, { paymentMethod: 'CASH', amount: 200 });

    // Day 1: two sessions due; days 2's two are not shown yet.
    const today = (await as(nurse)<LabQueueDto>('queue:listLab')).sessions;
    assert.deepEqual(
      today.map((s) => s.number),
      [1, 2],
    );
    await as(nurse)('sessions:tick', today[0].id);
    await refusedWith(as(nurse)('sessions:tick', today[0].id), 'errors.alreadyDone');
    await as(nurse)('sessions:tick', today[0].id, true); // undo
    await as(nurse)('sessions:tick', today[0].id);
    await as(nurse)('sessions:tick', today[1].id);

    // Day 2 arrives: the remaining two; the last tick finishes the line and the case.
    await t.db.treatmentSession.updateMany({
      where: { item: { appointmentId: course.id }, doneAt: null },
      data: { plannedDate: new Date() },
    });
    const day2 = (await as(nurse)<LabQueueDto>('queue:listLab')).sessions;
    assert.equal(day2.length, 2);
    assert.equal(day2[0].item._count.sessions, 2);
    for (const s of day2) await as(nurse)('sessions:tick', s.id);
    const line = await t.db.appointmentItem.findFirst({ where: { appointmentId: course.id } });
    assert.equal(line?.status, 'DONE');
    assert.equal(
      (await t.db.appointment.findUnique({ where: { id: course.id } }))?.status,
      'COMPLETED',
    );
    assert.equal((await as(dr)<CaseDetailDto>('cases:get', caseId)).status, 'OPEN');

    // An old tick cannot be undone.
    await t.db.treatmentSession.update({
      where: { id: day2[0].id },
      data: { doneAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) },
    });
    await refusedWith(as(nurse)('sessions:tick', day2[0].id, true), 'errors.cannotUndo');
  });
});
