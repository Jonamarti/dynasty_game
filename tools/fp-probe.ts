// Temporary probe: where does the band seed-1 checkpoint diverge between runtimes?
import { Simulation } from '../src/sim/core/Simulation.ts';
import { SCENARIOS } from './simcheck.ts';
import { toCheckpointRecord } from '../src/sim/persistence/CheckpointRecords.ts';
import { checkpointFingerprint } from './checkpoint-fingerprint.ts';
const scenario = SCENARIOS.band!;
const config = { ...scenario.config, seed: '1' };
const sim = scenario.create?.(config) ?? new Simulation(config);
scenario.setup?.(sim);
if (!sim.player) sim.headlessFocusBand ??= sim.livingPeople()[0]?.bandId ?? null;
const marks = new Set([0, 1, 2, 3, 5, 8, 13, 20, 35, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000]);
const out: string[] = [];
for (let step = 0; step <= 3000; step++) {
  if (marks.has(step)) {
    const rec = toCheckpointRecord(sim) as Record<string, unknown>;
    const parts = Object.keys(rec).sort().map(k => k + '=' + checkpointFingerprint(rec[k])).join(' ');
    out.push(step + ' ' + checkpointFingerprint(rec) + ' | ' + parts);
  }
  if (step < 3000) sim.step();
}
console.log(out.join('\n'));
const s = ['a_b', 'ab', 'a-b', 'aB', 'Ab', 'a1', 'a:b', 'a b', 'a.b', 'é', 'z'];
console.log('locale', Intl.Collator().resolvedOptions().locale, process.versions.icu, JSON.stringify([...s].sort((a, b) => a.localeCompare(b))));
