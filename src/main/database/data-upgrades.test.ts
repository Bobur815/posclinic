import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createTestDb, type TestDb } from '../test-utils/db';
import { normalizePatientPhones } from './data-upgrades';

let t: TestDb;
before(async () => {
  t = await createTestDb();
});
after(async () => {
  await t.close();
});

const patient = (id: string, phone: string) =>
  t.db.patient.create({ data: { id, patientCode: `P-${id}`, fullName: `Patient ${id}`, phone } });

describe('normalizePatientPhones (v2.2.4 data upgrade)', () => {
  it('canonicalises old phones, skips a clash, leaves junk, and is idempotent', async () => {
    await patient('a', '90 123-45-67'); // -> +998901234567
    await patient('b', '+998911112233'); // already canonical
    await patient('c', '998 93 000 11 22'); // -> +998930001122
    await patient('d', '+998901234567x'); // unparseable: left as typed
    await patient('e', '(91) 111-22-33'); // clashes with b once normalised

    const was = await t.db.patient.findUniqueOrThrow({ where: { id: 'a' } });
    const r = await normalizePatientPhones(t.db);
    assert.equal(r.updated, 2);
    assert.deepEqual(r.skipped, ['e']);

    const byId = async (id: string) => (await t.db.patient.findUniqueOrThrow({ where: { id } })).phone;
    assert.equal(await byId('a'), '+998901234567');
    assert.equal(await byId('c'), '+998930001122');
    assert.equal(await byId('d'), '+998901234567x');
    assert.equal(await byId('e'), '(91) 111-22-33', 'a clash is never merged');

    const now = await t.db.patient.findUniqueOrThrow({ where: { id: 'a' } });
    assert.ok(now.updatedAt > was.updatedAt, 'updatedAt moves, so cloud sync sends it');

    const again = await normalizePatientPhones(t.db);
    assert.deepEqual(again, { updated: 0, skipped: ['e'] });
  });
});
