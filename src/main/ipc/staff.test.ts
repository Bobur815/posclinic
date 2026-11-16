import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type { StaffDto } from '../../shared/clinic';
import { refusal } from '../license/license-core';
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

/** Staff logins on the till (v2.5): admins add receptionists, nurses and admins. */

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
  (a: Actor) =>
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
});

after(async () => {
  await t.close();
});

describe('Staff page', () => {
  it('only an admin manages logins; a nurse is added and can sign in', async () => {
    await refusedWith(as(desk)('users:list'), 'errors.forbidden');
    const n = await as(admin)<StaffDto>('users:create', {
      fullName: 'Hamshira',
      phone: '93 123 45 67',
      role: 'NURSE',
      password: 'secret1',
    });
    assert.deepEqual([n.role, n.phone, 'password' in n], ['NURSE', '+998931234567', false]);
    const list = await as(admin)<StaffDto[]>('users:list');
    assert.ok(list.every((u) => !('password' in u)));
    const stored = await t.db.user.findUnique({ where: { id: n.id } });
    assert.ok(stored && (await bcrypt.compare('secret1', stored.password)));
  });

  it('refuses doctors here, bad roles, a taken phone and short passwords', async () => {
    const base = { fullName: 'X', phone: '+998941111111', password: 'secret1' };
    await refusedWith(
      as(admin)('users:create', { ...base, role: 'DOCTOR' }),
      'errors.useDoctorsPage',
    );
    await refusedWith(as(admin)('users:create', { ...base, role: 'OWNER' }), 'errors.invalidRole');
    await refusedWith(
      as(admin)('users:create', { ...base, role: 'NURSE', phone: desk.phone }),
      'errors.phoneTaken',
    );
    await refusedWith(
      as(admin)('users:create', { ...base, role: 'NURSE', password: '123' }),
      'errors.passwordTooShort',
    );
  });

  it('an admin never demotes or deactivates themself; others can be switched off and on', async () => {
    await refusedWith(
      as(admin)('users:update', admin.id, { role: 'RECEPTIONIST' }),
      'errors.selfDemote',
    );
    await refusedWith(as(admin)('users:update', admin.id, { active: false }), 'errors.selfDemote');
    const off = await as(admin)<StaffDto>('users:update', desk.id, { active: false });
    assert.equal(off.active, false);
    const on = await as(admin)<StaffDto>('users:update', desk.id, { active: true, role: 'NURSE' });
    assert.deepEqual([on.active, on.role], [true, 'NURSE']);
    await as(admin)('users:resetPassword', desk.id, 'newpass1');
    const u = await t.db.user.findUnique({ where: { id: desk.id } });
    assert.ok(u && (await bcrypt.compare('newpass1', u.password)));
  });

  it('the staff limit: a seat for a new login or one switched on, never for an edit', async () => {
    const state = {
      mode: 'active',
      reason: null,
      features: [],
      limits: { staff: 3, monthlyVisits: null },
    } as unknown as Parameters<typeof refusal>[2];
    const facts = (n: number) => ({
      activeDoctors: async () => 0,
      activeUsers: async () => n,
      visitsThisMonth: async () => 0,
      appointmentBalance: async () => null,
    });
    assert.equal(await refusal('staff:seat', [], state, facts(3)), 'license.limit.staff');
    assert.equal(await refusal('staff:seat', [], state, facts(2)), null);

    // The Staff page asks for a seat only when someone becomes able to sign in.
    const asked: string[] = [];
    configureHandlers({
      gate: async (channel) => {
        asked.push(channel);
        return null;
      },
    });
    try {
      const u = await as(admin)<StaffDto>('users:create', {
        fullName: 'Seat',
        phone: '+998951234567',
        role: 'RECEPTIONIST',
        password: 'secret1',
      });
      await as(admin)('users:update', u.id, { fullName: 'Renamed' });
      await as(admin)('users:update', u.id, { active: false });
      await as(admin)('users:update', u.id, { active: true });
      assert.deepEqual(
        asked.filter((c) => c === 'staff:seat'),
        ['staff:seat', 'staff:seat'],
        'on create and on switching back on, not on a rename or switching off',
      );
    } finally {
      configureHandlers({ gate: async () => null });
    }
  });
});
