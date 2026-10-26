import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const cli = resolve('node_modules/vite-node/dist/cli.mjs');

function compare(before: string, after: string, extra: string[] = []) {
  return spawnSync(process.execPath, [cli, 'tools/baseline-diff.ts', '--', before, after, ...extra], {
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
  it('rejects missing scenarios, missing checks, and unexpected failed checks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dynasty-coverage-'));
    try {
      const before = join(dir, 'before.json');
      const after = join(dir, 'after.json');
      const baseline = [
        { name: 'one', passed: ['stable'], failed: ['inherited'], na: ['inactive'] },
        { name: 'two', passed: ['ok'], failed: [], na: [] },
      ];
      writeFileSync(before, JSON.stringify(baseline));
      for (const [rows, message] of [
        [[baseline[0]], 'Missing scenario: two'],
        [[{ ...baseline[0], passed: [] }, baseline[1]], 'Missing check: one/stable'],
        [[{ ...baseline[0], failed: ['inherited', 'new-bug'] }, baseline[1]], 'Unexpected check'],
        [[...baseline, { name: 'three', passed: [], failed: [], na: [] }], 'Unexpected scenario'],
      ] as const) {
        writeFileSync(after, JSON.stringify(rows));
        const result = compare(before, after);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain(message);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an NA to FAIL regression and preserves known baseline failures', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dynasty-transition-'));
    try {
      const before = join(dir, 'before.json');
      const after = join(dir, 'after.json');
      const baseline = [{ name: 'one', passed: [], failed: ['known'], na: ['inactive'] }];
      writeFileSync(before, JSON.stringify(baseline));
      writeFileSync(after, JSON.stringify(baseline));
      expect(compare(before, after).status).toBe(0);
      writeFileSync(after, JSON.stringify([{ name: 'one', passed: [], failed: ['known', 'inactive'], na: [] }]));
      expect(compare(before, after).status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('checks that a shard contains exactly its expected baseline partition', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dynasty-shard-'));
    try {
      const before = join(dir, 'before.json');
      const after = join(dir, 'after.json');
      const rows = Array.from({ length: 5 }, (_, i) => ({
        name: `case-${i}`, passed: ['healthy'], failed: [], na: [],
      }));
      writeFileSync(before, JSON.stringify(rows));
      writeFileSync(after, JSON.stringify([rows[0], rows[2], rows[4]]));
      expect(compare(before, after, ['--shard', '1/2']).status).toBe(0);
      expect(compare(before, after, ['--shard', '2/2']).status).toBe(2);
      writeFileSync(after, JSON.stringify([rows[0], rows[4]]));
      const missing = compare(before, after, ['--shard', '1/2']);
      expect(missing.status).toBe(2);
      expect(missing.stderr).toContain('Missing scenario: case-2');
      expect(compare(before, after, ['--shard', '0/2']).status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

});
