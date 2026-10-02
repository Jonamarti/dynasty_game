/**
 * Moving earth — M15 phase 26. The numbers `dig` and `pile` share with the
 * menu and the tests, kept in one place so the three cannot drift.
 *
 * Heights are in elevation units (`world.metresPerUnit` converts: 400 m a
 * unit, so a unit of 0.0004 is 16 cm).
 */
import type { Person } from '../entities/Person.ts';

/** Height one item of earth is, over one tile: what a dig takes and a pile puts. */
export const EARTH_UNIT = 0.0004;

/**
 * How deep a single hole is dug before the digger moves on or stops: 1.3 m
 * (eight items of earth, 0.0032 u), a trench a person can still climb out of. `dig` stops here;
 * the deeper holes that `world.pitDepth` makes unwalkable are for the designs
 * of the next commit (a pit, a moat), which dig a tile through several orders.
 */
export const DIG_TO = 8 * EARTH_UNIT;

/** Ticks one lift of earth takes at skill 1 with a digging stick. */
export const DIG_TICKS = 28;

/** Ticks one lift takes to set down, and the most a mound stands above its footing (see `PILE_TO`). */
export const PILE_TICKS = 16;

/** The tallest a heap is piled on one tile: 1.3 m (eight items of earth, 0.0032 u), as deep as `DIG_TO`. */
export const PILE_TO = 8 * EARTH_UNIT;

/** How many items of earth one lift fills the hands with, at a stick's 1×. */
export const LIFT = 2;

/**
 * What a person digs with, best first: the multiplier on the digging speed and the item
 * that gives it. A bare stick of wood is the digging stick of the Palaeolithic
 * and needs no technology — hardening the point in a fire is older than any
 * entry in the tree. The antler pick and the spade (phases 26b onward) are
 * added here, each with the technology that makes it and the verb that reads
 * it, so none is declared ahead of its reader.
 */
export const DIG_TOOLS: readonly { item: string; power: number }[] = [
  { item: 'sticks', power: 1 },
];

/** The best digging tool a person is carrying, or null. */
export function digTool(person: Person): { item: string; power: number } | null {
  let best: { item: string; power: number } | null = null;
  for (const tool of DIG_TOOLS) {
    if (person.inventory.count(tool.item) > 0 && (!best || tool.power > best.power)) best = tool;
  }
  return best;
}
