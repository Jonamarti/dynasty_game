import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const cli = resolve('node_modules/vite-node/dist/cli.mjs');

function compare(before: string, after: string) {
  return spawnSync(process.execPath, [cli, 'tools/baseline-diff.ts', '--', before, after], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10_000,
  });
}

describe('baseline diff CLI', () => {
  it('returns zero when a matrix is compared with itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dynasty-baseline-diff-'));
    try {
      const file = join(dir, 'matrix.json');
      writeFileSync(file, JSON.stringify([{ name: 'fixture', passed: ['a'], failed: [], na: ['b'] }]));
      const result = compare(file, file);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No check status changes.');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns one and names an approved check that regressed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dynasty-baseline-diff-'));
    try {
      const before = join(dir, 'before.json');
      const after = join(dir, 'after.json');
      writeFileSync(before, JSON.stringify([{
        name: 'fixture', passed: ['regresses', 'becomes-na'], failed: ['recovers'], na: ['newly-applicable'],
      }]));
      writeFileSync(after, JSON.stringify([{
        name: 'fixture', passed: ['recovers', 'newly-applicable'], failed: ['regresses'], na: ['becomes-na'],
      }]));
      const result = compare(before, after);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('fixture: passed -> failed: regresses');
      expect(result.stdout).toContain('fixture: passed -> na: becomes-na');
      expect(result.stdout).toContain('fixture: failed -> passed: recovers');
      expect(result.stdout).toContain('fixture: na -> passed: newly-applicable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
