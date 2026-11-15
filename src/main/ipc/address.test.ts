import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AdminUnitDto } from '../../shared/address';
import { unitName } from '../../shared/address';
import type { PatientDto } from '../../shared/clinic';
import {
  type AdminUnitDataset,
  datasetVersion,
  importAdminUnits,
  validateDataset,
} from '../database/admin-units';
import dataset from '../database/data/admin-units.json';
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
 * Uzbekistan addresses: the bundled SOATO dataset, its idempotent import, the address channels
 * and how patients:create/update store and validate the codes. Real handlers, temp DB.
 */

const ds = dataset as AdminUnitDataset;
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
const refusedWith = (p: Promise<unknown>, key: string) =>
  assert.rejects(p, (e: Error) => e.message === key);

// Fixed codes from the official classifier (docs/addresses.md).
const ANDIJAN = '1703';
const TASHKENT_CITY = '1726';
const YANGIHAYOT = '1726292'; // district of Tashkent City
const VOBKENT = '1706212'; // district of Bukhara region

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

describe('bundled dataset', () => {
  it('is valid: 14 top-level units, every child under an existing top-level parent', () => {
    assert.deepEqual(validateDataset(ds), []);
    const top = ds.units.filter((u) => u.parentCode === null);
    assert.equal(top.length, 14);
    for (const u of ds.units.filter((x) => x.parentCode !== null)) {
      assert.ok(u.code.startsWith(u.parentCode as string), u.code);
    }
    assert.ok(ds.source.length > 0 && ds.source.every((s) => s.url && s.retrievedAt));
  });

  it('rejects broken data before writing', () => {
    const bad: AdminUnitDataset = {
      ...ds,
      units: [
        { ...ds.units[0] },
        { ...ds.units[0] }, // duplicate
        { ...ds.units[20], code: '9999999', parentCode: '9999' }, // unknown parent
        { ...ds.units[1], nameUz: ' ' },
      ],
    };
    const problems = validateDataset(bad);
    assert.ok(
      problems.some((p) => p.includes('duplicate')),
      problems.join('; '),
    );
    assert.ok(problems.length >= 3, problems.join('; '));
  });
});

describe('importAdminUnits', () => {
  it('imports once, then skips the same version', async () => {
    const first = await importAdminUnits(t.db, ds);
    assert.equal(first.skipped, false);
    assert.equal(first.upserted, ds.units.length);
    assert.equal(await t.db.adminUnit.count({ where: { active: true } }), ds.units.length);
    const again = await importAdminUnits(t.db, ds);
    assert.equal(again.skipped, true);
  });

  it('deactivates a unit dropped from a newer dataset and keeps patients pointing at it', async () => {
    const p = await t.db.patient.create({
      data: {
        patientCode: 'P-OLD',
        fullName: 'Test',
        phone: '+998901110000',
        regionCode: TASHKENT_CITY,
        districtCode: YANGIHAYOT,
      },
    });
    const smaller = { ...ds, units: ds.units.filter((u) => u.code !== YANGIHAYOT) };
    assert.notEqual(datasetVersion(smaller), datasetVersion(ds));
    const r = await importAdminUnits(t.db, smaller);
    assert.equal(r.deactivated, 1);
    const row = await t.db.adminUnit.findUnique({ where: { code: YANGIHAYOT } });
    assert.equal(row?.active, false);
    const kept = await t.db.patient.findUnique({ where: { id: p.id } });
    assert.equal(kept?.districtCode, YANGIHAYOT);

    // Back to the full dataset: reactivated.
    await importAdminUnits(t.db, ds);
    assert.equal((await t.db.adminUnit.findUnique({ where: { code: YANGIHAYOT } }))?.active, true);
    await t.db.patient.delete({ where: { id: p.id } });
  });
});

