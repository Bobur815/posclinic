import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { autoScale, effectiveScale, isUiScaleChoice, readUiScale, writeUiScale } from './ui-scale';

describe('UI scale', () => {
  it('a maximised Full HD monoblock is shown at 115 %; a laptop stays at 100 %', () => {
    // 1920 x 1080 at Windows 100 %: the maximised window's content is about 1920 x 1009.
    assert.equal(autoScale(1920, 1009), 1.15);
    // The same screen at Windows 125 %: 1536 x 807 DIPs.
    assert.equal(autoScale(1536, 807), 1);
    assert.equal(autoScale(1366, 728), 1, 'never smaller than the pages were made at');
    // A 2560 x 1440 screen at 100 %.
    assert.equal(autoScale(2560, 1369), 1.4, 'capped');
    // A window made narrow on a big screen follows the window.
    assert.equal(autoScale(1700, 1009), 1.1);
    assert.equal(autoScale(0, 0), 1);
  });

  it('a manual choice wins; only the offered values are taken', () => {
    assert.equal(effectiveScale(1.25, 1366, 728), 1.25);
    assert.equal(effectiveScale('auto', 1920, 1009), 1.15);
    assert.equal(isUiScaleChoice(0.9), true);
    assert.equal(isUiScaleChoice(3), false);
    assert.equal(isUiScaleChoice('big'), false);
  });

  it('keeps the choice per PC in a small file, auto when missing or broken', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'posclinic-ui-'));
    const file = path.join(dir, 'ui-scale.json');
    try {
      assert.equal(readUiScale(file), 'auto');
      writeUiScale(file, 1.25);
      assert.equal(readUiScale(file), 1.25);
      writeFileSync(file, '{"scale": 9}');
      assert.equal(readUiScale(file), 'auto');
      writeFileSync(file, 'not json');
      assert.equal(readUiScale(file), 'auto');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
