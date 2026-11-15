import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSelfLockout } from '../catalog/catalog-core';
import { DUMMY_HASH, type LoginCandidate, pickLogin } from './auth-core';

const NOW = new Date('2026-11-15T10:00:00Z');

/** Fake compare: the "hash" is `hash:<password>`. */
const compare = async (password: string, hash: string) => hash === `hash:${password}`;

const cand = (over: {
  user?: Partial<LoginCandidate['user']>;
  clinic?: Partial<LoginCandidate['clinic']>;
}): LoginCandidate => ({
  user: {
    id: 'u1',
    clinicId: 'c1',
    role: 'CLINIC_ADMIN',
    active: true,
    passwordHash: 'hash:secret',
    ...over.user,
  },
  clinic: { active: true, blockAt: null, ...over.clinic },
});

describe('dashboard login', () => {
  it('signs in an active admin of an unblocked clinic', async () => {
    const r = await pickLogin([cand({})], 'secret', compare, NOW);
    assert.equal(r.ok, true);
  });

  it('refuses an unknown phone or a wrong password (timing: still compares)', async () => {
    const seen: string[] = [];
    const spy = async (p: string, h: string) => {
      seen.push(h);
      return compare(p, h);
    };
    assert.deepEqual(await pickLogin([], 'secret', spy, NOW), {
      ok: false,
      code: 'invalid_credentials',
    });
    assert.deepEqual(seen, [DUMMY_HASH]);
    assert.deepEqual(await pickLogin([cand({})], 'nope', compare, NOW), {
      ok: false,
      code: 'invalid_credentials',
    });
  });

  it('refuses non-admins, inactive users and blocked clinics', async () => {
    const code = async (c: LoginCandidate) => {
      const r = await pickLogin([c], 'secret', compare, NOW);
      return r.ok ? 'ok' : r.code;
    };
    assert.equal(await code(cand({ user: { role: 'RECEPTIONIST' } })), 'not_admin');
    assert.equal(await code(cand({ user: { role: 'DOCTOR' } })), 'not_admin');
    assert.equal(await code(cand({ user: { active: false } })), 'user_inactive');
    assert.equal(
      await code(cand({ clinic: { blockAt: new Date(NOW.getTime() - 1) } })),
      'license_blocked',
    );
    assert.equal(await code(cand({ clinic: { blockAt: new Date(NOW.getTime() + 1) } })), 'ok');
    assert.equal(await code(cand({ user: { role: 'SUPER_ADMIN' } })), 'ok');
  });

  it('picks the clinic whose account the password opens (same phone in two clinics)', async () => {
    const a = cand({ user: { id: 'u1', clinicId: 'c1', passwordHash: 'hash:other' } });
    const b = cand({ user: { id: 'u2', clinicId: 'c2' } });
    const r = await pickLogin([a, b], 'secret', compare, NOW);
    assert.equal(r.ok && r.candidate.user.clinicId, 'c2');
  });
});

describe('self lock-out guard', () => {
  it('stops an admin deactivating or demoting themself, not others', () => {
    assert.equal(isSelfLockout('u1', 'u1', { active: false }), true);
    assert.equal(isSelfLockout('u1', 'u1', { role: 'DOCTOR' }), true);
    assert.equal(isSelfLockout('u1', 'u1', { role: 'SUPER_ADMIN', active: true }), false);
    assert.equal(isSelfLockout('u1', 'u2', { active: false, role: 'DOCTOR' }), false);
  });
});
