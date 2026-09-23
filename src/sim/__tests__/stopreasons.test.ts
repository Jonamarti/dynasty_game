/**
 * M11 phase 13f: every reason the simulation gives for stopping somebody has
 * words the player can read.
 *
 * `AGENTS.md`'s standing rule, and one this project keeps breaking the same
 * way: a new `abandon(person, 'some_reason')` lands without a line in
 * `STOP_REASONS`, and the floater prints the identifier with its underscores
 * turned into spaces. Read off the source rather than a list kept by hand,
 * because a hand-kept list is exactly the thing a new reason forgets.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STOP_REASONS, stopReasonLabel } from '../../render/Floaters.ts';

function reasonsIn(file: string): string[] {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf-8');
  const found = new Set<string>();
  for (const pattern of [
    /abandon\(\s*\w+,\s*'([a-z_]+)'/g,
    // `interruption()` returns its reason, which `stop()` hands on.
    /return '([a-z_]+)';/g,
  ]) {
    for (const match of source.matchAll(pattern)) found.add(match[1]!);
  }
  return [...found];
}

describe('stop reasons', () => {
  it('all have words, in ActionSystem', () => {
    const reasons = reasonsIn('systems/ActionSystem.ts');
    expect(reasons.length).toBeGreaterThan(20);
    const missing = reasons.filter(r => !(r in STOP_REASONS) && !r.startsWith('no_station_'));
    expect(missing).toEqual([]);
  });

  it('fall back to something readable for a whole family', () => {
    expect(stopReasonLabel('no_station_quern')).toMatch(/^there was no /);
  });
});
