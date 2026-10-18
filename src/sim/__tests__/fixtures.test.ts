import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { checkpointFingerprint } from '../../../tools/checkpoint-fingerprint.ts';
import { loadWorld } from '../../../tools/fixtures.ts';

const roots: string[] = [];
function temporaryWorlds(): string {
  const root = mkdtempSync(join(tmpdir(), 'dynasty-world-fixtures-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('saved fixture worlds', () => {
  it('loads the same world twice and advances to the same checkpoint', () => {
    const worlds = temporaryWorlds();
    const first = loadWorld('after_first_winter', undefined, worlds);
    const switched = loadWorld('after_first_winter', { motivation: { nightSleep: false } }, worlds);
    const second = loadWorld('after_first_winter', undefined, worlds);
    expect(switched.config.motivation.nightSleep).toBe(false);
    expect(second.config.motivation.nightSleep).toBe(true);
    for (let step = 0; step < 200; step++) {
      first.step();
      second.step();
    }
    expect(checkpointFingerprint(toCheckpointRecord(first)))
      .toBe(checkpointFingerprint(toCheckpointRecord(second)));
  }, 120_000);

  it('rebuilds a missing world or one with a stale key', () => {
    const worlds = temporaryWorlds();
    const first = loadWorld('after_first_winter', undefined, worlds);
    const expected = checkpointFingerprint(toCheckpointRecord(first));
    writeFileSync(join(worlds, 'after_first_winter.key'), 'stale-key\n', 'utf8');
    const refreshed = loadWorld('after_first_winter', undefined, worlds);
    expect(checkpointFingerprint(toCheckpointRecord(refreshed))).toBe(expected);
    unlinkSync(join(worlds, 'after_first_winter.json'));

    const rebuilt = loadWorld('after_first_winter', undefined, worlds);
    expect(checkpointFingerprint(toCheckpointRecord(rebuilt))).toBe(expected);
  }, 120_000);
});
