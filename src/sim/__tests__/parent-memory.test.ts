import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { makeConfig } from '../core/Config.ts';
import { lastScores } from '../ai/Brain.ts';

/**
 * M15 phase 11d. A starving parent who remembers food beyond their usual
 * range must be able to go for it.
 *
 * Two rules stood in the way, and the first sat dormant for three milestones:
 * `collectKnownNodes` gave anybody with a living child no remembered places
 * at all, and it filtered the rest by the anchor's reach even for the
 * desperate caller that had asked for no reach. `BrainContext.peopleById` was
 * never passed, so the parent rule never fired; the moment it was passed,
 * nursing mothers in `lean` died at more than twice the rate. This pins both.
 */
describe('a starving parent and remembered food', () => {
  it('scores foraging at a remembered bush outside both sight and reach', () => {
    const sim = new Simulation(makeConfig({
      seed: 'parent-memory',
      world: { width: 128, height: 128 },
      population: { bands: 1, peoplePerBand: 4 },
      // A small range, so "outside reach" does not depend on where the camp
      // happened to be placed.
      motivation: { reachAdult: 4, parentReach: 4 },
    }));
    const parent = sim.people.find(p => !p.isPlayer && !p.isChild)!;
    const child = sim.people.find(p => p !== parent)!;
    if (!parent.childIds.includes(child.id)) parent.childIds.push(child.id);

    // Nothing to eat anywhere but one bush, remembered, far from everybody.
    const bush = sim.nodes.find(n => n.kind === 'berries')!;
    for (const node of sim.nodes) if (node !== bush) node.amount = 0;
    for (const tree of sim.trees) { tree.standing = false; tree.fruit = 0; }
    for (const animal of sim.animals) animal.alive = false;
    const far = [...Array(128 * 128).keys()]
      .map(i => ({ x: i % 128, y: Math.floor(i / 128) }))
      .find(p => sim.world.isWalkable(p.x, p.y) && sim.world.sameRegion(parent.x, parent.y, p.x, p.y) &&
        Math.hypot(p.x - parent.x, p.y - parent.y) > 30 &&
        sim.people.every(o => Math.hypot(p.x - o.x, p.y - o.y) > 25))!;
    expect(far).toBeDefined();
    bush.x = far.x;
    bush.y = far.y;
    bush.amount = bush.def.maxAmount;
    sim.nodeHash.rebuild(sim.nodes);
    parent.placeMemory.remember('resource:berries', bush.x, bush.y, sim.time.day, 2);

    for (const [id, count] of parent.inventory.entries()) parent.inventory.remove(id, count);
    parent.needs.hunger = 80;
    parent.needs.thirst = 0;
    parent.needs.cold = 0;
    parent.order = null;
    parent.action = 'idle';
    for (let i = 0; i < 12; i++) {
      parent.needs.hunger = 80;
      sim.step();
    }
    expect(lastScores.get(parent.id)?.some(row => row.id === 'forage')).toBe(true);
  });
});
