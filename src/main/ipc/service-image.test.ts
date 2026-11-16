import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { RecentPatientDto, ServiceDto } from '../../shared/clinic';
import { useDatabaseClient } from '../database/sqlite-client';
import { toWire } from '../sync/sync-engine';
import { createTestDb, type TestDb } from '../test-utils/db';
import { setupIpcHandlers } from './handlers';
import {
  type Actor,
  clearHandlers,
  configureHandlers,
  type HandlerContext,
  invokeHandler,
} from './ipc-safe';
import { SERVICE_IMAGE_MAX } from './service-handlers';

/** Service pictures (till only) and the recent patients of registration step 1. */

let t: TestDb;
const admin: Actor = {
  id: 'admin-1',
  fullName: 'Admin',
  phone: '+998900000001',
  email: null,
  role: 'CLINIC_ADMIN',
  clinicId: null,
};
const call = <R>(channel: string, ...args: unknown[]) =>
  invokeHandler(
    channel,
    { actor: admin, setActor: () => undefined, terminalId: 'T1' } as HandlerContext,
    args,
  ) as Promise<R>;
const refusedWith = (p: Promise<unknown>, key: string) =>
  assert.rejects(p, (e: Error) => e.message === key);

// 1×1 transparent PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

before(async () => {
  t = await createTestDb();
  useDatabaseClient(t.db);
  clearHandlers();
  setupIpcHandlers();
  configureHandlers({ gate: async () => null, onWrite: () => undefined, emit: () => undefined });
});

after(async () => {
  await t.close();
});

describe('service pictures', () => {
  it('stores, keeps on partial update, replaces and removes a picture', async () => {
    const s = await call<ServiceDto>('services:create', {
      code: 'IMG',
      name: 'Huqna',
      price: 1,
      duration: 10,
      image: PNG,
    });
    assert.equal(s.image, PNG);
    assert.equal((await call<ServiceDto>('services:update', s.id, { price: 2 })).image, PNG);
    assert.equal((await call<ServiceDto>('services:update', s.id, { image: null })).image, null);
  });

  it('refuses anything that is not a small PNG / JPEG / WebP data URL', async () => {
    const base = { code: 'BAD', name: 'X', price: 1, duration: 10 };
    for (const image of [
      'https://example.com/a.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:text/html;base64,PGI+',
      `data:image/png;base64,${'A'.repeat(SERVICE_IMAGE_MAX)}`,
    ]) {
      await refusedWith(call('services:create', { ...base, image }), 'errors.invalidImage');
    }
  });

  it('never sends the picture to the server', () => {
    const wire = toWire('services', {
      id: 's1',
      code: 'C',
      name: 'N',
      price: 1,
      image: PNG,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assert.equal('image' in wire, false);
  });
});

describe('patients:recent (registration step 1)', () => {
  it('lists the patients of the latest visits, newest first, once each', async () => {
    await t.db.doctor.create({ data: { id: 'd1', fullName: 'Dr' } });
    const svc = await t.db.service.create({
      data: { id: 's-r', code: 'R', name: 'Konsultatsiya', price: 1 },
    });
    for (const [id, name] of [
      ['pa', 'Ali'],
      ['pb', 'Vali'],
    ]) {
      await t.db.patient.create({
        data: { id, patientCode: id, fullName: name, phone: `+99890000000${id === 'pa' ? 1 : 2}` },
      });
    }
    const visit = async (n: string, patientId: string, minutesAgo: number) =>
      t.db.appointment.create({
        data: {
          id: n,
          appointmentNumber: n,
          patientId,
          appointmentDate: new Date(),
          createdAt: new Date(Date.now() - minutesAgo * 60_000),
          items: {
            create: [
              { id: `${n}-i`, serviceId: svc.id, serviceName: svc.name, unitPrice: 1, total: 1 },
            ],
          },
        },
      });
    await visit('v1', 'pa', 30);
    await visit('v2', 'pb', 20);
    await visit('v3', 'pa', 5);
    const recent = await call<RecentPatientDto[]>('patients:recent');
    assert.deepEqual(
      recent.map((p) => p.id),
      ['pa', 'pb'],
    );
    assert.deepEqual(recent[0].lastServices, ['Konsultatsiya']);
    assert.ok(
      new Date(recent[0].lastVisitAt).getTime() > new Date(recent[1].lastVisitAt).getTime(),
    );
  });
});
