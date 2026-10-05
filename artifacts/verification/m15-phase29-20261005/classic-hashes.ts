import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Simulation } from '../../../src/sim/core/Simulation.ts';
import { toCheckpointRecord } from '../../../src/sim/persistence/CheckpointRecords.ts';

const results = [];
for (const seed of ['band', 'century', 'phase29-continuity']) {
  const sim = new Simulation({ seed });
  for (const tick of [0, 180, 500]) {
    while (sim.time.tick < tick) sim.step();
    results.push({ seed, tick, hash: createHash('sha256')
      .update(JSON.stringify(toCheckpointRecord(sim))).digest('hex') });
  }
}
writeFileSync(process.argv[2]!, JSON.stringify(results, null, 2) + '\n');
