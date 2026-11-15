import assert from 'node:assert/strict';
import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { describe, it } from 'node:test';
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { type LicensedRequest, LicenseGuard } from './license.guard';
import type { LicenseService } from './license.service';
import { checkLicense, licenseTokenFrom, readLicense } from './license-verify';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const other = generateKeyPairSync('ed25519');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-15T10:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function token(payload: object, key: KeyObject = privateKey): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return `${body.toString('base64url')}.${sign(null, body, key).toString('base64url')}`;
}

const payload = (over: Record<string, unknown> = {}) => ({
  v: 1,
  product: 'POSCLINIC',
  storeId: 'store-1001',
  storeName: 'Demo',
  plan: 'PRO',
  expiresAt: iso(NOW + 30 * DAY),
  warnFrom: iso(NOW + 27 * DAY),
  blockAt: iso(NOW + 33 * DAY),
  issuedAt: iso(NOW),
  checkinBy: iso(NOW + 14 * DAY),
  features: ['reports', 'someday'],
  limits: { staff: 10, monthlyVisits: 2000 },
  ...over,
});

describe('licence verification', () => {
  it('accepts a valid POSCLINIC licence', () => {
    const r = checkLicense(token(payload()), publicKey, NOW);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.license.storeId, 'store-1001');
  });

  it('refuses a licence for another product', () => {
    const r = checkLicense(token(payload({ product: 'SAVDOCHEF' })), publicKey, NOW);
    assert.deepEqual(r, { ok: false, code: 'invalid_license' });
  });

  it('refuses a tampered payload or a foreign signature', () => {
    const t = token(payload());
    const [, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify(payload({ storeId: 'store-9999' }))).toString(
      'base64url',
    );
    assert.equal(readLicense(`${forged}.${sig}`, publicKey), null);
    assert.equal(readLicense(token(payload(), other.privateKey), publicKey), null);
    assert.equal(readLicense('garbage', publicKey), null);
    assert.equal(readLicense(`${t}.extra`, publicKey), null);
  });

  it('refuses a blocked licence, and blocked outranks an overdue check-in', () => {
    const blocked = payload({ blockAt: iso(NOW - 1), checkinBy: iso(NOW - 1) });
    assert.deepEqual(checkLicense(token(blocked), publicKey, NOW), {
      ok: false,
      code: 'license_blocked',
    });
  });

  it('refuses a licence whose check-in is overdue', () => {
    assert.deepEqual(checkLicense(token(payload({ checkinBy: iso(NOW) })), publicKey, NOW), {
      ok: false,
      code: 'license_checkin_required',
    });
  });

  it('accepts a VIP licence with no dates', () => {
    const vip = payload({ plan: 'VIP', expiresAt: null, warnFrom: null, blockAt: null });
    assert.equal(checkLicense(token(vip), publicKey, NOW).ok, true);
  });

  it('reads only the License scheme', () => {
    assert.equal(licenseTokenFrom('License abc.def'), 'abc.def');
    assert.equal(licenseTokenFrom('Bearer abc.def'), null);
    assert.equal(licenseTokenFrom(undefined), null);
  });
});

describe('LicenseGuard', () => {
  const touched: unknown[] = [];
  const service = {
    check: (t: unknown) => checkLicense(t, publicKey, NOW),
    touch: async (...args: unknown[]) => {
      touched.push(args);
    },
  } as unknown as LicenseService;
  const guard = new LicenseGuard(service);
  const ctx = (req: LicensedRequest) =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

  it('scopes the request to the licence storeId and records the terminal', async () => {
    const req: LicensedRequest = {
      headers: {
        authorization: `License ${token(payload())}`,
        'x-terminal-id': 'T-1',
        'x-app-version': '2.1.0',
      },
    };
    assert.equal(await guard.canActivate(ctx(req)), true);
    assert.equal(req.clinicId, 'store-1001');
    assert.equal((touched.at(-1) as unknown[])[1], 'T-1');
  });

  it('answers 401 for a foreign product and 403 for a blocked licence', async () => {
    const foreign = { headers: { authorization: `License ${token(payload({ product: 'X' }))}` } };
    await assert.rejects(guard.canActivate(ctx(foreign)), UnauthorizedException);
    const blocked = {
      headers: { authorization: `License ${token(payload({ blockAt: iso(NOW - DAY) }))}` },
    };
    await assert.rejects(guard.canActivate(ctx(blocked)), (e: unknown) => {
      assert.ok(e instanceof ForbiddenException);
      assert.equal(
        (e.getResponse() as { message: string }).message,
        'server.errors.license_blocked',
      );
      return true;
    });
    await assert.rejects(guard.canActivate(ctx({ headers: {} })), UnauthorizedException);
  });
});
