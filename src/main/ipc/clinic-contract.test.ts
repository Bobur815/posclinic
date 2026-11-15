import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type {
  AppointmentDto,
  PatientDto,
  PatientWithVisitsDto,
  ServiceDto,
  TodaySummaryDto,
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

/**
 * The renderer ⇄ handler contract: each channel called with the exact payload its page sends
 * (pages/*), and read back with the fields that page reads. Real handlers, real schema, temp DB.
 */

let t: TestDb;
const admin: Actor = {
  id: 'admin-1',
  fullName: 'Admin',
  phone: '+998900000001',
  email: null,
  role: 'CLINIC_ADMIN',
  clinicId: null,
};
const ctx: HandlerContext = { actor: admin, setActor: () => undefined, terminalId: 'T1' };
const call = <R>(channel: string, ...args: unknown[]) =>
  invokeHandler(channel, ctx, args) as Promise<R>;

/** What Electron hands the renderer: a thrown handler error becomes its message. */
async function refusedWith(p: Promise<unknown>, key: string): Promise<void> {
  await assert.rejects(p, (e: Error) => e.message === key);
}

before(async () => {
  t = await createTestDb();
  useDatabaseClient(t.db);
  clearHandlers();
  setupIpcHandlers();
  configureHandlers({ gate: async () => null, onWrite: () => undefined, emit: () => undefined });
  await t.db.user.create({
    data: {
      id: admin.id,
      phone: admin.phone,
      password: await bcrypt.hash('secret1', 4),
      role: admin.role,
      fullName: admin.fullName,
    },
  });
});

after(async () => {
  await t.close();
});

describe('services (ServiceList, NewAppointmentPage)', () => {
  it('returns money as a number and keeps active from the form', async () => {
    // ServiceList.handleSave payload
    const s = await call<ServiceDto>('services:create', {
      code: 'KONS',
      name: 'Konsultatsiya',
      price: 150000,
      duration: 30,
      active: true,
    });
    assert.equal(s.price, 150000);
    assert.equal(s.active, true);
    const off = await call<ServiceDto>('services:create', {
      code: 'OLD',
      name: 'Konsultatsiya eski',
      price: 1,
      duration: 30,
      active: false,
    });
    assert.equal(off.active, false);
  });

  it('updates with an empty duration field (sent as the default 30)', async () => {
    const [s] = await call<ServiceDto[]>('services:getAll');
    const u = await call<ServiceDto>('services:update', s.id, {
      code: s.code,
      name: s.name,
      price: 175000,
      duration: 30,
      active: s.active,
    });
    assert.equal(u.price, 175000);
    assert.equal(u.duration, 30);
  });

  it('refuses a duplicate code with an i18n key', async () => {
    await refusedWith(
      call('services:create', { code: 'KONS', name: 'X', price: 1, duration: 30, active: true }),
      'errors.codeTaken',
    );
  });

  it('search returns Prisma rows (camelCase, boolean, number), active only, any case', async () => {
    const rows = await call<ServiceDto[]>('services:search', 'konsul');
    assert.deepEqual(
      rows.map((r) => r.code),
      ['KONS'],
    );
    assert.equal(rows[0].active, true);
    assert.equal(typeof rows[0].price, 'number');
    assert.equal(typeof rows[0].createdAt, 'string');
  });
});

describe('patients (PatientForm, PatientList, PatientDetails)', () => {
  // PatientForm sends every field as a string, '' for the empty ones.
  const form = {
    fullName: 'Aliyev Vali',
    phone: '90 123 45 67',
    birthDate: '1990-05-17',
    gender: '',
    bloodType: '',
    allergies: '',
    address: '',
    city: 'Toshkent',
    notes: '',
  };
  let patient: PatientDto;

  it('creates with a canonical phone and nulls for empty fields', async () => {
    patient = await call<PatientDto>('patients:create', form);
    assert.equal(patient.phone, '+998901234567');
    assert.equal(patient.patientCode, 'P-0001');
    assert.equal(patient.gender, null);
    assert.equal(patient.city, 'Toshkent');
    assert.equal(patient.birthDate?.slice(0, 10), '1990-05-17');
  });

  it('refuses the same phone typed another way, and a non-Uzbek phone', async () => {
    await refusedWith(
      call('patients:create', { ...form, phone: '+998 (90) 123-45-67' }),
      'errors.phoneTaken',
    );
    await refusedWith(call('patients:create', { ...form, phone: '12345' }), 'errors.invalidPhone');
  });

  it('search returns the fields the pickers read', async () => {
    for (const q of ['aliyev', 'P-0001', '901234567']) {
      const rows = await call<PatientDto[]>('patients:search', q);
      assert.equal(rows.length, 1, q);
      assert.equal(rows[0].fullName, 'Aliyev Vali');
      assert.equal(rows[0].patientCode, 'P-0001');
      assert.equal(rows[0].active, true);
    }
  });

  it('update from the edit form clears emptied fields', async () => {
    const u = await call<PatientDto>('patients:update', patient.id, {
      ...form,
      phone: patient.phone,
      birthDate: '',
      gender: 'MALE',
      city: '',
    });
    assert.equal(u.birthDate, null);
    assert.equal(u.gender, 'MALE');
    assert.equal(u.city, null);
  });
});

describe('appointments (NewAppointmentPage, CheckoutPage, Dashboard, PatientDetails)', () => {
  let patientId: string;
  let doctorId: string;
  let serviceId: string;
  let visit: AppointmentDto;

  before(async () => {
    patientId = (await call<PatientDto[]>('patients:search', 'aliyev'))[0].id;
    doctorId = (await call<{ id: string }>('doctors:create', { fullName: 'Dr Karimov' })).id;
    serviceId = (await call<ServiceDto[]>('services:search', 'KONS'))[0].id;
  });

  const create = () =>
    call<AppointmentDto>('appointments:create', {
      patientId,
      doctorId,
      appointmentDate: new Date().toISOString(),
      notes: '',
      items: [
        { serviceId, serviceName: 'Konsultatsiya', quantity: 2, unitPrice: 50000, total: 100000 },
      ],
    });

  it('creates with numeric money and the includes the pages read', async () => {
    visit = await create();
    // The till prices from its catalog (the page's 50 000 is only a preview).
    const price = (await call<ServiceDto[]>('services:search', 'KONS'))[0].price;
    assert.equal(visit.items[0].unitPrice, price);
    assert.equal(visit.totalAmount, price * 2);
    assert.equal(typeof visit.totalAmount, 'number');
    assert.equal(visit.paidAmount, 0);
    assert.equal(visit.patient.fullName, 'Aliyev Vali');
    assert.equal(visit.doctor?.fullName, 'Dr Karimov');
  });

  it('a partial payment counts in today’s revenue; cancelled visits are not pending', async () => {
    // CheckoutPage.handleConfirm payload
    const paid = await call<AppointmentDto>('appointments:checkout', visit.id, {
      paymentMethod: 'CASH',
      amount: 40000,
    });
    assert.equal(paid.paidAmount, 40000);
    assert.equal(paid.paymentStatus, 'PARTIAL');

    const cancelled = await create();
    await call('appointments:update', cancelled.id, { status: 'CANCELLED' });

    const s = await call<TodaySummaryDto>('appointments:getTodaySummary');
    assert.equal(s.total, 2);
    assert.equal(s.revenue, 40000);
    assert.equal(s.pending, 1);
    assert.equal(typeof s.recentAppointments[0].totalAmount, 'number');
  });

  it('prices the visit from the catalog, ignoring prices the caller sends', async () => {
    const catalog = (await call<ServiceDto[]>('services:search', 'KONS'))[0];
    const forged = await call<AppointmentDto>('appointments:create', {
      patientId,
      doctorId,
      appointmentDate: new Date().toISOString(),
      items: [{ serviceId, serviceName: 'Cheap', quantity: 3, unitPrice: 1, total: 3 }],
    });
    assert.equal(forged.items[0].unitPrice, catalog.price);
    assert.equal(forged.items[0].serviceName, catalog.name);
    assert.equal(forged.totalAmount, catalog.price * 3);
    // Not part of the visits the next tests count.
    await call('appointments:update', forged.id, { status: 'CANCELLED' });
  });

  it('refuses unknown/inactive services, an empty visit and impossible quantities', async () => {
    const base = { patientId, doctorId, appointmentDate: new Date().toISOString() };
    await refusedWith(
      call('appointments:create', { ...base, items: [{ serviceId: 'nope', quantity: 1 }] }),
      'errors.serviceUnavailable',
    );
    await refusedWith(call('appointments:create', { ...base, items: [] }), 'errors.noServices');
    for (const quantity of [0, -1, 1.5, 1000]) {
      await refusedWith(
        call('appointments:create', { ...base, items: [{ serviceId, quantity }] }),
        'errors.invalidQuantity',
      );
    }
    await refusedWith(
      call('appointments:create', { ...base, appointmentDate: 'garbage', items: [{ serviceId, quantity: 1 }] }),
      'errors.invalidDate',
    );
    const off = await call<ServiceDto>('services:create', { code: 'OFF', name: 'Old', price: 9, duration: 10, active: false });
    await refusedWith(
      call('appointments:create', { ...base, items: [{ serviceId: off.id, quantity: 1 }] }),
      'errors.serviceUnavailable',
    );
  });

  it('a cancelled visit refuses payment', async () => {
    const v = await create();
    await call('appointments:update', v.id, { status: 'CANCELLED' });
    await refusedWith(
      call('appointments:checkout', v.id, { paymentMethod: 'CASH', amount: 1000 }),
      'errors.visitCancelled',
    );
  });

  it('patient history carries the doctor of each visit', async () => {
    const p = await call<PatientWithVisitsDto>('patients:getById', patientId);
    const visits = await t.db.appointment.count({ where: { patientId } });
    assert.equal(p.appointments.length, visits);
    assert.ok(p.appointments.every((a) => a.doctor?.fullName === 'Dr Karimov'));
  });
});

describe('auth:changePassword (UserSettingsPage)', () => {
  it('answers false, not a throw, for a wrong current password', async () => {
    assert.equal(await call('auth:changePassword', 'wrong', 'newpass1'), false);
    assert.equal(await call('auth:changePassword', 'secret1', 'newpass1'), true);
  });
});

