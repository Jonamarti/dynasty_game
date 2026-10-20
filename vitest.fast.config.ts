import { defineConfig } from 'vitest/config';

/** A small, explicit rules/determinism gate. `npm test` still runs every integration replay.
 * Keep worlds/cohorts out: rebuilding them per edit caused a 15-minute loop. */
export default defineConfig({
  test: {
    include: [
      'src/sim/__tests__/spatial.test.ts',
      'src/sim/__tests__/determinism.test.ts',
      'src/sim/__tests__/carry.test.ts',
      'src/sim/ai/__tests__/FoodChoice.test.ts',
      'src/sim/__tests__/profile-stats.test.ts',
      'src/sim/__tests__/baseline-diff.test.ts',
      'src/sim/__tests__/scenario-matrix.test.ts',
      'src/sim/__tests__/scenario-selection.test.ts',
      'src/render/__tests__/pixel-cache.test.ts',
    ],
    maxWorkers: 1,
  },
});
