import assert from 'node:assert/strict';
import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { describe, it } from 'node:test';
import { LICENSE_FEATURES } from '../../shared/license';
import {
  DAY_MS,
  type GateFacts,
  type LicensePayload,
  normalizeApiUrl,
  readLicense,
  refusal,
  tillState,
} from './license-core';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const other = generateKeyPairSync('ed25519');

const NOW = Date.parse('2026-11-15T10:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function token(payload: object, key: KeyObject = privateKey): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return `${body.toString('base64url')}.${sign(null, body, key).toString('base64url')}`;
}

function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    product: 'POSCLINIC',
    storeId: '1001',
    storeName: 'Shifo Parazitologiya',
    plan: 'PRO',
    expiresAt: iso(NOW + 30 * DAY_MS),
    warnFrom: iso(NOW + 27 * DAY_MS),
    blockAt: iso(NOW + 33 * DAY_MS),
    issuedAt: iso(NOW),
    checkinBy: iso(NOW + 14 * DAY_MS),
    seats: ['T-1'],
    features: ['reports', 'multiDoctor', 'printPrescription', 'debt'],
    limits: { staff: 10, monthlyVisits: 2000 },
    ...over,
  };
}

const facts = (over: Partial<GateFacts> = {}): GateFacts => ({
  activeDoctors: async () => 0,
  activeUsers: async () => 0,
  visitsThisMonth: async () => 0,
  appointmentBalance: async () => ({ total: 100_000, paid: 0 }),
  ...over,
});

const state = (p: LicensePayload | null, now = NOW) =>
  tillState({ license: p, terminalId: 'T-1', now });

describe('readLicense', () => {
  it('accepts a licence signed with the key', () => {
    const p = readLicense(token(payload()), publicKey);
    assert.equal(p?.storeId, '1001');
    assert.deepEqual(p?.limits, { staff: 10, monthlyVisits: 2000 });
  });

  it('rejects another key, another product, tampering and junk', () => {
    assert.equal(readLicense(token(payload(), other.privateKey), publicKey), null);
    assert.equal(readLicense(token({ ...payload(), product: 'SAVDOCHEF' }), publicKey), null);
    const [, sig] = token(payload()).split('.');
    const forged = Buffer.from(JSON.stringify(payload({ plan: 'VIP' }))).toString('base64url');
    assert.equal(readLicense(`${forged}.${sig}`, publicKey), null);
    assert.equal(readLicense('nope', publicKey), null);
    assert.equal(readLicense(42, publicKey), null);
  });

  it('drops feature names this build does not know', () => {
    const p = readLicense(
      token(payload({ features: ['reports', 'teleport'] as never })),
      publicKey,
    );
    assert.deepEqual(p?.features, ['reports']);
  });

  it('reads missing limits as unlimited', () => {
    const { limits: _omit, ...rest } = payload();
    assert.deepEqual(readLicense(token(rest), publicKey)?.limits, {
      staff: null,
      monthlyVisits: null,
    });
  });
});

describe('tillState', () => {
  it('is setup without a licence', () => {
    assert.equal(state(null).mode, 'setup');
  });

  it('VIP: no dates means unlimited and never blocks', () => {
    const vip = payload({
      plan: 'VIP',
      expiresAt: null,
      warnFrom: null,
      blockAt: null,
      seats: undefined,
      features: [...LICENSE_FEATURES],
      limits: { staff: null, monthlyVisits: null },
    });
    const s = state(vip, NOW + 5 * DAY_MS);
    assert.equal(s.mode, 'full');
    assert.equal(s.reason, 'unlimited');
    assert.equal(s.plan, 'VIP');
  });

  it('walks active → warning → grace → blocked', () => {
    const p = payload({ checkinBy: iso(NOW + 100 * DAY_MS) });
    assert.equal(state(p).reason, 'active');
    assert.equal(state(p, NOW + 28 * DAY_MS).reason, 'warning');
    assert.equal(state(p, NOW + 31 * DAY_MS).reason, 'grace');
    const blocked = state(p, NOW + 34 * DAY_MS);
    assert.equal(blocked.mode, 'readonly');
    assert.equal(blocked.reason, 'blocked');
  });

  it('goes read-only when the check-in is overdue', () => {
    assert.equal(state(payload(), NOW + 15 * DAY_MS).reason, 'checkin-required');
  });

  it('goes read-only on a terminal without a seat', () => {
    const s = tillState({ license: payload(), terminalId: 'T-9', now: NOW });
    assert.equal(s.reason, 'no-seat');
  });
});

