/**
 * Earthworks: ground that is moved to a plan — M15 phase 26c.
 *
 * `dig` and `pile` (26a) move earth one tile at a time, and nothing says what a
 * heap of such moves is *for*. A design says it: a pit, a ditch, a moat, a
 * mound, a bank, a canal, a terrace. This file is that vocabulary, and nothing
 * else — it draws no random number, imports no system, and reads the world only
 * through the functions it is handed.
 *
 * ## Why a design is a `Building`, as a field is
 *
 * The header of `Field.ts` makes the argument and it holds here unchanged:
 * siting, ownership, the placement refusal, the walk to the site, the picker,
 * the sponsor and the people who back a project, the save record and the map
 * pass all already exist for `Building`. A second entity would have been a
 * second planner branch and a second placement test. So a design is a
 * `BuildingDef` with `earthwork` set, and what is particular to it — the list of
 * tiles and how far each has got — hangs off `Building.earth`, the way a crop
 * hangs off `Building.crop`.
 *
 * ## Where the progress is
 *
 * On the tile, `EarthworkTile.progress`, in items of earth moved. `AGENTS.md` is
 * explicit that a long action banks its work on the thing worked on: a moat is
 * hundreds of lifts and nobody finishes one before being thirsty. Every lift is
 * written to the tile the moment it is done, so a digger stopped for a drink
 * (or killed) leaves a half-dug ditch and the next one carries on from the
 * same place. The ground itself (`World.offset`) is the second record of the
 * same work, and the two are kept in step by the one function that lifts.
 *
 * ## Order of work, and where the spoil goes
 *
 * Tiles are listed in a fixed walking order and worked nearest-first with the
 * list order as the tie-break, so a crew spreads along a ditch rather than
 * piling into one tile, and two runs choose the same tile. Earth that comes out
 * of a digging design has to go somewhere: `spoilTile` finds it a place beside
 * the work (never a tile that is itself being dug, nor under a building, nor
 * already a hole), which is what makes a ditch grow a bank without anybody
 * having ordered one. A heaping design wants earth that is not there: if the
 * hands are empty and nothing in the design is left to dig, `borrowTile` finds
 * ground near it to scrape from.
 */
import type { World } from '../core/World.ts';
import { EARTH_UNIT, PILE_TO } from '../core/Earth.ts';

/** One tile of a plan, and how much of it is done. */
export interface EarthworkTile {
  x: number;
  y: number;
  /** `dig` takes earth out of the tile, `pile` puts it on. */
  kind: 'dig' | 'pile';
  /** Items of earth (`EARTH_UNIT` high each) the design wants moved on this tile. */
  goal: number;
  /** Items moved so far by the work on this design, 0 to `goal`. Banked on every lift. */
  progress: number;
}

/** How a design lays its tiles out inside its footprint. */
export type EarthworkLayout =
  /** Every tile of the footprint, to the same depth or height. */
  | 'fill'
  /** The tiles round the edge of the footprint; what is inside is left alone. */
  | 'ring'
  /** Highest at the middle and one step lower at each tile outward: a heap. */
  | 'cone'
  /** A cut and a fill: the higher edge dug away and the lower edge built up. */
  | 'cutfill';

export interface EarthworkSpec {
  layout: EarthworkLayout;
  /** `dig` and `pile` designs are ordered by their verb; `cutfill` is worked as `dig`. */
  kind: 'dig' | 'pile';
  /** Items per tile (for a cone, at the middle). */
  depth: number;
  /** The design runs north-south: the same plan, turned, which is not a separate design to the player. */
  turned?: boolean;
  /** The id of the design this is the turned copy of. */
  turnOf?: string;
  /** Where water has to be: at one end of the line, or touching the ring. */
  water?: 'end' | 'ring';
  /** The ground has to fall away from one side to the other, by at least this many items of earth. */
  slope?: number;
}

/**
 * What a design asks for in all, from its spec and footprint alone — the figure
 * `BuildingDef.workTicks` carries for an earthwork (items of earth, not ticks),
 * so the work bar and the menu have a total before any ground is looked at.
 */
export function designTotal(spec: EarthworkSpec, width: number, height: number): number {
  switch (spec.layout) {
    case 'fill': return width * height * spec.depth;
    case 'ring': return (width * 2 + height * 2 - 4) * spec.depth;
    case 'cone': {
      let total = 0;
      const cx = (width - 1) / 2;
      const cy = (height - 1) / 2;
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          total += Math.max(2, spec.depth - Math.round(Math.abs(dx - cx) + Math.abs(dy - cy)) * 2);
        }
      }
      return total;
    }
    case 'cutfill': return (spec.turned ? height : width) * 2 * spec.depth;
  }
}

/** Items of earth in a design: the number a work bar is out of. */
export function earthworkTotal(tiles: readonly EarthworkTile[]): number {
  let total = 0;
  for (const tile of tiles) total += tile.goal;
  return total;
}

