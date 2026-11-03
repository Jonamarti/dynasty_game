import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveMilestone } from './archive-e2e-milestone.mjs';

test('milestone archive refuses overwrite and leaves historical bytes unchanged', () => {
  const root = mkdtempSync(join(tmpdir(), 'dynasty-milestone-'));
  try {
    const history = join(root, 'artifacts', 'screenshots');
    const captures = join(root, 'artifacts', 'playwright', 'captures', 'example');
    mkdirSync(history, { recursive: true });
    mkdirSync(captures, { recursive: true });
    const original = join(history, '2026-10-01-old', 'frame.png');
    mkdirSync(join(history, '2026-10-01-old'));
    writeFileSync(original, 'historical bytes');
    writeFileSync(join(captures, 'new.png'), 'new image bytes');
    const saved = archiveMilestone(root, 'artifacts/playwright/captures/example', '2026-10-30-new');
    assert.equal(saved.destination, 'artifacts/screenshots/2026-10-30-new');
    assert.equal(readFileSync(join(history, '2026-10-30-new', 'new.png'), 'utf8'), 'new image bytes');
    assert.equal(readFileSync(original, 'utf8'), 'historical bytes');
    assert.throws(() => archiveMilestone(root, 'artifacts/playwright/captures/example', '2026-10-30-new'), /EEXIST/);
    assert.throws(() => archiveMilestone(root, 'artifacts/screenshots/2026-10-01-old', '2026-10-31-invalid'), /inside artifacts\/playwright/);
    assert.equal(readFileSync(original, 'utf8'), 'historical bytes');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