describe('refusal', () => {
  const start = payload({
    plan: 'START',
    features: [],
    limits: { staff: 3, monthlyVisits: 300 },
  });

  it('refuses everything gated before setup', async () => {
    assert.equal(
      await refusal('patients:getAll', [], state(null), facts()),
      'license.refused.setup',
    );
  });

  it('read-only refuses new business but allows checkout and reading', async () => {
    const ro = state(payload(), NOW + 34 * DAY_MS);
    assert.equal(
      await refusal('appointments:create', [{}], ro, facts()),
      'license.refused.blocked',
    );
    assert.equal(await refusal('patients:getAll', [], ro, facts()), null);
    assert.equal(
      await refusal('appointments:checkout', ['a1', { amount: 100_000 }], ro, facts()),
      null,
    );
    // v2.10: new products, deliveries and expenses are new business; records of what happened
    // (write-offs, stocktakes, voids) are not.
    for (const ch of ['stock:saveProduct', 'stock:receive', 'expenses:create']) {
      assert.equal(await refusal(ch, [{}], ro, facts()), 'license.refused.blocked', ch);
    }
    for (const ch of ['stock:writeOff', 'stock:count', 'stock:voidReceipt', 'expenses:void']) {
      assert.equal(await refusal(ch, [{}], ro, facts()), null, ch);
    }
  });

  it('enforces the monthly visit limit', async () => {
    const s = state(start);
    assert.equal(
      await refusal('cases:open', [], s, facts({ visitsThisMonth: async () => 300 })),
      'license.limit.monthlyVisits',
    );
    assert.equal(
      await refusal('cases:open', [], s, facts({ visitsThisMonth: async () => 299 })),
      null,
    );
    // The registration itself is not limited (an order inside an open case is no new visit);
    // the handler asks 'cases:open' when it really opens one.
    assert.equal(
      await refusal(
        'appointments:create',
        [{ caseId: true }],
        s,
        facts({ visitsThisMonth: async () => 300 }),
      ),
      null,
    );
  });

  it('enforces the staff limit when a doctor login is created', async () => {
    const s = state(start); // START: staff 3
    assert.equal(
      await refusal('doctors:createLogin', ['d1', {}], s, facts({ activeUsers: async () => 3 })),
      'license.limit.staff',
    );
    assert.equal(
      await refusal('doctors:createLogin', ['d1', {}], s, facts({ activeUsers: async () => 2 })),
      null,
    );
  });

  it('needs multiDoctor for a second active doctor, including re-activation', async () => {
    const s = state(start);
    assert.equal(await refusal('doctors:create', [{}], s, facts()), null);
    assert.equal(
      await refusal('doctors:create', [{}], s, facts({ activeDoctors: async () => 1 })),
      'license.feature.multiDoctor',
    );
    assert.equal(
      await refusal(
        'doctors:update',
        ['d2', { active: true }],
        s,
        facts({ activeDoctors: async () => 1 }),
      ),
      'license.feature.multiDoctor',
    );
    assert.equal(
      await refusal(
        'doctors:update',
        ['d1', { fullName: 'X' }],
        s,
        facts({ activeDoctors: async () => 1 }),
      ),
      null,
    );
  });

  it('needs debt for a partial payment, not for a full one', async () => {
    const s = state(start);
    assert.equal(
      await refusal('appointments:checkout', ['a1', { amount: 50_000 }], s, facts()),
      'license.feature.debt',
    );
    assert.equal(
      await refusal('appointments:checkout', ['a1', { amount: 100_000 }], s, facts()),
      null,
    );
    // Cash with change is not debt.
    assert.equal(
      await refusal('appointments:checkout', ['a1', { amount: 120_000 }], s, facts()),
      null,
    );
    // A second payment that completes an earlier partial one is not debt either.
    const halfPaid = facts({ appointmentBalance: async () => ({ total: 100_000, paid: 60_000 }) });
    assert.equal(
      await refusal('appointments:checkout', ['a1', { amount: 40_000 }], s, halfPaid),
      null,
    );
    assert.equal(
      await refusal('appointments:checkout', ['a1', { amount: 30_000 }], s, halfPaid),
      'license.feature.debt',
    );
  });

  it('needs reports for a range over one day, and printPrescription to print', async () => {
    const s = state(start);
    const week = { startDate: iso(NOW - 7 * DAY_MS), endDate: iso(NOW) };
    assert.equal(
      await refusal('appointments:getAll', [week], s, facts()),
      'license.feature.reports',
    );
    assert.equal(await refusal('appointments:getAll', [{ today: true }], s, facts()), null);
    assert.equal(
      await refusal('print:prescription', ['a1'], s, facts()),
      'license.feature.printPrescription',
    );
    assert.equal(await refusal('print:prescription', ['a1'], state(payload()), facts()), null);
  });

  it('the money report (v2.10): one day free, longer or malformed needs reports', async () => {
    const s = state(start);
    const day = { from: '2026-11-18', to: '2026-11-18' };
    assert.equal(await refusal('finance:report', [day], s, facts()), null);
    // A list of expenses over a month is a report too.
    assert.equal(await refusal('expenses:list', [day], s, facts()), null);
    assert.equal(
      await refusal('expenses:list', [{ from: '2026-11-01', to: '2026-11-18' }], s, facts()),
      'license.feature.reports',
    );
    for (const range of [
      { from: '2026-11-01', to: '2026-11-18' },
      { from: '2026-11-18' },
      { from: 'x', to: 'y' },
      {},
    ]) {
      assert.equal(
        await refusal('finance:report', [range], s, facts()),
        'license.feature.reports',
        JSON.stringify(range),
      );
    }
    assert.equal(
      await refusal(
        'finance:report',
        [{ from: '2026-11-01', to: '2026-11-30' }],
        state(payload()),
        facts(),
      ),
      null,
    );
  });
});

