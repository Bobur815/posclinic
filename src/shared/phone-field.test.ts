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

  it('typing digit by digit never adds 998 to what is shown (the field reads its own value back)', () => {
    let stored = '';
    let shown = '';
    for (const digit of '991234567') {
      // What the input holds after the key press, as PhoneInput sees it, then what it stores.
      stored = phoneFieldValue(`${shown}${digit}`);
      shown = formatPhoneLocal(stored);
    }
    assert.equal(shown, '99 123 45 67');
    assert.equal(stored, '+998991234567');
    assert.equal(formatPhoneLocal(phoneFieldValue('9')), '9');
    assert.equal(formatPhoneLocal('+9989'), '9');
    assert.equal(formatPhoneLocal('+998'), '');
    // A real local number starting with 99 / 98 is kept as typed.
    assert.equal(phoneLocalDigits('991234567'), '991234567');
    assert.equal(phoneLocalDigits('98 123 45 67'), '981234567');
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
