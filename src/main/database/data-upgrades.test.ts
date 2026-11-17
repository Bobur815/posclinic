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

describe('fillSeededFiscalCodesOnce (v2.6 data upgrade)', () => {
  it('gives the starter services their codes by kind, once, and never overrules an admin', async () => {
    const { fillSeededFiscalCodesOnce } = await import('./data-upgrades');
    const { seedParasitologyServices } = await import('./seed-parasitology');
    // A v2.5 till: starter services without codes, one the admin coded by hand, one of its own.
    await t.db.service.createMany({
      data: [
        { id: 'c1', code: 'PAR-CONS', name: 'Konsultatsiya', price: 0, kind: 'CONSULTATION' },
        { id: 'a1', code: 'PAR-OP', name: 'Ovoskopiya', price: 0, kind: 'ANALYSIS' },
        { id: 'p1', code: 'PAR-ENEMA', name: 'Klizma', price: 0, kind: 'PROCEDURE', mxik: '10902003099000000', packageCode: '9' },
        { id: 'o1', code: 'OWN-1', name: 'Own', price: 0, kind: 'CONSULTATION' },
      ],
    });
    const before = await t.db.service.findUniqueOrThrow({ where: { id: 'c1' } });
    assert.equal(await fillSeededFiscalCodesOnce(t.db), 2);
    const codes = async (id: string) => {
      const s = await t.db.service.findUniqueOrThrow({ where: { id } });
      return [s.mxik, s.packageCode];
    };
    assert.deepEqual(await codes('c1'), ['10902001034000000', '1321927']);
    assert.deepEqual(await codes('a1'), ['10902002003000999', '1321964']);
    assert.deepEqual(await codes('p1'), ['10902003099000000', '9'], 'an admin’s code stays');
    assert.deepEqual(await codes('o1'), [null, null], 'only starter services');
    const after = await t.db.service.findUniqueOrThrow({ where: { id: 'c1' } });
    assert.ok(after.updatedAt > before.updatedAt, 'updatedAt moves, so cloud sync sends it');

    // Once: a code the admin clears later is not filled again.
    await t.db.service.update({ where: { id: 'c1' }, data: { mxik: null, packageCode: null } });
    assert.equal(await fillSeededFiscalCodesOnce(t.db), 0);
    assert.deepEqual(await codes('c1'), [null, null]);

    // A new till gets them from the seeder.
    await t.db.service.deleteMany({});
    await seedParasitologyServices(t.db, 'uz');
    const seeded = await t.db.service.findMany({ select: { kind: true, mxik: true } });
    assert.ok(seeded.length > 5);
    for (const s of seeded) assert.match(s.mxik ?? '', /^10902\d{12}$/, s.kind);
  });
});
