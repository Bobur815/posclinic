import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FiscalConfigInput, ShiftCloseResultDto, ShiftDto } from '../../shared/clinic';
import { useDatabaseClient } from '../database/sqlite-client';
import { setupIpcHandlers } from '../ipc/handlers';
import {
  type Actor,
  clearHandlers,
  configureHandlers,
  type HandlerContext,
  invokeHandler,
} from '../ipc/ipc-safe';
import { configureShiftHooks } from '../ipc/shift-handlers';
import { plainCipher } from '../lan/config';
import { createTestDb, type TestDb } from '../test-utils/db';
import { type FakeVcr, startFakeVcr } from '../test-utils/fake-vcr';
import { FiscalService } from './fiscal-service';
import { setFiscalService } from './registry';

/**
 * Fiscal receipts end to end on the till: checkout in a shift → PENDING → Receipt.Sale on a fake
 * REGOS:VCR → FISCALIZED, with lost answers, VCR trouble, refusals and the Z-report.
 */

let t: TestDb;
let vcr: FakeVcr;
let fiscal: FiscalService;
const desk: Actor = {
  id: 'desk-1',
  fullName: 'Desk',
  phone: '+998900000002',
  email: null,
  role: 'RECEPTIONIST',
  clinicId: null,
};
const admin: Actor = {
  ...desk,
  id: 'admin-1',
  fullName: 'Admin',
  phone: '+998900000001',
  role: 'CLINIC_ADMIN',
};
const as =
  (a: Actor) =>
  <R>(channel: string, ...args: unknown[]) =>
    invokeHandler(
      channel,
      { actor: a, setActor: () => undefined, terminalId: 'T1' } as HandlerContext,
      args,
    ) as Promise<R>;

const config = (over: Partial<FiscalConfigInput> = {}): FiscalConfigInput => ({
  enabled: true,
  host: '127.0.0.1',
  port: 22298,
  login: 'cassir',
  password: 'pass',
  vatMode: 'nonPayer',
  codes: {
    CONSULTATION: { mxik: '10902001034000000', packageCode: '1321927' },
    ANALYSIS: { mxik: '10902002003000999', packageCode: '1321964' },
    PROCEDURE: { mxik: '10902003035000000', packageCode: '1322001' },
    DIRECT_SALE: { mxik: '', packageCode: '' },
  },
  ...over,
});

let n = 0;
/** A registered visit with one line of `kind` (no case), ready to pay. */
async function visit(price: number, kind = 'CONSULTATION', mxik: string | null = null) {
  n += 1;
  const s = await t.db.service.create({
    data: { code: `S-${n}`, name: `Service ${n}`, price, kind, mxik },
  });
  const p = await t.db.patient.create({
    data: {
      patientCode: `P-${n}`,
      fullName: `Patient ${n}`,
      phone: `+9989010000${String(n).padStart(2, '0')}`,
    },
  });
  const a = await t.db.appointment.create({
    data: {
      appointmentNumber: `A-${n}`,
      patientId: p.id,
      appointmentDate: new Date(),
      totalAmount: price,
      items: {
        create: [
          { serviceId: s.id, serviceName: s.name, quantity: 1, unitPrice: price, total: price },
        ],
      },
    },
  });
  return a.id;
}
const pay = (id: string, amount: number, method = 'CASH') =>
  as(desk)('appointments:checkout', id, { paymentMethod: method, amount });
const fiscalOf = async (id: string) =>
  t.db.appointment.findUniqueOrThrow({
    where: { id },
    select: { fiscalStatus: true, fiscalError: true, fiscalReceiptNo: true, fiscalAttempts: true },
  });

before(async () => {
  t = await createTestDb();
  useDatabaseClient(t.db);
  vcr = await startFakeVcr({ password: 'pass' });
  clearHandlers();
  setupIpcHandlers();
  configureHandlers({ gate: async () => null, onWrite: () => undefined, emit: () => undefined });
  for (const u of [desk, admin]) {
    await t.db.user.create({
      data: { id: u.id, phone: u.phone, password: 'x', role: u.role, fullName: u.fullName },
    });
  }
  fiscal = new FiscalService({
    getDb: () => t.db,
    cipher: plainCipher,
    urlOverride: vcr.url,
    busyRetryMs: [5],
    timeoutMs: 1500,
    onChange: () => undefined,
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  });
  setFiscalService(fiscal);
  configureShiftHooks({
    afterOpen: (id) => fiscal.afterShiftOpen(id),
    afterClose: (id) => fiscal.afterShiftClose(id),
  });
});

after(async () => {
  setFiscalService(null);
  configureShiftHooks({ afterOpen: () => undefined, afterClose: async () => null });
  useDatabaseClient(null);
  await vcr.close();
  await t.close();
});

beforeEach(async () => {
  await fiscal.settled();
});

