/**
 * M9.5 phase 2b: snow depth advancing and burying ground-level goods.
 */
import { describe, it, expect } from 'vitest';
import { advanceSnowDepth, isBuried, SNOW_MAX_DEPTH, FREEZE_AT } from '../core/Snow.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { Tree } from '../entities/Tree.ts';
import { Simulation } from '../core/Simulation.ts';

describe('advanceSnowDepth', () => {
  it('accumulates below freezing and caps at SNOW_MAX_DEPTH', () => {
    let depth = 0;
    for (let i = 0; i < 20; i++) depth = advanceSnowDepth(depth, FREEZE_AT - 1);
    expect(depth).toBe(SNOW_MAX_DEPTH);
  });

  it('melts a step at a time once it is above freezing', () => {
    // A mild freeze (a small margin under FREEZE_AT) is a light one-step
    // fall, so a single melt afterwards clears it exactly, rather than
    // needing to know how many steps a harder freeze piled up.
    let depth = advanceSnowDepth(0, FREEZE_AT - 0.05);
    expect(depth).toBe(1);
    depth = advanceSnowDepth(depth, 0.5);
    expect(depth).toBe(0);
  });

  it('a harder freeze falls heavier than a mild one', () => {
    const mild = advanceSnowDepth(0, FREEZE_AT - 0.05);
    const hard = advanceSnowDepth(0, FREEZE_AT - 1);
    expect(hard).toBeGreaterThan(mild);
  });
});

describe('isBuried', () => {
  const emptyTrees = new SpatialHash<Tree>(8);

  it('nothing is buried while there is no snow', () => {
    expect(isBuried(10, 10, 0, emptyTrees)).toBe(false);
  });

  it('deep snow in the open buries the ground, regardless of tile jitter', () => {
    // At the maximum depth with no shelter, even the least favourable jitter
    // (-0.5) still clears SNOW_BURY_AT (2): 3 - 0.5 = 2.5.
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        expect(isBuried(x, y, SNOW_MAX_DEPTH, emptyTrees)).toBe(true);
      }
    }
  });

  it("a standing tree's canopy shelters the ground under it by a full step", () => {
    const trees = new SpatialHash<Tree>(8);
    const shelter = new Tree('oak', 10, 10, 30 * 80); // long mature, not a seedling
    trees.insert(shelter);

    // Depth 2 in the open straddles the bury threshold depending on tile
    // jitter (local = 1.5-2.5), but a full step of shelter always keeps the
    // sheltered point under it (local = 0.5-1.5) regardless of jitter.
    expect(isBuried(10, 10, 2, trees)).toBe(false);
    // Far enough away that the tree's shelter radius does not reach it: the
    // depth proven to bury the open ground unconditionally, above.
    expect(isBuried(20, 20, SNOW_MAX_DEPTH, trees)).toBe(true);
  });
});

describe('Simulation.isBuried and the refusal it produces', () => {
  const SMALL = {
    seed: 'snow',
    world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
    population: { bands: 1, peoplePerBand: 6 },
  };

  it('an order aimed at a buried ground-level node is refused, by name', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    const node = sim.nodes.find(n => n.def.groundLevel && !n.depleted)!;
    person.x = node.x;
    person.y = node.y;
    // A standing tree's canopy sheds a full step of depth (see `isBuried`
    // above), which this test is not about — cleared so burial here depends
    // only on `snowDepth`.
    sim.treeHash.rebuild([]);
    sim.snowDepth = SNOW_MAX_DEPTH;

    const ok = sim.order(person, 'gather', { nodeId: node.id });

    expect(ok).toBe(false);
    expect(sim.lastRefusal).toBe('it is under the snow');
  });

  it('the config.world.snowBuries flag is the one-line switch that turns burial off', () => {
    const sim = new Simulation({ ...SMALL, world: { ...SMALL.world, snowBuries: false } });
    for (let i = 0; i < 50; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    const node = sim.nodes.find(n => n.def.groundLevel && !n.depleted)!;
    person.x = node.x;
    person.y = node.y;
    sim.treeHash.rebuild([]);
    sim.snowDepth = SNOW_MAX_DEPTH;

    expect(sim.isBuried(node.x, node.y)).toBe(false);
    expect(sim.order(person, 'gather', { nodeId: node.id })).toBe(true);
  });

  it('a buried pile or node comes back on its own once the snow melts', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const node = sim.nodes.find(n => n.def.groundLevel)!;
    sim.treeHash.rebuild([]);
    sim.snowDepth = SNOW_MAX_DEPTH;
    expect(sim.isBuried(node.x, node.y)).toBe(true);
    sim.snowDepth = 0;
    expect(sim.isBuried(node.x, node.y)).toBe(false);
  });
});
