import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatPhoneLocal,
  isCompletePhone,
  normalizePhone,
  phoneFieldValue,
  phoneLocalDigits,
} from './phone';

/** The "+998" phone field (till and web PhoneInput). */
describe('phone field helpers', () => {
  it('reads any typed, pasted or stored form as the 9 local digits', () => {
    for (const v of ['+998 90 123 45 67', '998901234567', '90 123 45 67', '(90) 123-45-67', '+998901234567']) {
      assert.equal(phoneLocalDigits(v), '901234567', v);
    }
    assert.equal(phoneLocalDigits('9012345678999'), '901234567');
    assert.equal(phoneLocalDigits(null), '');
  });

  it('formats as typed and hands the form the canonical value', () => {
    assert.equal(formatPhoneLocal('9012'), '90 12');
    assert.equal(formatPhoneLocal('+998901234567'), '90 123 45 67');
    assert.equal(phoneFieldValue('90 123 45 67'), '+998901234567');
    assert.equal(phoneFieldValue(''), '');
    // Partial stays partial: the server still refuses it.
    assert.equal(phoneFieldValue('9012'), '+9989012');
    assert.equal(normalizePhone(phoneFieldValue('9012')), null);
    assert.equal(isCompletePhone('+998901234567'), true);
    assert.equal(isCompletePhone('+9989012'), false);
  });
});
