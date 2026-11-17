import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ShiftCloseResultDto, ShiftDto, ShiftSummaryDto } from '../../shared/clinic';
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

/** Cash shifts (v2.6, SavdoChef's smena): the drawer, payments inside a shift, close and count. */

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
const nurse = mk('NURSE', 'nurse-1', '+998900000003');
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

let n = 0;
async function visit(total: number): Promise<string> {
  n += 1;
  const p = await t.db.patient.create({
    data: { patientCode: `P-${n}`, fullName: `Patient ${n}`, phone: `+99890100000${n}` },
  });
  const a = await t.db.appointment.create({
    data: {
      appointmentNumber: `A-${n}`,
      patientId: p.id,
      appointmentDate: new Date(),
      totalAmount: total,
    },
  });
  return a.id;
}

before(async () => {
  t = await createTestDb();
  useDatabaseClient(t.db);
  clearHandlers();
  setupIpcHandlers();
  configureHandlers({ gate: async () => null, onWrite: () => undefined, emit: () => undefined });
  for (const u of [admin, desk, nurse]) {
    await t.db.user.create({
      data: { id: u.id, phone: u.phone, password: 'x', role: u.role, fullName: u.fullName },
    });
  }
});

after(async () => {
  useDatabaseClient(null);
  await t.close();
});

describe('cash shifts', () => {
  let shift: ShiftDto;

  it('refuses a payment while no shift is open', async () => {
    const id = await visit(100_000);
    await refusedWith(
      as(desk)('appointments:checkout', id, { paymentMethod: 'CASH', amount: 100_000 }),
      'errors.noOpenShift',
    );
    const row = await t.db.appointment.findUniqueOrThrow({ where: { id } });
    assert.equal(Number(row.paidAmount), 0);
  });

  it('only reception and admins open a shift; one at a time', async () => {
    await refusedWith(as(nurse)('shifts:open', { openingCash: 0 }), 'errors.receptionOnly');
    shift = await as(desk)<ShiftDto>('shifts:open', { openingCash: 50_000 });
    assert.equal(shift.status, 'OPEN');
    assert.equal(shift.openingCash, 50_000);
    assert.equal(shift.openedBy, 'RECEPTIONIST');
    await refusedWith(as(admin)('shifts:open', { openingCash: 0 }), 'errors.shiftAlreadyOpen');
    assert.equal((await as(nurse)<ShiftDto | null>('shifts:getOpen'))?.id, shift.id);
  });

  it('records each payment in the shift, without the change', async () => {
    const a = await visit(120_000);
    // 150 000 handed over for 120 000: 30 000 change goes back, 120 000 stays.
    await as(desk)('appointments:checkout', a, { paymentMethod: 'CASH', amount: 150_000 });
    const b = await visit(200_000);
    await as(desk)('appointments:checkout', b, { paymentMethod: 'CARD', amount: 80_000 });
    await as(desk)('appointments:checkout', b, { paymentMethod: 'CASH', amount: 120_000 });
    const rows = await t.db.payment.findMany({ orderBy: { createdAt: 'asc' } });
    assert.deepEqual(
      rows.map((r) => [r.method, Number(r.amount), r.shiftId, r.createdById]),
      [
        ['CASH', 120_000, shift.id, desk.id],
        ['CARD', 80_000, shift.id, desk.id],
        ['CASH', 120_000, shift.id, desk.id],
      ],
    );
    await refusedWith(
      as(desk)('appointments:checkout', b, { paymentMethod: 'BITCOIN', amount: 1 }),
      'errors.invalidInput',
    );
  });

  it('counts the drawer: opening + cash + in - out; a payout above it is refused', async () => {
    await as(desk)('shifts:addCashMovement', { type: 'PAY_IN', amount: 10_000, note: 'change' });
    await as(desk)('shifts:addCashMovement', { type: 'PAY_OUT', amount: 5_000, note: 'water' });
    await refusedWith(
      as(desk)('shifts:addCashMovement', { type: 'PAY_OUT', amount: 10_000_000 }),
      'errors.payOutExceedsCash',
    );
    await refusedWith(
      as(desk)('shifts:addCashMovement', { type: 'PAY_IN', amount: -5 }),
      'errors.invalidAmount',
    );
    const s = await as(desk)<ShiftSummaryDto>('shifts:summary', shift.id);
    assert.equal(s.sales.CASH, 240_000);
    assert.equal(s.sales.CARD, 80_000);
    assert.equal(s.salesTotal, 320_000);
    assert.equal(s.visits, 2);
    assert.equal(s.payIn, 10_000);
    assert.equal(s.payOut, 5_000);
    assert.equal(s.expectedCash, 50_000 + 240_000 + 10_000 - 5_000);
    assert.equal(s.movements.length, 2);
    await refusedWith(as(nurse)('shifts:summary', shift.id), 'errors.receptionOnly');
  });

  it('closes with the counted cash and freezes the expected figure', async () => {
    const r = await as(desk)<ShiftCloseResultDto>('shifts:close', {
      shiftId: shift.id,
      countedCash: 290_000,
    });
    assert.equal(r.shift.status, 'CLOSED');
    assert.equal(r.shift.expectedCash, 295_000);
    assert.equal(r.shift.countedCash, 290_000);
    assert.equal(r.shift.difference, -5_000);
    await refusedWith(
      as(desk)('shifts:close', { shiftId: shift.id, countedCash: 0 }),
      'errors.shiftClosed',
    );
    assert.equal(await as(desk)('shifts:getOpen'), null);
    // A new shift can open now (the open guard is released).
    const next = await as(desk)<ShiftDto>('shifts:open', {});
    assert.equal(next.openingCash, 0);
    const list = await as(desk)<ShiftDto[]>('shifts:list');
    assert.deepEqual(
      list.map((s) => s.status),
      ['OPEN', 'CLOSED'],
    );
  });

  it('deletes only an empty shift, and only an admin', async () => {
    const open = (await as(desk)<ShiftDto | null>('shifts:getOpen'))!;
    await refusedWith(as(desk)('shifts:delete', open.id), 'errors.forbidden');
    await refusedWith(as(admin)('shifts:delete', shift.id), 'errors.shiftNotEmpty');
    assert.equal(await as(admin)('shifts:delete', open.id), true);
    assert.equal(await as(desk)('shifts:getOpen'), null);
  });

  it('announces shift changes', () => {
    assert.deepEqual(writtenEntities('shifts:open'), ['shifts']);
    assert.deepEqual(writtenEntities('shifts:summary'), []);
    assert.deepEqual(writtenEntities('appointments:checkout'), ['appointments', 'cases', 'shifts']);
  });
});
