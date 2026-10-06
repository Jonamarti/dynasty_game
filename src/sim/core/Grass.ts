/**
 * Grass as a layer, not as a thing.
 *
 * M15 phase 23a (M14 phase 9a). A herd that grazes needs something to graze,
 * and a meadow of entities — one per tuft — would be the largest population in
 * the world and the least interesting. So the grass is `World.grass`, one
 * height from 0 to 1 per tile, advanced once a day over the whole map: sixteen
 * thousand tiles, no entities, no spatial hash.
 *
 * ## Why a function and not a process
 *
 * **Not one draw anywhere in this file.** Growth is a pure function of the
 * tile's own ground (biome, fertility, moisture), the day's `dailyGrowth` and
 * the snow, exactly as `Soil.ts` is. Nothing here can move a seed, which is why
 * the layer lands before any reader does and the matrix stays bit-identical.
 *
 * ## What a tile can carry
 *
 * `capacity` is the tallest the sward stands where it is: all of it on open
 * grass, half in the forest's understorey (the light is the limit), a third on
 * the hills, and nothing on beach, rock or water. It is scaled by the ground —
 * a fertile, moist meadow carries about three times what a dry gravelly one
 * does, which is what makes a herd *go* somewhere rather than drift.
 *
 * ## The year
 *
 * Grass grows in the warm half of the year (`dailyGrowth`), dies back in the
 * cold half toward a stubble, and is buried by deep snow — beneath
 * `SNOW_BURY_AT` it can still be reached, above it nothing can eat it and
 * nothing grows (`Grass.reachable`). Grazing and trampling take height down
 * through `World.graze`; this file only puts it back.
 */
import type { World } from './World.ts';
import { BIOMES } from './World.ts';
import { SNOW_BURY_AT } from './Snow.ts';

/** Share of the ground's carrying capacity each biome can hold as sward. */
const BIOME_CAPACITY: Record<(typeof BIOMES)[number], number> = {
  water: 0, beach: 0, grass: 1, forest: 0.5, hills: 0.35, rock: 0, river: 0,
};

/** Fraction of the gap to capacity regrown on a day of full growth. */
export const REGROW_PER_DAY = 0.09;

/** What a cold day takes off a tile, as a fraction of what stands. */
export const DIEBACK_PER_DAY = 0.05;

/** Below this `dailyGrowth` the sward is dying back rather than growing. */
export const DORMANT_BELOW = 0.2;

/** Dead grass never goes lower than this on ground that can carry any: roots. */
export const STUBBLE = 0.04;

/** Tallest grass is only worth cutting above this. */
export const CUT_ABOVE = 0.7;

/** A scythe-stroke stops taking from a tile at this height: the rest is root. */
export const CUT_FLOOR = 0.45;

/** Height taken off the tile by one cut, and thatch got per unit of height. */
export const CUT_BITE = 0.3;
export const THATCH_PER_HEIGHT = 5;

/** Tall enough that a herd bothers with the tile. */
export const WORTH_GRAZING = 0.25;

/** The tallest the sward stands on tile `index`. A pure read of static layers. */
export function grassCapacity(world: World, index: number): number {
  const share = BIOME_CAPACITY[BIOMES[world.biome[index]!]!];
  if (share === 0) return 0;
  const ground = 0.35 + 0.65 * world.fertility[index]!;
  const wet = 0.55 + 0.45 * world.moisture[index]!;
  return Math.min(1, share * ground * wet * 1.6);
}

/**
 * The day's step over the whole map. `snowDepth` is the scalar clock from
 * `Snow.ts`; under deep snow the sward neither grows nor dies, it waits.
 */
export function advanceGrass(world: World, dailyGrowth: number, snowDepth: number): void {
  if (snowDepth >= SNOW_BURY_AT) return;
  const grass = world.grass;
  const growing = dailyGrowth >= DORMANT_BELOW;
  for (let i = 0; i < grass.length; i++) {
    const cap = world.grassCap[i]!;
    if (cap === 0) continue;
    const here = grass[i]!;
    if (growing) {
      if (here < cap) grass[i] = Math.min(cap, here + (cap - here) * REGROW_PER_DAY * dailyGrowth + 0.002);
    } else {
      const floor = Math.min(cap, STUBBLE);
      if (here > floor) grass[i] = Math.max(floor, here * (1 - DIEBACK_PER_DAY));
    }
  }
}

/** Whether the sward at a tile is under snow too deep to reach. */
export function grassBuried(snowDepth: number): boolean {
  return snowDepth >= SNOW_BURY_AT;
}
