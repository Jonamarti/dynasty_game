export interface FullCheckCommand {
  name: string;
  args: string[];
}

export interface FullCheckResult {
  name: string;
  exitCode: number;
}

export interface FullCheckSummary {
  exitCode: number;
  results: FullCheckResult[];
}

export const FULL_CHECK_COMMANDS: FullCheckCommand[] = [
  { name: 'typecheck', args: ['run', 'typecheck'] },
  { name: 'unit', args: ['test', '--', '--maxWorkers=1', '--testTimeout=15000'] },
  { name: 'matrix', args: ['run', 'sim:check:all', '--', '--slow'] },
  { name: 'e2e', args: ['run', 'e2e'] },
];

/** Return an invocation-specific copy so adding matrix output never mutates the default gate. */
export function fullCheckCommands(matrixJsonPath?: string): FullCheckCommand[] {
  const commands = FULL_CHECK_COMMANDS.map((command) => ({ ...command, args: [...command.args] }));
  if (matrixJsonPath !== undefined) {
    const matrix = commands.find((command) => command.name === 'matrix');
    if (!matrix) throw new Error('check:full matrix command is missing');
    matrix.args.push('--json', matrixJsonPath);
  }
  return commands;
}

/**
 * Run each verification layer in order, even when a completed layer exits red.
 * A spawn failure is different from a test failure: surface it immediately so
 * the user sees the broken command/setup rather than a misleading summary.
 */
export function runFullCheck(
  commands: readonly FullCheckCommand[],
  run: (command: FullCheckCommand) => number,
): FullCheckSummary {
  const results: FullCheckResult[] = [];

  for (const command of commands) {
    let exitCode: number;
    try {
      exitCode = run(command);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start ${command.name}: ${detail}`, { cause: error });
    }
    results.push({ name: command.name, exitCode });
  }

  return {
    exitCode: results.some((result) => result.exitCode !== 0) ? 1 : 0,
    results,
  };
}
