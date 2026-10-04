import { Simulation } from '../../../src/sim/core/Simulation.ts';

// Fault injection lives only in this isolated test run; production code is unchanged.
const load = Simulation.fromCheckpointRecord;
Simulation.fromCheckpointRecord = (input: unknown): Simulation => {
  const sim = load(input);
  (sim as unknown as { sabotageCache: Map<number, unknown[]> }).sabotageCache = new Map();
  return sim;
};
