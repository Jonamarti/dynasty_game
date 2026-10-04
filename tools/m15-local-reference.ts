import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { toCheckpointRecord } from '../src/sim/persistence/CheckpointRecords.ts';

// Compare complete classic JSON state across builds, rather than two seeded
// runs of the same implementation, which cannot detect moved stream draws.
const rows = ['band', 'tour', 'm15-classic-reference'].map(seed => {
  const sim = new Simulation({ seed, time: { ticksPerDay: 60 } });
  const digest = () => createHash('sha256').update(JSON.stringify(toCheckpointRecord(sim))).digest('hex');
  const initial = digest();
  for (let tick = 0; tick < 180; tick++) sim.step();
  return { seed, initial, after180: digest() };
});
writeFileSync(process.argv[2]!, JSON.stringify(rows, null, 2) + '\n');
console.log(rows);
