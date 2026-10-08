/**
 * Moving earth — M15 phase 26. The numbers `dig` and `pile` share with the
 * menu and the tests, kept in one place so the three cannot drift.
 *
 * Heights are in elevation units (`world.metresPerUnit` converts: 400 m a
 * unit, so a unit of 0.0004 is 16 cm).
 */
import type { Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';
import type { World } from './World.ts';
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
  // M15 phase 37: "the bronze tools dig at five times" (26b), a stick's one.
  { item: 'bronze_spade', power: 5, tech: 'bronze_tools' },
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

/**
 * How many items of earth deep the fertile layer lies: the first 32 cm. Only
 * these lifts carry the tile's humus and nutrient up with them; below it is
 * subsoil, which carries none (M15 phase 26a, "digging removes the fertile
 * layer and leaves the subsoil").
 */
export const TOPSOIL_ITEMS = 2;

/** Moisture at or above which the subsoil is wet (the wettest tenth of the land). Shores always are. */
export const WET_SUBSOIL = 0.7;

/** Whether a tile's subsoil is wet enough that digging below the topsoil brings up mud, not earth. */
export function isWetSubsoil(world: World, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!world.inBounds(tx, ty)) return false;
  return world.isShore(tx, ty) || world.moisture[world.index(tx, ty)]! >= WET_SUBSOIL;
}

/**
 * What the next lift out of a tile brings up, and how many items of it at
 * most. A lift never straddles the topsoil boundary, so each lift is one kind:
 * `earth` through the fertile layer (and everywhere that is dry), `mud` below
 * it where the subsoil is wet. A heap (negative depth) is loose earth.
 */
export function liftKind(world: World, x: number, y: number, depth: number): { item: 'earth' | 'mud'; topsoil: boolean; limit: number } {
  const dugItems = Math.max(0, Math.round(depth / EARTH_UNIT));
  if (depth < -1e-9) return { item: 'earth', topsoil: false, limit: LIFT };
  if (dugItems < TOPSOIL_ITEMS) return { item: 'earth', topsoil: true, limit: Math.min(LIFT, TOPSOIL_ITEMS - dugItems) };
  return { item: isWetSubsoil(world, x, y) ? 'mud' : 'earth', topsoil: false, limit: LIFT };
}

/**
 * What stops this person working an earthwork at all, before any ground is
 * looked at: the tool. A digging design needs one; a heaping design needs
 * earth in the hands or a tool to scrape some up. Null means they can start.
 * One answer for the order, the menu and the scorer, so that a person is never
 * sent to a ditch they have nothing to cut it with.
 */
export function earthworkWorkRefusal(
  person: Person, site: Building
): 'no_digging_tool' | 'dont_know_digging_tool' | null {
  const tiles = site.earth ?? [];
  const digs = tiles.some(tile => tile.kind === 'dig' && tile.progress < tile.goal);
  const heaps = tiles.some(tile => tile.kind === 'pile' && tile.progress < tile.goal);
  if (digTool(person)) return null;
  if (!digs && heaps && person.inventory.count('earth') > 0) return null;
  return digToolFailure(person);
}

/** Exposed freshwater sediment, excluding salt coasts and clipped map edges.
 * A bank lift yields mud immediately; ordinary inland digging keeps its humus
 * layer. Both bank their finite progress in the same terrain offset. */
export function canDigBankMud(world: World, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!world.inBounds(tx, ty) || !world.isWalkable(tx, ty) || world.isWater(tx, ty) || world.biomeAt(tx, ty) === 'rock') return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
    world.inBounds(tx + dx!, ty + dy!) && world.isFreshWater(tx + dx!, ty + dy!));
}
