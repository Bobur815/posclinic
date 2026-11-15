import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { runsOverLan } from '../lan/server';
import { CredentialStore, type SecretCipher } from './credential-store';

/** The login page's saved password: encrypted, one login, this PC only. */

const dir = mkdtempSync(path.join(tmpdir(), 'posclinic-cred-'));
const file = path.join(dir, 'saved-login.json');
after(() => rmSync(dir, { recursive: true, force: true }));

const rot = (s: string) => Buffer.from(s, 'utf8').toString('base64').split('').reverse().join('');
const cipher = (available = true): SecretCipher => ({
  available: () => available,
  encrypt: (s) => `enc:${rot(s)}`,
  decrypt: (s) => {
    if (!s.startsWith('enc:')) throw new Error('bad');
    return Buffer.from(s.slice(4).split('').reverse().join(''), 'base64').toString('utf8');
  },
});

describe('CredentialStore', () => {
  it('keeps one login, encrypted, and gives it back only for that phone', () => {
    const store = new CredentialStore(file, cipher());
    assert.equal(store.save('+998901112233', 'secret1'), true);
    assert.ok(!readFileSync(file, 'utf8').includes('secret1'), 'never in plain text');
    assert.equal(store.get('+998901112233'), 'secret1');
    assert.equal(store.get('+998909999999'), null);
    store.save('+998909999999', 'other22');
    assert.equal(store.get('+998901112233'), null, 'one login per PC');
    store.clear();
    assert.equal(existsSync(file), false);
    assert.equal(store.get('+998909999999'), null);
  });

  it('saves nothing when the OS cannot encrypt', () => {
    const store = new CredentialStore(file, cipher(false));
    assert.equal(store.save('+998901112233', 'secret1'), false);
    assert.equal(existsSync(file), false);
  });

  it('the credentials channels never go over the LAN', () => {
    assert.equal(runsOverLan('credentials:get'), false);
    assert.equal(runsOverLan('credentials:save'), false);
    assert.equal(runsOverLan('auth:login'), true);
  });
});
