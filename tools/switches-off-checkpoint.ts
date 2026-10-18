import { Simulation } from '../src/sim/core/Simulation.ts';
import { SCENARIOS } from './simcheck.ts';
import { toCheckpointRecord } from '../src/sim/persistence/CheckpointRecords.ts';
import { checkpointFingerprint } from './checkpoint-fingerprint.ts';

export const SWITCHES_OFF_SEEDS = ['1', '2', '3'] as const;

/** Replay the ordinary `band` fixture with the same headless focus as simcheck. */
export function switchesOffFingerprints(): Record<string, string> {
  const scenario = SCENARIOS.band!;
  const fingerprints: Record<string, string> = {};
  for (const seed of SWITCHES_OFF_SEEDS) {
    const config = { ...scenario.config, seed };
    const sim = scenario.create?.(config) ?? new Simulation(config);
    scenario.setup?.(sim);
    if (!sim.player) sim.headlessFocusBand ??= sim.livingPeople()[0]?.bandId ?? null;
    for (let step = 0; step < 3000; step++) sim.step();
    fingerprints[seed] = checkpointFingerprint(toCheckpointRecord(sim));
  }
  return fingerprints;
}
