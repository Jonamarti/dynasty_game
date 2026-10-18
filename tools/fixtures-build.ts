import { buildFixtureWorld, FIXTURE_RECIPES } from './fixtures.ts';
import { Simulation } from '../src/sim/core/Simulation.ts';

let failed = false;
for (const recipe of FIXTURE_RECIPES) {
  try {
    const record = buildFixtureWorld(recipe);
    const alive = Simulation.fromCheckpointRecord(record).livingPeople().length;
    console.log(`${recipe.name}: saved at tick ${record.lastAdvancedTick} (${alive} alive)`);
  } catch (error) {
    failed = true;
    console.error(error instanceof Error ? error.message : String(error));
  }
}
if (failed) process.exitCode = 1;
