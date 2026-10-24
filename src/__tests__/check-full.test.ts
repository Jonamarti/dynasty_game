import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FULL_CHECK_COMMANDS, runFullCheck, type FullCheckCommand } from '../../tools/check-full-runner';

describe('full verification orchestration', () => {
  it('keeps the four original verification layers and their arguments', () => {
    expect(FULL_CHECK_COMMANDS).toEqual([
      { name: 'typecheck', args: ['run', 'typecheck'] },
      { name: 'unit', args: ['test', '--', '--maxWorkers=1', '--testTimeout=15000'] },
      { name: 'matrix', args: ['run', 'sim:check:all', '--', '--slow'] },
      { name: 'e2e', args: ['run', 'e2e'] },
    ]);
  });

  it('runs every verification layer serially even when an earlier layer fails', () => {
    const calls: string[] = [];
    let active = false;
    const commands: FullCheckCommand[] = [
      { name: 'typecheck', args: ['run', 'typecheck'] },
      { name: 'unit', args: ['run', 'test'] },
      { name: 'matrix', args: ['run', 'sim:check:all', '--', '--slow'] },
      { name: 'e2e', args: ['run', 'e2e'] },
    ];

    const result = runFullCheck(commands, (command) => {
      expect(active).toBe(false);
      active = true;
      calls.push(command.name);
      active = false;
      return command.name === 'matrix' ? 1 : 0;
    });

    expect(calls).toEqual(['typecheck', 'unit', 'matrix', 'e2e']);
    expect(result.exitCode).toBe(1);
    expect(result.results.map(({ name, exitCode }) => [name, exitCode])).toEqual([
      ['typecheck', 0],
      ['unit', 0],
      ['matrix', 1],
      ['e2e', 0],
    ]);
  });

  it('retains a non-zero result if any layer fails', () => {
    const commands: FullCheckCommand[] = [
      { name: 'typecheck', args: ['run', 'typecheck'] },
      { name: 'unit', args: ['run', 'test'] },
      { name: 'matrix', args: ['run', 'sim:check:all', '--', '--slow'] },
      { name: 'e2e', args: ['run', 'e2e'] },
    ];
    const result = runFullCheck(commands, (command) => command.name === 'unit' ? 7 : 0);

    expect(result.exitCode).toBe(1);
  });

  it('propagates a process startup error with the command name', () => {
    const commands: FullCheckCommand[] = [
      { name: 'typecheck', args: ['run', 'typecheck'] },
    ];
    const startupError = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });

    expect(() => runFullCheck(commands, () => { throw startupError; }))
      .toThrow('Failed to start typecheck: spawn ENOENT');
  });

  it('launches every layer through the actual vite-node CLI with the npm stub', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'check-full-cli-'));
    const callLog = join(scratch, 'calls.jsonl');
    try {
      const stubNpm = join(scratch, 'stub-npm.cjs');
      writeFileSync(stubNpm, [
        "const fs = require('node:fs');",
        "const args = process.argv.slice(2);",
        "fs.appendFileSync(process.env.CHECK_FULL_CALL_LOG, JSON.stringify(args) + '\\n');",
        "if (args.includes('sim:check:all')) process.exitCode = 1;",
      ].join('\n'));
      const result = spawnSync(process.execPath, [
        resolve(process.cwd(), 'node_modules/vite-node/dist/cli.mjs'),
        resolve(process.cwd(), 'tools/check-full.ts'),
      ], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          CHECK_FULL_NPM_CLI: stubNpm,
          CHECK_FULL_CALL_LOG: callLog,
        },
        timeout: 10000,
        windowsHide: true,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      const calls = readFileSync(callLog, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
      expect(calls).toEqual(FULL_CHECK_COMMANDS.map((command) => command.args));
      expect(result.stdout).toContain('[check:full] e2e: exit 0');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
