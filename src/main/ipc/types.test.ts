import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type {
  AppointmentDto,
  QueueItemDto,
  ServiceDto,
  ServiceTypeDto,
  StaffDto,
  StaffTypeDto,
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
 * Settings → Types (v2.5): custom order types (with a behaviour, incl. direct sale) and staff
 * types (with an access level, incl. no login).
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
  clearHandlers();
  setupIpcHandlers();
  configureHandlers({ gate: async () => null, onWrite: () => undefined, emit: () => undefined });
  const hash = await bcrypt.hash('secret1', 4);
  for (const u of [admin, desk]) {
    await t.db.user.create({
      data: { id: u.id, phone: u.phone, password: hash, role: u.role, fullName: u.fullName },
    });
  }
  await t.db.patient.create({
    data: { id: 'p1', patientCode: 'P-1', fullName: 'Bemor', phone: '+998901112233' },
  });
});

after(async () => {
  await t.close();
});

describe('order types', () => {
  let drugs: ServiceTypeDto;
  let cream: ServiceDto;

  it('only an admin adds a type; a service of that type takes its behaviour', async () => {
    await refusedWith(
      as(desk)('types:saveServiceType', { nameUz: 'Dorilar', behavior: 'DIRECT_SALE' }),
      'errors.forbidden',
    );
    drugs = await as(admin)<ServiceTypeDto>('types:saveServiceType', {
      nameUz: 'Dori-darmonlar',
      nameRu: 'Лекарства и мази',
      behavior: 'DIRECT_SALE',
      color: '#16A34A',
    });
    assert.equal(drugs.color, '#16a34a');
    await refusedWith(
      as(admin)('types:saveServiceType', { nameUz: 'X', behavior: 'MAGIC' }),
      'errors.invalidServiceKind',
    );
    cream = await as(admin)<ServiceDto>('services:create', {
      code: 'CREAM',
      name: 'Antiparazitar malham',
      price: 25000,
      duration: 0,
      kind: 'CONSULTATION', // ignored: the type decides
      serviceTypeId: drugs.id,
    });
    assert.deepEqual([cream.kind, cream.serviceTypeId], ['DIRECT_SALE', drugs.id]);
    const list = await as(desk)<{ serviceTypes: ServiceTypeDto[] }>('types:list');
    assert.equal(list.serviceTypes.length, 1);
  });

  it('a direct sale opens no case, never queues, and is done once paid', async () => {
    const before = await t.db.clinicalCase.count();
    const order = await as(desk)<AppointmentDto>('appointments:create', {
      patientId: 'p1',
      items: [{ serviceId: cream.id, quantity: 2 }],
    });
    assert.equal(order.caseId, null);
    assert.equal(order.doctorId, null);
    assert.equal(
      await t.db.clinicalCase.count(),
      before,
      'no case: not a visit for the plan limit',
    );
    await as(desk)('appointments:checkout', order.id, { paymentMethod: 'CASH', amount: 50000 });
    const after = await t.db.appointment.findUnique({
      where: { id: order.id },
      include: { items: true },
    });
    assert.equal(after?.status, 'COMPLETED');
    assert.equal(after?.items[0].status, 'DONE');
    assert.equal((await as(desk)<QueueItemDto[]>('queue:listOverview')).length, 0);
  });

  it('changing a type’s behaviour moves its services', async () => {
    await as(admin)('types:saveServiceType', { ...drugs, behavior: 'PROCEDURE' });
    assert.equal((await t.db.service.findUnique({ where: { id: cream.id } }))?.kind, 'PROCEDURE');
  });
});

describe('staff types', () => {
  let cleaner: StaffTypeDto;
  let accountant: StaffTypeDto;

  it('a no-login type: on the staff list, never signs in, no password needed', async () => {
    cleaner = await as(admin)<StaffTypeDto>('types:saveStaffType', {
      nameUz: 'Farrosh',
      access: 'NONE',
    });
    const u = await as(admin)<StaffDto>('users:create', {
      fullName: 'Farrosh opa',
      phone: '+998931110000',
      staffTypeId: cleaner.id,
    });
    assert.deepEqual([u.role, u.staffTypeId], ['STAFF', cleaner.id]);
    const login = await as(null)<{ success: boolean; error?: string }>(
      'auth:login',
      '+998931110000',
      'anything',
    );
    assert.equal(login.success, false);
    await refusedWith(as(admin)('users:resetPassword', u.id, 'secret1'), 'errors.noLoginType');
  });

  it('a type with access gives its role; changing the access changes its users', async () => {
    accountant = await as(admin)<StaffTypeDto>('types:saveStaffType', {
      nameUz: 'Buxgalter',
      access: 'RECEPTIONIST',
    });
    const u = await as(admin)<StaffDto>('users:create', {
      fullName: 'Buxgalter',
      phone: '+998931110001',
      staffTypeId: accountant.id,
      password: 'secret1',
    });
    assert.equal(u.role, 'RECEPTIONIST');
    const ok = await as(null)<{ success: boolean }>('auth:login', '+998931110001', 'secret1');
    assert.equal(ok.success, true);

    await as(admin)('types:saveStaffType', { ...accountant, access: 'NONE' });
    assert.equal((await t.db.user.findUnique({ where: { id: u.id } }))?.role, 'STAFF');
    const no = await as(null)<{ success: boolean }>('auth:login', '+998931110001', 'secret1');
    assert.equal(no.success, false, 'cut off at once');
  });

  it('from no login to a login role needs a password', async () => {
    const u = await t.db.user.findFirstOrThrow({ where: { staffTypeId: cleaner.id } });
    await refusedWith(
      as(admin)('users:update', u.id, { role: 'NURSE' }),
      'errors.passwordRequired',
    );
    const n = await as(admin)<StaffDto>('users:update', u.id, {
      role: 'NURSE',
      password: 'secret1',
    });
    assert.deepEqual([n.role, n.staffTypeId], ['NURSE', null]);
  });
});
