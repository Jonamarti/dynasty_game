/**
 * Where each living or lying thing can be, as pure predicates over a tile's biome and fertility. M15 step 1a.
 *
 * Two readers need the same answer to "is this ground habitat for X?", and until now only one of them had it:
 *
 * - **the detailed generator** (`Simulation.suitsBiome`, `spawnHerds`, `spawnPredators`), which scatters a node
 *   or a herd on a random walkable tile and keeps it if the tile suits;
 * - **the resource profile** (`ResourceProfile.ts`), which has to say how much of that habitat a comarca holds
 *   *without* generating its 128 by 128 tiles.
 *
 * A second copy of the rule in the profile would drift from the first the day somebody lowers a fertility floor,
 * and the drift would read as "the compact model feeds people on ground the detailed one does not" (AGENTS.md:
 * extract a shared helper rather than write a second implementation). So the rules live here, and both import
 * them. The terrain classification (`classifyTerrain`, `classifyGeographicTerrain`) moved here for the same
 * reason: the profile has to know which relief band an elevation falls in, and it must be the band the
 * generator would paint.
 *
 * Pure, no RNG, no World import beyond the `Biome` type: safe to call from anywhere in `src/sim/`.
 */
import type { Biome } from '../core/World.ts';

/** A bush needs ground at least this fertile; below it the land carries scrub, not fruit. */
export const BUSH_FERTILITY_FLOOR = 0.3;
/** Wild cereal wants open, sunny, richer ground than a bush: the floor is higher on purpose (see `suitsBiome`). */
export const GRAIN_FERTILITY_FLOOR = 0.42;

export function berryHabitat(biome: Biome, fertility: number): boolean {
  return (biome === 'grass' || biome === 'forest') && fertility > BUSH_FERTILITY_FLOOR;
}
/** Open grass only: standing cereal under a canopy would be a stand nobody finds. */
export function grainHabitat(biome: Biome, fertility: number): boolean {
  return biome === 'grass' && fertility > GRAIN_FERTILITY_FLOOR;
}
export function flintHabitat(biome: Biome): boolean { return biome === 'hills' || biome === 'beach'; }
/** Native copper, copper and tin ore all lie in the hills. */
export function hillOreHabitat(biome: Biome): boolean { return biome === 'hills'; }
export function goldHabitat(biome: Biome): boolean { return biome === 'beach' || biome === 'hills'; }
/** Herds graze the grass and the woods. */
export function herdHabitat(biome: Biome): boolean { return biome === 'grass' || biome === 'forest'; }
/** Wolves, the bear and the lynx begin in the woods and on the hills. */
export function predatorHabitat(biome: Biome): boolean { return biome === 'forest' || biome === 'hills'; }

/** Height of the beach band above the water line, in world elevation units: random/classic 0.04, Earth 10 m. */
export function beachBandWidth(kind: 'random' | 'earth', metresPerUnit: number): number {
  return kind === 'random' ? 0.04 : 10 / metresPerUnit;
}

/** The classic island's classification (also the random map's: its relief is dimensionless and normalized). */
export function classifyTerrain(elev: number, moist: number, waterLevel: number): Biome {
  if (elev < waterLevel) return 'water';
  if (elev < waterLevel + beachBandWidth('random', 1)) return 'beach';
  if (elev > 0.78) return 'rock';
  if (elev > 0.62) return 'hills';
  return moist > 0.52 ? 'forest' : 'grass';
}

/**
 * The classification of a world built from a map. The random map reuses the classic cutoffs; Earth heights are
 * metres scaled by `metresPerUnit`, so they get explicit absolute bands (10 m beach, 500 m hills, 1500 m bare
 * rock) rather than the island's normalized ones.
 */
export function classifyGeographicTerrain(
  elev: number, moist: number, kind: 'random' | 'earth', waterLevel: number, metresPerUnit: number,
): Biome {
  if (kind === 'random') return classifyTerrain(elev, moist, waterLevel);
  const aboveSea = elev - waterLevel;
  if (aboveSea < 0) return 'water';
  if (aboveSea < beachBandWidth('earth', metresPerUnit)) return 'beach';
  if (aboveSea >= 1500 / metresPerUnit) return 'rock';
  if (aboveSea >= 500 / metresPerUnit) return 'hills';
  return moist > 0.52 ? 'forest' : 'grass';
}
