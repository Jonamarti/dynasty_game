import { spawnSync } from 'node:child_process';
import { FULL_CHECK_COMMANDS, runFullCheck } from './check-full-runner.ts';

function npmCliPath(): string {
  // Explicit injection keeps the subprocess contract test from launching the
  // real suite through whichever npm started the parent test runner.
  const npmPath = process.env.CHECK_FULL_NPM_CLI ?? process.env.npm_execpath;
  if (!npmPath) throw new Error('Failed to start check:full: npm_execpath is unavailable');
  return npmPath;
}

function runNpmCommand(command: (typeof FULL_CHECK_COMMANDS)[number], npmPath: string): number {
  console.log(`\n[check:full] ${command.name}: npm ${command.args.join(' ')}`);
  const child = spawnSync(process.execPath, [npmPath, ...command.args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (child.error) throw child.error;
  if (child.signal) {
    console.error(`[check:full] ${command.name}: process terminated by ${child.signal}`);
  }
  return child.status ?? 1;
}

function main(): void {
  const npmPath = npmCliPath();
  const summary = runFullCheck(FULL_CHECK_COMMANDS, (command) => runNpmCommand(command, npmPath));
  for (const result of summary.results) {
    console.log(`[check:full] ${result.name}: exit ${result.exitCode}`);
  }
  process.exitCode = summary.exitCode;
}

main();
