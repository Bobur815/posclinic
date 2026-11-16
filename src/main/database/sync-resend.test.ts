import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createTestDb, type TestDb } from '../test-utils/db';
import { RESEND_ENTITIES, resendClinicalSyncOnce } from './data-upgrades';

/** One-time resend of the clinical records the old server push DTO dropped (v2.5). */
let t: TestDb;
before(async () => {
  t = await createTestDb();
});
after(async () => {
  await t.close();
});

describe('resendClinicalSyncOnce', () => {
  it('clears the push cursors of the clinical entities once, and only them', async () => {
    for (const entity of ['cases', 'appointments', 'doctors', 'pull']) {
      await t.db.syncState.create({ data: { entity, pushCursor: '2026-11-16T05:07:04.078Z|x' } });
    }
    assert.deepEqual(await resendClinicalSyncOnce(t.db), [...RESEND_ENTITIES]);
    const by = async (e: string) => (await t.db.syncState.findUnique({ where: { entity: e } }))?.pushCursor;
    assert.equal(await by('cases'), null);
    assert.equal(await by('appointments'), null);
    assert.equal(await by('doctors'), '2026-11-16T05:07:04.078Z|x', 'doctors were never dropped');

    // Second open: nothing again (cursors that moved on since stay).
    await t.db.syncState.update({ where: { entity: 'cases' }, data: { pushCursor: 'later|y' } });
    assert.deepEqual(await resendClinicalSyncOnce(t.db), []);
    assert.equal(await by('cases'), 'later|y');
  });
});
