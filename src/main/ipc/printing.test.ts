import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type { AppointmentDto, PatientDto } from '../../shared/clinic';
import type { ReceiptLayout } from '../../shared/receipt-html';
import { useDatabaseClient } from '../database/sqlite-client';
import { createTestDb, openTestShift, type TestDb } from '../test-utils/db';
import { setupIpcHandlers } from './handlers';
import {
  type Actor,
  clearHandlers,
  configureHandlers,
  type HandlerContext,
  invokeHandler,
} from './ipc-safe';
import { setPrinterConfigFile } from './print-handlers';

/**
 * Printing over IPC (v2.7): who may change the receipt layout and this PC's printers, and what a
 * satellite gets to print from (`appointments:getById` carries the payments, not user secrets).
 * The print engine itself needs Electron and is not run here.
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
const as =
  (a: Actor | null) =>
  <R>(channel: string, ...args: unknown[]) =>
    invokeHandler(
      channel,
      { actor: a, setActor: () => undefined, terminalId: 'T1' } as HandlerContext,
      args,
    ) as Promise<R>;
const refusedWith = (p: Promise<unknown>, key: string) =>
  assert.rejects(p, (e: Error) => e.message === key);

before(async () => {
  t = await createTestDb();
  useDatabaseClient(t.db);
  await openTestShift(t.db);
  clearHandlers();
  setupIpcHandlers();
  configureHandlers({ gate: async () => null, onWrite: () => undefined, emit: () => undefined });
  setPrinterConfigFile(
    path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'posclinic-ipc-print-')), 'printer.json'),
  );
  const hash = await bcrypt.hash('secret1', 4);
  for (const u of [admin, desk]) {
    await t.db.user.create({
      data: { id: u.id, phone: u.phone, password: hash, role: u.role, fullName: u.fullName },
    });
  }
  await t.db.service.create({
    data: {
      id: 's-op',
      code: 'PAR-OP',
      name: 'Najas',
      price: 80000,
      kind: 'ANALYSIS',
      resultType: 'QUALITATIVE',
    },
  });
});

after(async () => {
  await t.close();
});

describe('receipt layout over IPC', () => {
  it('everyone reads it; only an admin changes it, and only with valid values', async () => {
    const before = await as(desk)<ReceiptLayout>('receipt:getLayout');
    assert.equal(before.showPatient, true);
    await refusedWith(as(desk)('receipt:setLayout', { footer: 'x' }), 'errors.forbidden');
    await refusedWith(
      as(admin)('receipt:setLayout', { logoTop: 'http://x' }),
      'errors.invalidSetting',
    );
    const saved = await as(admin)<ReceiptLayout>('receipt:setLayout', {
      clinicName: 'Shifo',
      showCashier: false,
    });
    assert.equal(saved.clinicName, 'Shifo');
    assert.equal((await as(desk)<ReceiptLayout>('receipt:getLayout')).showCashier, false);
  });
});

describe("this PC's printer config over IPC", () => {
  it('an admin chooses the printer; a receptionist cannot', async () => {
    await refusedWith(as(desk)('print:setConfig', { receiptPrinter: 'XP-80' }), 'errors.forbidden');
    await refusedWith(as(admin)('print:setConfig', { paperWidth: '90' }), 'errors.invalidSetting');
    const cfg = await as(admin)<{ receiptPrinter: string }>('print:setConfig', {
      receiptPrinter: 'XP-80',
    });
    assert.equal(cfg.receiptPrinter, 'XP-80');
    assert.equal(
      (await as(desk)<{ receiptPrinter: string }>('print:getConfig')).receiptPrinter,
      'XP-80',
    );
  });

  it('the drawer does nothing when this PC has none', async () => {
    assert.deepEqual(await as(desk)('print:openDrawer'), { success: true });
  });
});

describe('what a satellite prints from', () => {
  it('appointments:getById carries the payments and the cashier name, never a password', async () => {
    const patient = await as(desk)<PatientDto>('patients:create', {
      fullName: 'Aziz Karimov',
      phone: '+998901234567',
    });
    const visit = await as(desk)<AppointmentDto>('appointments:create', {
      patientId: patient.id,
      items: [{ serviceId: 's-op', quantity: 1 }],
    });
    await as(desk)('appointments:checkout', visit.id, { paymentMethod: 'CASH', amount: 80000 });
    const got = await as(desk)<AppointmentDto>('appointments:getById', visit.id);
    assert.equal(got.payments?.length, 1);
    assert.equal(got.payments?.[0].method, 'CASH');
    assert.equal(got.payments?.[0].amount, 80000);
    assert.equal(got.payments?.[0].createdBy?.fullName, 'RECEPTIONIST');
    assert.doesNotMatch(JSON.stringify(got), /password/i);
  });

  it('printing an unknown visit answers not found', async () => {
    assert.deepEqual(await as(desk)('print:serviceReceipt', 'nope'), {
      success: false,
      error: 'errors.notFound',
    });
  });
});

describe('who may print, and the licence gate', () => {
  it('nobody signed in prints no visit and opens no drawer', async () => {
    await refusedWith(as(null)('print:serviceReceipt', 'nope'), 'errors.notAuthenticated');
    await refusedWith(as(null)('print:openDrawer'), 'errors.notAuthenticated');
  });

  it("this PC's printer settings work without a licence (a satellite has none); visits stay gated", async () => {
    // A satellite's own gate: no licence, so it refuses every gated channel.
    configureHandlers({
      gate: async () => 'license.refused.setup',
      onWrite: () => undefined,
      emit: () => undefined,
    });
    try {
      assert.equal(
        (await as(admin)<{ receiptPrinter: string }>('print:getConfig')).receiptPrinter,
        'XP-80',
      );
      await as(admin)('print:setConfig', { paperWidth: '58' });
      assert.deepEqual(await as(desk)('print:openDrawer'), { success: true });
      await refusedWith(as(desk)('print:serviceReceipt', 'nope'), 'LICENSE:license.refused.setup');
      await refusedWith(as(desk)('print:prescription', 'nope'), 'LICENSE:license.refused.setup');
    } finally {
      configureHandlers({ gate: async () => null, onWrite: () => undefined, emit: () => undefined });
    }
  });
});
