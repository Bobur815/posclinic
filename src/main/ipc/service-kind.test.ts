import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ServiceDto } from '../../shared/clinic';
import { seedParasitologyServices } from '../database/seed-parasitology';
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

/** Service types (v2.5): what ServiceList sends, and the seed for a new clinic. */

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

describe('service types', () => {
  it('seeds a new clinic with typed parasitology services', async () => {
    await seedParasitologyServices(t.db, 'uz');
    const s = await t.db.service.findMany();
    const by = (code: string) => s.find((x) => x.code === code);
    assert.equal(by('PAR-CONS')?.kind, 'CONSULTATION');
    assert.equal(by('PAR-CONS2')?.isFollowUp, true);
    assert.equal(by('PAR-OP')?.kind, 'ANALYSIS');
    assert.equal(by('PAR-OP')?.resultType, 'QUALITATIVE');
    assert.equal(by('PAR-ENEMA')?.kind, 'PROCEDURE');
  });

  it('keeps type fields consistent with the type', async () => {
    // ServiceList sends every field whatever the type.
    const form = {
      code: 'IFA-X',
      name: 'IFA',
      price: 90000,
      duration: 10,
      kind: 'ANALYSIS',
      isFollowUp: true,
      resultType: 'QUANTITATIVE',
      resultUnit: ' titr ',
      referenceRange: '< 1:100',
      active: true,
    };
    const a = await call<ServiceDto>('services:create', form);
    assert.equal(a.isFollowUp, false);
    assert.equal(a.resultType, 'QUANTITATIVE');
    assert.equal(a.resultUnit, 'titr');

    // Switching to a procedure clears the analysis fields; a partial update keeps the type.
    const p = await call<ServiceDto>('services:update', a.id, { ...form, kind: 'PROCEDURE' });
    assert.deepEqual([p.resultType, p.resultUnit, p.referenceRange], [null, null, null]);
    const priced = await call<ServiceDto>('services:update', a.id, { price: 100000 });
    assert.equal(priced.kind, 'PROCEDURE');

    await assert.rejects(
      call('services:create', { ...form, code: 'BAD', kind: 'SURGERY' }),
      (e: Error) => e.message === 'errors.invalidServiceKind',
    );
  });
});
