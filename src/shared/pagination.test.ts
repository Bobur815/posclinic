import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampPage, pageCount, pageList, pageRange, pageSlice } from './pagination';

describe('pagination', () => {
  it('counts pages, at least one', () => {
    assert.equal(pageCount(0, 25), 1);
    assert.equal(pageCount(25, 25), 1);
    assert.equal(pageCount(26, 25), 2);
    assert.equal(pageCount(10, 0), 1);
  });

  it('keeps the page inside the pages', () => {
    assert.equal(clampPage(5, 3), 3);
    assert.equal(clampPage(0, 3), 1);
    assert.equal(clampPage(Number.NaN, 3), 1);
    assert.equal(clampPage(2.7, 3), 2);
  });

  it('shows every page up to 7, else 7 slots with gaps', () => {
    assert.deepEqual(pageList(1, 1), [1]);
    assert.deepEqual(pageList(3, 7), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(pageList(2, 20), [1, 2, 3, 4, 5, 'gap', 20]);
    assert.deepEqual(pageList(10, 20), [1, 'gap', 9, 10, 11, 'gap', 20]);
    assert.deepEqual(pageList(19, 20), [1, 'gap', 16, 17, 18, 19, 20]);
    for (let p = 1; p <= 20; p++) assert.equal(pageList(p, 20).length, 7);
  });

  it('slices a page and says which rows it shows', () => {
    const rows = Array.from({ length: 30 }, (_, i) => i + 1);
    assert.deepEqual(pageSlice(rows, 2, 10), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    assert.deepEqual(pageSlice(rows, 4, 10), []);
    assert.deepEqual(pageRange(3, 10, 25), { from: 21, to: 25 });
    assert.deepEqual(pageRange(1, 10, 0), { from: 0, to: 0 });
  });
});
