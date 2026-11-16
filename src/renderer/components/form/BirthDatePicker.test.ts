import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyDateChange, type DateParts } from './BirthDatePicker';

/** BirthDatePicker: three dropdowns, one valid date or nothing. */

const today = { y: 2026, m: 11, d: 16 };
const empty: DateParts = { d: null, m: null, y: null };

describe('applyDateChange', () => {
  it('hands the form a date only when day, month and year are all chosen', () => {
    let s = applyDateChange(empty, { d: 5 }, today);
    assert.equal(s.value, '');
    s = applyDateChange(s.parts, { m: 3 }, today);
    assert.equal(s.value, '');
    s = applyDateChange(s.parts, { y: 1990 }, today);
    assert.equal(s.value, '1990-03-05');
    // Clearing a part empties the value again.
    assert.equal(applyDateChange(s.parts, { m: null }, today).value, '');
  });

  it('clears a day that does not exist in the new month or year, never moves it', () => {
    const jan31 = { d: 31, m: 1, y: 1990 };
    const feb = applyDateChange(jan31, { m: 2 }, today);
    assert.deepEqual([feb.parts.d, feb.value], [null, '']);
    const leap = applyDateChange({ d: 29, m: 2, y: 2000 }, { y: 2001 }, today);
    assert.equal(leap.parts.d, null);
    assert.equal(applyDateChange({ d: 29, m: 2, y: 2001 }, { y: 2004 }, today).value, '2004-02-29');
  });

  it('never allows a birth date after today', () => {
    const dec = applyDateChange({ d: 1, m: 12, y: 2025 }, { y: 2026 }, today);
    assert.equal(dec.parts.m, null, 'December 2026 is in the future');
    const lateNov = applyDateChange({ d: 20, m: 11, y: 2025 }, { y: 2026 }, today);
    assert.equal(lateNov.parts.d, null, '20 Nov 2026 is after 16 Nov');
    assert.equal(
      applyDateChange({ d: 16, m: 11, y: 2025 }, { y: 2026 }, today).value,
      '2026-11-16',
    );
  });
});