/**
 * The tiles a design makes of the ground at (x, y). The footprint is `width` by
 * `height` tiles from the top-left, as for any building. Order is the order
 * they are worked in when nobody has a nearer one: a line from the end that
 * touches water, a ring from its top-left corner round, a heap from the middle.
 */
export function earthworkTiles(
  spec: EarthworkSpec, x: number, y: number, width: number, height: number, world: World
): EarthworkTile[] {
  const out: EarthworkTile[] = [];
  const push = (dx: number, dy: number, kind: 'dig' | 'pile', goal: number): void => {
    if (goal > 0) out.push({ x: x + dx, y: y + dy, kind, goal, progress: 0 });
  };
  switch (spec.layout) {
    case 'fill': {
      const along = width >= height;
      const length = along ? width : height;
      const order = Array.from({ length }, (_, i) => i);
      // A line starts at the end that touches water, so the cut runs away from
      // the bank it is meant to fill from.
      if (spec.water === 'end' && length > 1) {
        const first = touches(world, x, y);
        const last = touches(world, x + (along ? width - 1 : 0), y + (along ? 0 : height - 1));
        if (!first && last) order.reverse();
      }
      if (width > 1 && height > 1) {
        for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) push(dx, dy, spec.kind, spec.depth);
      } else {
        for (const i of order) push(along ? i : 0, along ? 0 : i, spec.kind, spec.depth);
      }
      break;
    }
    case 'ring': {
      for (let dx = 0; dx < width; dx++) push(dx, 0, spec.kind, spec.depth);
      for (let dy = 1; dy < height; dy++) push(width - 1, dy, spec.kind, spec.depth);
      for (let dx = width - 2; dx >= 0; dx--) push(dx, height - 1, spec.kind, spec.depth);
      for (let dy = height - 2; dy >= 1; dy--) push(0, dy, spec.kind, spec.depth);
      break;
    }
    case 'cone': {
      const cx = (width - 1) / 2;
      const cy = (height - 1) / 2;
      const tiles: { dx: number; dy: number; step: number }[] = [];
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          tiles.push({ dx, dy, step: Math.round(Math.abs(dx - cx) + Math.abs(dy - cy)) });
        }
      }
      // Middle first, then outward; stable for equal steps.
      tiles.sort((a, b) => a.step - b.step || a.dy - b.dy || a.dx - b.dx);
      // Two items lower for every step out from the middle, never under two.
      for (const tile of tiles) push(tile.dx, tile.dy, 'pile', Math.max(2, spec.depth - tile.step * 2));
      break;
    }
    case 'cutfill': {
      // Rows (or columns, when turned) across the slope: the higher edge is cut
      // and the lower edge built up with what came out of it.
      const across = spec.turned ? width : height;
      const along = spec.turned ? height : width;
      const edgeHeight = (index: number): number => {
        let sum = 0;
        for (let i = 0; i < along; i++) {
          const tx = spec.turned ? x + index : x + i;
          const ty = spec.turned ? y + i : y + index;
          sum += world.heightAt(tx, ty);
        }
        return sum / along;
      };
      const firstHigher = edgeHeight(0) >= edgeHeight(across - 1);
      for (let i = 0; i < along; i++) {
        const dx0 = spec.turned ? 0 : i;
        const dy0 = spec.turned ? i : 0;
        const dx1 = spec.turned ? across - 1 : i;
        const dy1 = spec.turned ? i : across - 1;
        push(dx0, dy0, firstHigher ? 'dig' : 'pile', spec.depth);
        push(dx1, dy1, firstHigher ? 'pile' : 'dig', spec.depth);
      }
      // Dug tiles first: the fill has nothing to be built from until some is cut.
      out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'dig' ? -1 : 1));
      break;
    }
  }
  return out;
}

function touches(world: World, x: number, y: number): boolean {
  return world.inBounds(x, y) && world.isShore(x, y);
}

/**
 * How far the ground falls across a terrace footprint, in items of earth: the
 * difference between the mean height of its two edges, whichever is higher.
 * What `slope` is compared with, and what the refusal prints.
 */
export function slopeAcross(
  spec: EarthworkSpec, x: number, y: number, width: number, height: number, world: World
): number {
  const across = spec.turned ? width : height;
  const along = spec.turned ? height : width;
  const edge = (index: number): number => {
    let sum = 0;
    for (let i = 0; i < along; i++) {
      sum += spec.turned ? world.heightAt(x + index, y + i) : world.heightAt(x + i, y + index);
    }
    return sum / along;
  };
  return Math.abs(edge(0) - edge(across - 1)) / EARTH_UNIT;
}

/** Tiles of the plan still waiting for work, in plan order. */
export function pendingTiles(tiles: readonly EarthworkTile[], kind: 'dig' | 'pile'): EarthworkTile[] {
  return tiles.filter(tile => tile.kind === kind && tile.progress < tile.goal);
}

/** True when every tile has had everything asked of it. */
export function earthworkDone(tiles: readonly EarthworkTile[]): boolean {
  return tiles.every(tile => tile.progress >= tile.goal);
}