describe('review hardening', () => {
  const start = payload({ plan: 'START', features: [], limits: { staff: 3, monthlyVisits: 300 } });

  it('refuses a non-numeric or negative checkout amount on every plan', async () => {
    for (const s of [state(start), state(payload())]) {
      for (const amount of ['abc', Number.NaN, -1, 0, undefined]) {
        assert.equal(
          await refusal('appointments:checkout', ['a1', { amount }], s, facts()),
          'license.refused.invalid',
        );
      }
    }
  });

  it('treats a one-ended or unparsable date range as a report', async () => {
    const s = state(start);
    for (const range of [
      { startDate: iso(NOW) },
      { endDate: iso(NOW) },
      { startDate: 'x', endDate: 'y' },
    ]) {
      assert.equal(
        await refusal('appointments:getAll', [range], s, facts()),
        'license.feature.reports',
      );
    }
    assert.equal(await refusal('appointments:getAll', [{ date: '2026-11-15' }], s, facts()), null);
    assert.equal(await refusal('appointments:getAll', [{}], s, facts()), null);
  });

  it('rejects a store id that is not a plain token', () => {
    assert.equal(readLicense(token(payload({ storeId: '../evil' })), publicKey), null);
  });
});

describe('normalizeApiUrl', () => {
  it('accepts posgro servers over https and drops trailing slashes', () => {
    assert.equal(
      normalizeApiUrl(' https://api.posgro.uz/api/ ', false),
      'https://api.posgro.uz/api',
    );
    assert.equal(
      normalizeApiUrl('https://dev.api.posgro.uz/api', false),
      'https://dev.api.posgro.uz/api',
    );
    assert.equal(normalizeApiUrl('https://posgro.uz/api', false), 'https://posgro.uz/api');
  });

  it('refuses other hosts, plain http and look-alike domains', () => {
    for (const raw of [
      'http://api.posgro.uz/api',
      'https://evil.uz/api',
      'https://posgro.uz.evil.com/api',
      'https://evilposgro.uz/api',
      'https://user:pw@api.posgro.uz/api',
      'https://api.posgro.uz/api?x=1',
      'not a url',
      '',
    ]) {
      assert.equal(normalizeApiUrl(raw, false), null, raw);
    }
  });

  it('allows http://localhost only when asked (dev builds)', () => {
    assert.equal(normalizeApiUrl('http://localhost:3000/api', false), null);
    assert.equal(normalizeApiUrl('http://localhost:3000/api', true), 'http://localhost:3000/api');
  });
});
