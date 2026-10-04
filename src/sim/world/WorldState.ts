import { Simulation } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';
import type { DeepPartial, SimConfig } from '../core/Config.ts';
import { legacyIslandGeography } from './WorldGeography.ts';

/**
 * The browser's world root. This first integration deliberately constructs only
 * legacyIsland: offering geographic starts before World can consume their
 * terrain/resource profiles would label an ordinary island as the real Earth.
 * Standalone Simulation remains the reference used by the headless harness.
 */
export class WorldState {
  readonly geography = legacyIslandGeography();
  readonly ids = new IdSpace();
  readonly current: Simulation;

  constructor(config: DeepPartial<SimConfig> = {}) {
    // Pass the root's allocator without deriving the starting seed or drawing
    // geographic RNG: classic worlds must retain every original spawn and fork.
    this.current = new Simulation(config, this.ids);
  }
}
