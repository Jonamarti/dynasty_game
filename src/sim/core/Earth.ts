/**
 * Moving earth — M15 phase 26. The numbers `dig` and `pile` share with the
 * menu and the tests, kept in one place so the three cannot drift.
 *
 * Heights are in elevation units (`world.metresPerUnit` converts: 400 m a
 * unit, so a unit of 0.0004 is 16 cm).
 */
import type { Person } from '../entities/Person.ts';
import { techPower, type Tech } from '../knowledge/Tech.ts';

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
 * entry in the tree. A shaped tool is useful only with its technique, just
 * like a weapon: its prototype and refinements belong to the person. Compare
 * effective power, not table order, so a refined pick can beat a plain spade.
 */
export const DIG_TOOLS: readonly { item: string; power: number; tech?: Tech }[] = [
  { item: 'spade', power: 3, tech: 'carpentry' },
  { item: 'antler_pick', power: 2, tech: 'bone_working' },
  { item: 'sticks', power: 1 },
];

/** The best digging tool a person is carrying, or null. */
export function digTool(person: Person): { item: string; power: number } | null {
  let best: { item: string; power: number } | null = null;
  for (const tool of DIG_TOOLS) {
    if (!person.inventory.has(tool.item)) continue;
    const technique = tool.tech ? techPower(person, tool.tech) : 1;
    if (technique <= 0) continue;
    const power = tool.power * technique;
    if (!best || power > best.power) best = { item: tool.item, power };
  }
  return best;
}

/** Called after digTool returns null: carrying an unfamiliar tool is a
 * different refusal from owning none, and must be explained as such. */
export function digToolFailure(person: Person): 'no_digging_tool' | 'dont_know_digging_tool' {
  return DIG_TOOLS.some(tool => person.inventory.has(tool.item))
    ? 'dont_know_digging_tool' : 'no_digging_tool';
}
