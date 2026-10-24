import { spawnSync } from 'node:child_process';
import { fullCheckCommands, runFullCheck, type FullCheckCommand } from './check-full-runner.ts';

function matrixJsonPathFromArgs(args: string[]): string | undefined {
  if (args.length === 0) return undefined;
  if (args[0] !== '--matrix-json') {
    throw new Error(`Unknown check:full argument: ${args[0]}`);
  }
  const path = args[1];
  // Catch a missing value that would consume the next flag as a path and waste the full gate
  // before the matrix command can reject it.
  if (args.length !== 2 || typeof path !== 'string' || !path.trim() || path.startsWith('--')) {
    throw new Error('--matrix-json requires a non-empty path (not another flag) and accepts no extra arguments');
  }
  return path;
}

function npmCliPath(): string {
  // Explicit injection keeps the subprocess contract test from launching the
  // real suite through whichever npm started the parent test runner.
  const npmPath = process.env.CHECK_FULL_NPM_CLI ?? process.env.npm_execpath;
  if (!npmPath) throw new Error('Failed to start check:full: npm_execpath is unavailable');
  return npmPath;
}

function runNpmCommand(command: FullCheckCommand, npmPath: string): number {
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
  let matrixJsonPath: string | undefined;
  try {
    matrixJsonPath = matrixJsonPathFromArgs(process.argv.slice(2));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[check:full] ${detail}`);
    console.error('[check:full] usage: npm run check:full -- [--matrix-json <path>]');
    process.exitCode = 2;
    return;
  }

  const npmPath = npmCliPath();
  const summary = runFullCheck(fullCheckCommands(matrixJsonPath), (command) => runNpmCommand(command, npmPath));
  for (const result of summary.results) {
    console.log(`[check:full] ${result.name}: exit ${result.exitCode}`);
  }
  process.exitCode = summary.exitCode;
}

main();
