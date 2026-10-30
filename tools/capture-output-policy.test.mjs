import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafeCaptureEnvironment } from './capture-output-policy.mjs';

test('capture overrides reject historical paths, traversal and alternate variables', () => {
  const root = mkdtempSync(join(tmpdir(), 'dynasty-capture-policy-'));
  try {
    mkdirSync(join(root, 'artifacts', 'screenshots'), { recursive: true });
    mkdirSync(join(root, 'artifacts', 'playwright'), { recursive: true });
    assert.doesNotThrow(() => assertSafeCaptureEnvironment({
      DYNASTY_CAPTURE_DIR: 'artifacts/playwright/captures/normal',
      DYNASTY_FLOATER_SHOTS: 'artifacts/playwright/floaters',
    }, root));
    for (const value of ['artifacts/screenshots', 'artifacts/screenshots/old',
      'artifacts/playwright/../screenshots/old', 'artifacts\\screenshots\\old']) {
      assert.throws(() => assertSafeCaptureEnvironment({ DYNASTY_CAPTURE_DIR: value }, root),
        /must not point/);
    }
    assert.throws(() => assertSafeCaptureEnvironment({
      DYNASTY_FLOATER_SHOTS: 'artifacts/screenshots/floater',
    }, root), /DYNASTY_FLOATER_SHOTS/);
    symlinkSync(join(root, 'artifacts', 'screenshots'), join(root, 'artifacts', 'playwright', 'old'), 'dir');
    assert.throws(() => assertSafeCaptureEnvironment({
      DYNASTY_CAPTURE_DIR: 'artifacts/playwright/old/overwritten.png',
    }, root), /must not point/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
