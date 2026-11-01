import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkHistoricalCaptures } from './check-e2e-history.mjs';

test('historical screenshots remain unchanged through two simulated E2E runs', () => {
  const root = mkdtempSync(join(tmpdir(), 'dynasty-e2e-history-'));
  try {
    const history = join(root, 'artifacts', 'screenshots');
    mkdirSync(history, { recursive: true });
    writeFileSync(join(root, '.gitignore'), 'artifacts/\n');
    writeFileSync(join(history, 'milestone.png'), 'original');
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '-f', 'artifacts/screenshots/milestone.png'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-qm', 'initial milestone'], { cwd: root });
    const disposable = join(root, 'artifacts', 'playwright', 'captures');
    for (let run = 1; run <= 2; run++) {
      mkdirSync(join(disposable, String(run)), { recursive: true });
      writeFileSync(join(disposable, String(run), 'shot.png'), 'run-' + run);
      assert.deepEqual(checkHistoricalCaptures(root), []);
    }
    writeFileSync(join(history, 'milestone.png'), 'corrupted');
    assert.deepEqual(checkHistoricalCaptures(root), ['artifacts/screenshots/milestone.png']);
    writeFileSync(join(history, 'milestone.png'), 'original');
    writeFileSync(join(history, 'new-ignored.png'), 'unexpected');
    assert.deepEqual(checkHistoricalCaptures(root), ['artifacts/screenshots/new-ignored.png']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