describe('fiscal receipts (REGOS:VCR)', () => {
  it('stays out of the way while off: a paid visit is never sent', async () => {
    const shift = await as(desk)<ShiftDto>('shifts:open', { openingCash: 0 });
    assert.ok(shift.id);
    const id = await visit(100_000);
    await pay(id, 100_000);
    await fiscal.settled();
    assert.equal((await fiscalOf(id)).fiscalStatus, null);
    assert.equal(vcr.receipts.length, 0);
  });

  it('only an admin sets it up; the password never comes back', async () => {
    await assert.rejects(
      as(desk)('fiscal:setConfig', config()),
      (e: Error) => e.message === 'errors.forbidden',
    );
    await assert.rejects(
      as(admin)('fiscal:setConfig', config({ host: '8.8.8.8' })),
      (e: Error) => e.message === 'errors.invalidVcrHost',
    );
    const dto = await as(admin)<Record<string, unknown>>('fiscal:setConfig', config());
    assert.equal(dto.hasPassword, true);
    assert.equal('password' in dto, false);
  });

  it('the saved password goes only to the VCR it was given for', async () => {
    const { password: _p, ...noPassword } = config();
    // The same VCR: the saved password is kept.
    await as(admin)('fiscal:setConfig', { ...noPassword, vatMode: 'nonPayer' });
    // Another machine (or port, or login) without typing it again: refused.
    for (const moved of [{ host: '192.168.1.50' }, { port: 22299 }, { login: 'other' }]) {
      await assert.rejects(
        as(admin)('fiscal:setConfig', { ...noPassword, ...moved }),
        (e: Error) => e.message === 'errors.fiscalPasswordRequired',
      );
    }
    const dto = await as(admin)<{ host: string; hasPassword: boolean }>('fiscal:getConfig');
    assert.deepEqual([dto.host, dto.hasPassword], ['127.0.0.1', true]);
  });

  it('a visit fully paid in cash and card is fiscalised once, with its codes', async () => {
    const id = await visit(150_000);
    await pay(id, 50_000, 'CARD');
    // Partly paid: not yet.
    assert.equal((await fiscalOf(id)).fiscalStatus, null);
    await pay(id, 100_000, 'CASH');
    await fiscal.settled();
    const f = await fiscalOf(id);
    assert.equal(f.fiscalStatus, 'FISCALIZED');
    assert.ok(f.fiscalReceiptNo);
    const sale = vcr.calls.filter((c) => c.method === 'Receipt.Sale').at(-1)!.params as {
      code: string;
      positions: Array<{ icps: string; package_code: string; amount: number; vat_value: number }>;
      payments: Array<{ type: number; value: number }>;
      pos_id: string;
    };
    assert.match(sale.code, /^PC-[a-f0-9]{8}-A-\d+$/);
    assert.equal(sale.positions[0]!.icps, '10902001034000000');
    assert.equal(sale.positions[0]!.package_code, '1321927');
    assert.equal(sale.positions[0]!.amount, 15_000_000);
    assert.equal(sale.positions[0]!.vat_value, -1);
    assert.deepEqual(
      sale.payments.map((p) => [p.type, p.value]),
      [
        [1, 10_000_000],
        [2, 5_000_000],
      ],
    );
    assert.equal(sale.pos_id, 'posclinic');
    // Sending again changes nothing.
    const before = vcr.receipts.length;
    await fiscal.sendWaiting();
    assert.equal(vcr.receipts.length, before);
  });

  it('a lost answer is recovered by the receipt code, never registered twice', async () => {
    vcr.failNext('Receipt.Sale', 'drop');
    const id = await visit(80_000);
    await pay(id, 80_000);
    await fiscal.settled();
    const f = await fiscalOf(id);
    assert.equal(f.fiscalStatus, 'FISCALIZED');
    const code = vcr.receipts.at(-1)!.Code;
    assert.equal(vcr.receipts.filter((r) => r.Code === code).length, 1);
  });

  it('VCR trouble leaves it waiting without an attempt; it goes once VCR is back', async () => {
    // The Z-report is known open from the earlier sale; close it so the next sale looks again.
    await as(admin)('fiscal:zClose');
    vcr.failNext('ZReport.GetInfo', 704017); // fiscal module unplugged
    const id = await visit(60_000);
    await pay(id, 60_000);
    await fiscal.settled();
    let f = await fiscalOf(id);
    assert.equal(f.fiscalStatus, 'PENDING');
    assert.equal(f.fiscalAttempts, 0);
    assert.match(f.fiscalError ?? '', /Fiskal modul/);
    await as(desk)('fiscal:retry', id);
    f = await fiscalOf(id);
    assert.equal(f.fiscalStatus, 'FISCALIZED');
    assert.equal(vcr.zOpen, true, 'the Z-report was opened again');
  });

  it('a visit VCR cannot take fails with the reason; one paid by transfer is skipped', async () => {
    const goods = await visit(30_000, 'DIRECT_SALE');
    await pay(goods, 30_000);
    await fiscal.settled();
    const g = await fiscalOf(goods);
    assert.equal(g.fiscalStatus, 'FAILED');
    assert.match(g.fiscalError ?? '', /MXIK/);

    const insured = await visit(40_000);
    await pay(insured, 40_000, 'INSURANCE');
    await fiscal.settled();
    assert.equal((await fiscalOf(insured)).fiscalStatus, 'SKIPPED');

    const s = await as(desk)<{ pending: number; failed: number }>('fiscal:status');
    assert.deepEqual([s.pending, s.failed], [0, 1]);
  });

  it('closing the shift closes VCR’s Z-report; opening the next opens a new one', async () => {
    const open = (await as(desk)<ShiftDto | null>('shifts:getOpen'))!;
    const r = await as(desk)<ShiftCloseResultDto>('shifts:close', {
      shiftId: open.id,
      countedCash: 0,
    });
    assert.equal(r.shift.status, 'CLOSED', 'the shift closes at once');
    await fiscal.settled();
    assert.equal(vcr.zOpen, false);
    const closed = await t.db.shift.findUniqueOrThrow({ where: { id: open.id } });
    assert.ok(closed.fiscalZClosedAt);

    const next = await as(desk)<ShiftDto>('shifts:open', { openingCash: 0 });
    await fiscal.settled();
    assert.equal(vcr.zOpen, true);
    const row = await t.db.shift.findUniqueOrThrow({ where: { id: next.id } });
    assert.equal(row.fiscalZReportId, vcr.zId);
  });
});
