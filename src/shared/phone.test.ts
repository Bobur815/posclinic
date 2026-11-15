import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('accepts the common ways Uzbek numbers are typed', () => {
    for (const raw of [
      '+998901234567',
      '998901234567',
      '901234567',
      '+998 90 123-45-67',
      '(90) 123 45 67',
    ]) {
      assert.equal(normalizePhone(raw), '+998901234567', raw);
    }
  });

  it('rejects everything else', () => {
    for (const raw of ['', null, undefined, '12345', '+79001234567', 'abc', '99890123456789']) {
      assert.equal(normalizePhone(raw), null, String(raw));
    }
  });
});

describe('formatPhone', () => {
  it('groups a canonical number and leaves others alone', () => {
    assert.equal(formatPhone('+998901234567'), '+998 90 123 45 67');
    assert.equal(formatPhone('weird'), 'weird');
  });
});
