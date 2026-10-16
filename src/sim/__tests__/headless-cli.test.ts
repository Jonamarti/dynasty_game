import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../../tools/simcheck.ts';

describe('headless scenario CLI', () => {
  it('runs tiny for its configured steps when the scenario flag is forwarded', () => {
    const cli = resolve('node_modules/vite-node/dist/cli.mjs');
    const result = spawnSync(process.execPath, [
      cli,
      'tools/headless.ts',
      '--',
      '--scenario', 'tiny',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 30_000,
    });

    // `tiny` has inherited red health checks, so the CLI can exit 1 even when
    // it ran correctly. The contract here is that the requested scenario ran
    // for its configured horizon instead of reporting zero steps / all n/a.
    expect(result.error).toBeUndefined();
    expect(result.stdout).toContain('scenario "tiny"');
    expect(result.stdout).toMatch(new RegExp(`^${SCENARIOS.tiny!.steps} steps in `, 'm'));
  });
});
