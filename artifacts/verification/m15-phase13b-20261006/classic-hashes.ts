import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Simulation } from '../../../src/sim/core/Simulation.ts';
import { toCheckpointRecord } from '../../../src/sim/persistence/CheckpointRecords.ts';

// 13b adds one config field, which is part of the checkpoint record by design.
// Strip it so the hash compares everything else; the 13a build has no such field.
function withoutNewConfig(record: any) {
  delete record.config.knowledge.craftDifficulty;
  return record;
}

const results = [];
for (const seed of ['band', 'century', 'phase13a']) {
  const sim = new Simulation({ seed });
  for (const tick of [0, 180, 500, 1500]) {
    while (sim.time.tick < tick) sim.step();
    results.push({ seed, tick, hash: createHash('sha256')
      .update(JSON.stringify(withoutNewConfig(toCheckpointRecord(sim)))).digest('hex') });
  }
}
writeFileSync(process.argv[2]!, JSON.stringify(results, null, 2) + '\n');
