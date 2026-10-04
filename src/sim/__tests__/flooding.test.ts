/**
 * The water follows the trench (M15 phase 26d): ground dug below the water
 * level next to water fills, the fill runs along connected dug ground, and the
 * shore list and landmass labels stay true to a full recomputation.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { World } from '../core/World.ts';
import { EARTH_UNIT } from '../core/Earth.ts';
import { auditRegions } from '../../../tools/regions.ts';

/** Shore tiles low enough that a 1.3 m dig takes them under the water. */
function lowShore(world: World, count: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const t of world.shoreTiles) {
    const e = world.elevation[world.index(t.x, t.y)]!;
    if (e - world.waterLevel < 6 * EARTH_UNIT && world.biomeAt(t.x, t.y) !== 'rock') out.push(t);
    if (out.length >= count) break;
  }
  return out;
}

/** The shore list rebuilt from scratch, the way `findShores` builds it. */
function recomputedShore(world: World): Set<number> {
  const set = new Set<number>();
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (world.walkable[world.index(x, y)] === 1 && world.isShore(x, y)) set.add(world.index(x, y));
    }
  }
  return set;
}

describe('water follows the trench', () => {
  it('fills a tile dug below the water level beside water, and only then', () => {
    const sim = new Simulation({ seed: 'flood' });
    const w = sim.world;
    const [t] = lowShore(w, 1);
    expect(t).toBeDefined();
    // Not deep enough: stays land.
    const gap = w.elevation[w.index(t!.x, t!.y)]! - w.waterLevel;
    w.dig(t!.x, t!.y, Math.max(0, gap - 1e-4));
    expect(w.isWater(t!.x, t!.y)).toBe(false);
    w.dig(t!.x, t!.y, 3e-4);
    expect(w.isWater(t!.x, t!.y)).toBe(true);
    expect(w.isWalkable(t!.x, t!.y)).toBe(false);
  });

  it('does not flood dug ground that is inland, nor ground still above the level', () => {
    const sim = new Simulation({ seed: 'flood' });
    const w = sim.world;
    let inland: { x: number; y: number } | null = null;
    for (let y = 0; y < w.height && !inland; y++) {
      for (let x = 0; x < w.width && !inland; x++) {
        const k = w.index(x, y);
        if (w.walkable[k] === 1 && !w.isShore(x, y) && w.elevation[k]! - w.waterLevel < 4 * EARTH_UNIT
          && w.biomeAt(x, y) !== 'rock') inland = { x, y };
      }
    }
    if (!inland) return;
    w.dig(inland.x, inland.y, 6 * EARTH_UNIT);
    expect(w.isWater(inland.x, inland.y)).toBe(false);
  });

  it('runs along a connected trench, bounded, leaving shore list and regions true', () => {
    const sim = new Simulation({ seed: 'flood' });
    const w = sim.world;
    // A straight trench of dug tiles leading away from a low shore tile.
    for (const start of lowShore(w, 100000)) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const line: { x: number; y: number }[] = [start];
        for (let i = 1; i < 3; i++) {
          const nx = start.x + dx * i, ny = start.y + dy * i;
          if (!w.isWalkable(nx, ny) || w.biomeAt(nx, ny) === 'rock') break;
          line.push({ x: nx, y: ny });
        }
        if (line.length < 3) continue;
        // Natural beaches climb about 4 m a tile, too steep for a 1.3 m trench to follow;
        // level a marsh under the line so the fill has somewhere to go.
        for (const tile of line) w.elevation[w.index(tile.x, tile.y)] = w.waterLevel + 3 * EARTH_UNIT;
        // Dig the far end first: it is dry and stays so until the water reaches it.
        for (const tile of [...line].reverse()) w.dig(tile.x, tile.y, 7 * EARTH_UNIT);
        for (const tile of line) expect(w.isWater(tile.x, tile.y)).toBe(true);
        expect(auditRegions(w)).toMatchObject({ ok: true, tileErrors: 0, sizeErrors: 0 });
        const listed = new Set(w.shoreTiles.map(t => w.index(t.x, t.y)));
        expect(listed).toEqual(recomputedShore(w));
        expect(listed.size).toBe(w.shoreTiles.length);
        return;
      }
    }
    throw new Error('no straight low shore found in this seed');
  });

  it('is deterministic: two worlds dug the same way flood the same tiles', () => {
    const a = new Simulation({ seed: 'flood' }).world;
    const b = new Simulation({ seed: 'flood' }).world;
    for (const w of [a, b]) for (const t of lowShore(w, 12)) w.dig(t.x, t.y, 7 * EARTH_UNIT);
    expect(Array.from(a.biome)).toEqual(Array.from(b.biome));
    expect(a.shoreTiles).toEqual(b.shoreTiles);
  });

  it('keeps the shore hash in step with the world, so people can drink at the new bank', () => {
    const sim = new Simulation({ seed: 'flood' });
    const w = sim.world;
    const [t] = lowShore(w, 1);
    w.dig(t!.x, t!.y, 7 * EARTH_UNIT);
    sim.step();
    const near = sim.shoreHash.findNearest(t!.x + 0.5, t!.y + 0.5, 3, () => true);
    expect(near).not.toBeNull();
    expect(near && w.isWalkable(near.x, near.y)).toBe(true);
  });

  it('tells the digger the water came in, and puts them on the bank', () => {
    const sim = new Simulation({ seed: 'flood' });
    const w = sim.world;
    const person = sim.people.find(p => p.alive && !p.isChild)!;
    const t = lowShore(w, 100000).find(s => w.elevation[w.index(s.x, s.y)]! - w.waterLevel < 2 * EARTH_UNIT)
      ?? lowShore(w, 1)[0]!;
    // Level the tile so that the first lift is enough to reach the water.
    w.elevation[w.index(t.x, t.y)] = w.waterLevel + 0.5 * EARTH_UNIT;
    person.x = t.x + 0.5;
    person.y = t.y + 0.5;
    person.inventory.add('sticks', 1);
    expect(sim.order(person, 'dig', t)).toBe(true);
    for (let i = 0; i < 400 && person.action === 'dig'; i++) sim.step();
    expect(w.isWater(t.x, t.y)).toBe(true);
    expect(sim.interruptions.some(n => n.personId === person.id && n.reason === 'water_came_in')).toBe(true);
    expect(w.isWalkable(person.x, person.y)).toBe(true);
  });
  it('moves a third party and a heap off a tile that floods, and drowns what cannot move', () => {
    const sim = new Simulation({ seed: 'flood' });
    const w = sim.world;
    const t = lowShore(w, 1)[0]!;
    w.elevation[w.index(t.x, t.y)] = w.waterLevel + 0.5 * EARTH_UNIT;
    const bystander = sim.people.find(p => p.alive && !p.isChild)!;
    bystander.x = t.x + 0.5;
    bystander.y = t.y + 0.5;
    sim.dropAt(t.x, t.y, 'sticks', 3);
    const tree = sim.trees[0]!;
    (tree as { x: number }).x = t.x;
    (tree as { y: number }).y = t.y;
    sim.treeHash.rebuild(sim.trees);
    const node = sim.nodes[0]!;
    node.x = t.x;
    node.y = t.y;
    const treeId = tree.id;
    const nodeId = node.id;
    w.dig(t.x, t.y, 4 * EARTH_UNIT);
    expect(w.isWater(t.x, t.y)).toBe(true);
    sim.step();
    expect(w.isWalkable(bystander.x, bystander.y)).toBe(true);
    expect(sim.piles.every(p => w.isWalkable(p.x, p.y))).toBe(true);
    expect(sim.piles.some(p => p.contents.count('sticks') >= 3)).toBe(true);
    expect(sim.treesById.has(treeId)).toBe(false);
    expect(sim.nodesById.has(nodeId)).toBe(false);
    expect(sim.nodes.some(n => n.id === nodeId)).toBe(false);
  });

  it('does nothing at all in a world where nobody has dug', () => {
    const a = new Simulation({ seed: 'flood' });
    const b = new Simulation({ seed: 'flood' });
    for (let i = 0; i < 30; i++) { a.step(); b.step(); }
    expect(a.people.map(p => [p.x, p.y])).toEqual(b.people.map(p => [p.x, p.y]));
    expect(a.world.earthVersion).toBe(0);
  });
});

describe('digging under a building', () => {
  it('is refused with the reason, for dig and for pile', () => {
    const sim = new Simulation({ seed: 'flood' });
    const person = sim.people.find(p => p.alive && !p.isChild)!;
    person.inventory.add('sticks', 1);
    person.inventory.add('earth', 2);
    const b = sim.buildings[0] ?? sim.place('stockpile', Math.floor(person.x), Math.floor(person.y), person.bandId ?? 0, null);
    expect(b).toBeTruthy();
    const target = { x: b!.centerX, y: b!.centerY };
    expect(sim.order(person, 'dig', target)).toBe(false);
    expect(sim.lastRefusal).toBe('there is a building on that ground');
    expect(sim.order(person, 'pile', target)).toBe(false);
  });
});
