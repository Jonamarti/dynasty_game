import type { WorldRaster } from '../src/sim/world/WorldBinary.ts';
import { PeopleWorld as GamePeopleWorld, gridFromRaster, type PeopleWorldOptions } from '../src/sim/world/PeopleWorld.ts';

/**
 * The tool-side face of the world of peoples (phase 32c cohort gates and `world:bench`). The model itself moved to
 * `src/sim/world/PeopleWorld.ts` in phase 33a, because the game seeds the same world; this wrapper keeps the tools' constructor
 * (a raster and a seed) and their seeding exactly as measured (`game` stays off: flat 24-48 founders, neutral culture, every
 * event tracked), so every number in docs/m15_phase32c_peoples.md still reproduces.
 */
export {
  STARTING_TECHS, PEOPLES_PER_REGION, FOUNDERS, CONTACT_SAME_REGION, CONTACT_ADJACENT, REGION_GROUND,
  WORLD_CLOCK, STEPS_PER_SEASON, TECH_COUNT, isWorldHabitable, foundingCohorts,
  type WorldRegionInfo, type PeopleWorldStats,
} from '../src/sim/world/PeopleWorld.ts';

export class PeopleWorld extends GamePeopleWorld {
  constructor(raster: WorldRaster, seed: string, mechanisms: Pick<PeopleWorldOptions, 'union' | 'contact'> = {}) {
    super(gridFromRaster(raster), seed, mechanisms);
  }
}