/** The pending tile nearest to a point; plan order breaks ties, so the choice is stable. */
export function nearestTile(tiles: readonly EarthworkTile[], x: number, y: number): EarthworkTile | null {
  let best: EarthworkTile | null = null;
  let bestDistance = Infinity;
  for (const tile of tiles) {
    const distance = Math.abs(tile.x - x) + Math.abs(tile.y - y);
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}

const AROUND: readonly (readonly [number, number])[] = [
  [0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1],
];

/**
 * Where a person stands to work a tile: on it if it can be walked on, else on
 * the nearest walkable neighbour (a pit past `pitDepth`, a flooded moat, is
 * worked from its rim). Null if there is nowhere to stand.
 */
export function standingFor(
  world: World, tile: { x: number; y: number }, fromX: number, fromY: number
): { x: number; y: number } | null {
  if (world.isWalkable(tile.x, tile.y)) return { x: tile.x, y: tile.y };
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const [dx, dy] of AROUND) {
    const nx = tile.x + dx;
    const ny = tile.y + dy;
    if (!world.isWalkable(nx, ny)) continue;
    const distance = Math.abs(nx - fromX) + Math.abs(ny - fromY);
    if (distance < bestDistance) {
      best = { x: nx, y: ny };
      bestDistance = distance;
    }
  }
  return best;
}

/** How far from the plan (in tiles) spoil may be heaped, and a scrape may be taken. */
export const SPOIL_REACH = 4;

/** Items a scrape for borrowed earth may take from one tile: skimmed, not dug into. */
export const BORROW_DEPTH = 2;

/**
 * Where surplus earth from a digging design goes: the nearest tile within
 * `SPOIL_REACH` of the plan that is not part of it, can be walked on, is not
 * under a building and stands below `PILE_TO` without having been dug. Null
 * means nowhere (`nowhere_to_put_the_earth`).
 */
export function spoilTile(
  world: World, plan: readonly EarthworkTile[], fromX: number, fromY: number,
  builtOn: (x: number, y: number) => boolean
): { x: number; y: number } | null {
  return nearbyTile(world, plan, fromX, fromY, builtOn,
    depth => depth <= 1e-9 && -depth < PILE_TO - 1e-9);
}

/**
 * Where earth is borrowed for a heaping design that has none: the nearest tile
 * near the plan, not part of it, that has been dug less than `BORROW_DEPTH`.
 */
export function borrowTile(
  world: World, plan: readonly EarthworkTile[], fromX: number, fromY: number,
  builtOn: (x: number, y: number) => boolean
): { x: number; y: number } | null {
  return nearbyTile(world, plan, fromX, fromY, builtOn,
    depth => depth >= -1e-9 && depth < BORROW_DEPTH * EARTH_UNIT - 1e-9);
}

function nearbyTile(
  world: World, plan: readonly EarthworkTile[], fromX: number, fromY: number,
  builtOn: (x: number, y: number) => boolean, depthOk: (depth: number) => boolean
): { x: number; y: number } | null {
  if (plan.length === 0) return null;
  const inPlan = new Set(plan.map(tile => tile.y * world.width + tile.x));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const tile of plan) {
    minX = Math.min(minX, tile.x); maxX = Math.max(maxX, tile.x);
    minY = Math.min(minY, tile.y); maxY = Math.max(maxY, tile.y);
  }
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let y = minY - SPOIL_REACH; y <= maxY + SPOIL_REACH; y++) {
    for (let x = minX - SPOIL_REACH; x <= maxX + SPOIL_REACH; x++) {
      if (!world.inBounds(x, y) || inPlan.has(y * world.width + x)) continue;
      if (!world.isWalkable(x, y)) continue;
      const biome = world.biomeAt(x, y);
      if (biome === 'water' || biome === 'rock') continue;
      if (!depthOk(world.depthDug(x, y))) continue;
      candidates.push({ x, y, d: Math.abs(x - fromX) + Math.abs(y - fromY) });
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  for (const c of candidates) if (!builtOn(c.x, c.y)) return { x: c.x, y: c.y };
  return null;
}

/**
 * Where to stand to work a tile that is going to be dug past `pitDepth`: a
 * walkable neighbour that is not itself a tile still waiting to be dug, so
 * that nobody is in the hole when it stops being ground. The nearest to the
 * person, with the order of `AROUND` as the tie-break. Null if there is none.
 */
export function standingForRim(
  world: World, tile: { x: number; y: number }, fromX: number, fromY: number,
  plan: readonly EarthworkTile[]
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const [dx, dy] of AROUND) {
    const nx = tile.x + dx;
    const ny = tile.y + dy;
    if (!world.isWalkable(nx, ny)) continue;
    if (plan.some(t => t.x === nx && t.y === ny && t.kind === 'dig' && t.progress < t.goal)) continue;
    const distance = Math.abs(nx - fromX) + Math.abs(ny - fromY);
    if (distance < bestDistance) {
      best = { x: nx, y: ny };
      bestDistance = distance;
    }
  }
  return best;
}