describe('address channels (AddressSelector)', () => {
  it('addresses:regions returns the 14 top-level units', async () => {
    const regions = await call<AdminUnitDto[]>('addresses:regions');
    assert.equal(regions.length, 14);
    assert.ok(regions.every((r) => r.level === 1 && r.parentCode === null));
    const tash = regions.find((r) => r.code === TASHKENT_CITY);
    assert.ok(tash?.nameRu && tash.nameUz);
    assert.equal(unitName(tash, 'ru'), tash.nameRu);
  });

  it('addresses:children returns only that region’s units', async () => {
    const kids = await call<AdminUnitDto[]>('addresses:children', TASHKENT_CITY);
    assert.equal(kids.length, 12);
    assert.ok(kids.every((k) => k.parentCode === TASHKENT_CITY && k.level === 2));
    assert.ok(kids.some((k) => k.code === YANGIHAYOT));
    assert.deepEqual(await call('addresses:children', YANGIHAYOT), []);
  });

  it('addresses:children refuses a malformed or unknown code', async () => {
    await refusedWith(call('addresses:children', 'abc'), 'errors.invalidAddress');
    await refusedWith(call('addresses:children', '1799'), 'errors.invalidAddress');
    await refusedWith(call('addresses:children', undefined), 'errors.invalidAddress');
  });
});

describe('patients store address codes (PatientForm)', () => {
  const form = {
    fullName: 'Aziz Karimov',
    phone: '+998901234500',
    birthDate: '',
    gender: '',
    bloodType: '',
    allergies: '',
    address: 'Bunyodkor 1',
    notes: '',
  };

  it('create stores codes and derives the city text', async () => {
    const p = await call<PatientDto>('patients:create', {
      ...form,
      regionCode: TASHKENT_CITY,
      districtCode: YANGIHAYOT,
    });
    assert.equal(p.regionCode, TASHKENT_CITY);
    assert.equal(p.districtCode, YANGIHAYOT);
    const [r, d] = await Promise.all([
      t.db.adminUnit.findUnique({ where: { code: TASHKENT_CITY } }),
      t.db.adminUnit.findUnique({ where: { code: YANGIHAYOT } }),
    ]);
    assert.equal(p.city, `${d?.nameUz}, ${r?.nameUz}`);
    assert.equal(p.address, 'Bunyodkor 1');

    // Region only, then cleared.
    const u = await call<PatientDto>('patients:update', p.id, {
      ...form,
      regionCode: ANDIJAN,
      districtCode: null,
    });
    assert.equal(u.regionCode, ANDIJAN);
    assert.equal(u.districtCode, null);
    const cleared = await call<PatientDto>('patients:update', p.id, {
      ...form,
      regionCode: null,
      districtCode: null,
    });
    assert.equal(cleared.regionCode, null);
    assert.equal(cleared.city, null);
  });

  it('refuses a district from another region, a district alone and unknown codes', async () => {
    const f = { ...form, phone: '+998901234501' };
    await refusedWith(
      call('patients:create', { ...f, regionCode: ANDIJAN, districtCode: VOBKENT }),
      'errors.invalidAddress',
    );
    await refusedWith(
      call('patients:create', { ...f, regionCode: null, districtCode: VOBKENT }),
      'errors.invalidAddress',
    );
    await refusedWith(
      call('patients:create', { ...f, regionCode: '1799', districtCode: null }),
      'errors.invalidAddress',
    );
    // A district code as the region.
    await refusedWith(
      call('patients:create', { ...f, regionCode: VOBKENT, districtCode: null }),
      'errors.invalidAddress',
    );
    assert.equal(await t.db.patient.count({ where: { phone: f.phone } }), 0);
  });

  it('refuses a unit deactivated by a dataset update', async () => {
    await importAdminUnits(t.db, { ...ds, units: ds.units.filter((u) => u.code !== YANGIHAYOT) });
    await refusedWith(
      call('patients:create', {
        ...form,
        phone: '+998901234502',
        regionCode: TASHKENT_CITY,
        districtCode: YANGIHAYOT,
      }),
      'errors.invalidAddress',
    );
    await importAdminUnits(t.db, ds);
  });

  it('an update without address fields keeps a legacy free-text city', async () => {
    const legacy = await t.db.patient.create({
      data: { patientCode: 'P-LEG', fullName: 'Eski', phone: '+998901234503', city: 'Chirchiq' },
    });
    const { address: _a, ...noAddress } = form;
    const u = await call<PatientDto>('patients:update', legacy.id, {
      ...noAddress,
      phone: '+998901234503',
      address: 'x',
    });
    assert.equal(u.city, 'Chirchiq');
    assert.equal(u.regionCode, null);
  });
});
