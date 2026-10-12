import { describe, expect, it } from 'vitest';
import { Person } from '../../sim/entities/Person.ts';
import { RNG } from '../../sim/core/RNG.ts';
import { buildingPose, cuttingGrassPose, diggingPose, extractionPose, farmingPose, fishingPose, gatheringPose, hideDressingPose, mendingPose, plantingPose } from '../WorkAnimation.ts';
import type { Simulation } from '../../sim/core/Simulation.ts';

function fixture() {
  const person = new Person('Gatherer', 4, 4, 0, new RNG('work-animation'));
  person.action = 'forage'; person.targetNodeId = 1;
  person.actionTimer = 10; person.workedTicks = 1;
  // The selector only reads these fields, not an entity's mutation methods.
  const node = { x: 4.3, y: 4, kind: 'berries', depleted: false };
  const tree = { x: 4.3, y: 4, standing: true, fruit: 3 };
  const sim = { nodesById: new Map([[1, node]]), treesById: new Map([[2, tree]]) } as unknown as Pick<Simulation, 'nodesById' | 'treesById'>;
  return { person, node, tree, sim };
}

describe('gathering animation', () => {
  it('does not mistake a tool change after an earlier pull for gathering work', () => {
    const { person, sim } = fixture();
    person.workedTicks = 3; person.actionTimer = 3; person.actionTotal = 0;
    expect(gatheringPose(person, sim, false)).toBeNull();
    person.actionTotal = 10;
    expect(gatheringPose(person, sim, false)).toBe('g1');
  });

  it('cycles four frames during work without moving the feet or advancing the simulation', () => {
    const { person, sim } = fixture();
    const frames = [1, 3, 5, 7, 9].map(ticks => {
      person.workedTicks = ticks;
      return gatheringPose(person, sim, false, 0);
    });
    expect(frames).toEqual(['g0', 'g1', 'g2', 'g3', 'g0']);
    expect(person.actionTimer).toBe(10);
    expect([person.x, person.y]).toEqual([4, 4]);
  });

  it('does not gather while travelling, blocked away from the target, or waiting to start', () => {
    const { person, sim } = fixture();
    expect(gatheringPose(person, sim, true)).toBeNull();
    person.x = 2;
    expect(gatheringPose(person, sim, false)).toBeNull();
    person.x = 4; person.actionTimer = 0;
    expect(gatheringPose(person, sim, false)).toBeNull();
    person.actionTimer = 10; person.workedTicks = 0;
    expect(gatheringPose(person, sim, false)).toBeNull();
  });

  it('stops on interruption, death, disappearance or depletion', () => {
    const { person, node, sim } = fixture();
    person.action = 'idle';
    expect(gatheringPose(person, sim, false)).toBeNull();
    person.action = 'forage'; person.alive = false;
    expect(gatheringPose(person, sim, false)).toBeNull();
    person.alive = true; node.depleted = true;
    expect(gatheringPose(person, sim, false)).toBeNull();
    node.depleted = false; sim.nodesById.clear();
    expect(gatheringPose(person, sim, false)).toBeNull();
  });

  it('uses hand gathering for plants and sticks, leaving fish, flint and clay for their own gestures', () => {
    const { person, node, sim } = fixture();
    for (const action of ['forage', 'gather'] as const) {
      person.action = action;
      for (const kind of ['berries', 'sticks', 'reeds', 'wild_grain']) {
        node.kind = kind;
        expect(gatheringPose(person, sim, false), `${action} ${kind}`).toBe('g0');
      }
      for (const kind of ['fish', 'flint', 'clay']) {
        node.kind = kind;
        expect(gatheringPose(person, sim, false)).toBeNull();
      }
    }
  });

  it('picks fruit only from a standing tree with fruit', () => {
    const { person, tree, sim } = fixture();
    person.action = 'pick'; person.targetTreeId = 2;
    expect(gatheringPose(person, sim, false)).toBe('g0');
    tree.fruit = 0;
    expect(gatheringPose(person, sim, false)).toBeNull();
    tree.fruit = 3; tree.standing = false;
    expect(gatheringPose(person, sim, false)).toBeNull();
    tree.standing = true; person.targetTreeId = null;
    expect(gatheringPose(person, sim, false)).toBeNull();
  });

  it('holds the frame while paused and interpolates only the bounded simulation fraction', () => {
    const { person, sim } = fixture();
    person.workedTicks = 2;
    expect(gatheringPose(person, sim, false, 0.5)).toBe('g0');
    expect(gatheringPose(person, sim, false, 0.5)).toBe('g0');
    expect(gatheringPose(person, sim, false, 1)).toBe('g1');
    expect(gatheringPose(person, sim, false, 50)).toBe('g1');
    expect(gatheringPose(person, sim, false, -50)).toBe('g0');
  });
});

describe('digging animation', () => {
  function digFixture() {
    const person = new Person('Digger', 4.5, 4.5, 0, new RNG('dig-animation'));
    person.action = 'dig'; person.targetX = 4; person.targetY = 4;
    person.actionTimer = 10; person.workedTicks = 1;
    const sim = { world: { biomeAt: () => 'grass' } } as unknown as Pick<Simulation, 'world'>;
    return { person, sim };
  }

  it('cycles four tool strokes from work ticks without changing the worker or world', () => {
    const { person, sim } = digFixture();
    const frames = [1, 3, 5, 7, 9].map(ticks => {
      person.workedTicks = ticks;
      return diggingPose(person, sim, false, 0);
    });
    expect(frames).toEqual(['d0', 'd1', 'd2', 'd3', 'd0']);
    expect(person.actionTimer).toBe(10);
    expect([person.x, person.y, person.targetX, person.targetY]).toEqual([4.5, 4.5, 4, 4]);
  });

  it('does not show a stroke while travelling, moving, unstarted, interrupted, dead or over invalid ground', () => {
    const { person, sim } = digFixture();
    expect(diggingPose(person, sim, true)).toBeNull();
    person.x = 6;
    expect(diggingPose(person, sim, false)).toBeNull();
    person.x = 4.5; person.actionTimer = 0;
    expect(diggingPose(person, sim, false)).toBeNull();
    person.actionTimer = 10; person.workedTicks = 0;
    expect(diggingPose(person, sim, false)).toBeNull();
    person.workedTicks = 1; person.action = 'idle';
    expect(diggingPose(person, sim, false)).toBeNull();
    person.action = 'dig'; person.alive = false;
    expect(diggingPose(person, sim, false)).toBeNull();
    person.alive = true;
    const badGround = { world: { biomeAt: () => 'water' } } as unknown as Pick<Simulation, 'world'>;
    expect(diggingPose(person, badGround, false)).toBeNull();
  });

  it('holds and interpolates the stroke only within the bounded simulation fraction', () => {
    const { person, sim } = digFixture();
    person.workedTicks = 2;
    expect(diggingPose(person, sim, false, 0.5)).toBe('d0');
    expect(diggingPose(person, sim, false, 0.5)).toBe('d0');
    expect(diggingPose(person, sim, false, 1)).toBe('d1');
    expect(diggingPose(person, sim, false, 50)).toBe('d1');
    expect(diggingPose(person, sim, false, -50)).toBe('d0');
  });
});

describe('farming animation', () => {
  function farmFixture() {
    const person = new Person('Farmer', 4, 4, 0, new RNG('farm-animation'));
    person.action = 'sow'; person.targetBuildingId = 3; person.workedTicks = 1;
    const crop = { isFallow: true, isRipe: false };
    const field = { complete: true, crop, contains: (x: number, y: number) => x >= 3 && x <= 5 && y >= 3 && y <= 5 };
    const sim = { buildingsById: new Map([[3, field]]) } as unknown as Pick<Simulation, 'buildingsById'>;
    return { person, crop, field, sim };
  }

  it('cycles the planted hand gesture only during real sowing or ripe-crop reaping', () => {
    const { person, crop, sim } = farmFixture();
    expect([1, 3, 5, 7, 9].map(ticks => { person.workedTicks = ticks; return farmingPose(person, sim, false, 0); }))
      .toEqual(['a0', 'a1', 'a2', 'a3', 'a0']);
    person.action = 'reap'; crop.isFallow = false; crop.isRipe = true;
    expect(farmingPose(person, sim, false)).toBe('a0');
  });

  it('stops when travelling, outside the field, without work, or when the crop no longer matches', () => {
    const { person, crop, field, sim } = farmFixture();
    expect(farmingPose(person, sim, true)).toBeNull();
    person.x = 7;
    expect(farmingPose(person, sim, false)).toBeNull();
    person.x = 4; person.workedTicks = 0;
    expect(farmingPose(person, sim, false)).toBeNull();
    person.workedTicks = 1; crop.isFallow = false;
    expect(farmingPose(person, sim, false)).toBeNull();
    crop.isFallow = true; field.complete = false;
    expect(farmingPose(person, sim, false)).toBeNull();
  });
});

describe('building animation', () => {
  function buildFixture() {
    const person = new Person('Builder', 4, 4, 0, new RNG('build-animation'));
    person.action = 'build'; person.targetBuildingId = 3; person.workedTicks = 1;
    const site: any = { x: 3, y: 3, centerX: 4, centerY: 4, complete: false, progress: 1,
      materialsReady: true, earth: null, earthDone: true, durability: null,
      def: { id: 'hut', workTicks: 100, earthwork: undefined, station: undefined },
      contains: (x: number, y: number) => x >= 3 && x <= 5 && y >= 3 && y <= 5 };
    const sim = { buildingsById: new Map([[3, site]]) } as unknown as Pick<Simulation, 'buildingsById'>;
    return { person, site, sim };
  }

  it('cycles four hammer strokes while a reachable site is actively progressing', () => {
    const { person, sim } = buildFixture();
    expect([1, 3, 5, 7, 9].map(ticks => { person.workedTicks = ticks; return buildingPose(person, sim, false, 0); }))
      .toEqual(['b0', 'b1', 'b2', 'b3', 'b0']);
  });

  it('also covers damaged structures, but not travel, haul handoffs, interruptions, or completed work', () => {
    const { person, site, sim } = buildFixture();
    expect(buildingPose(person, sim, true)).toBeNull();
    person.action = 'haul';
    expect(buildingPose(person, sim, false)).toBeNull();
    person.action = 'build'; person.x = 8;
    expect(buildingPose(person, sim, false)).toBeNull();
    person.x = 4; site.materialsReady = false;
    expect(buildingPose(person, sim, false)).toBeNull();
    site.materialsReady = true; site.complete = true; site.durability = 100;
    expect(buildingPose(person, sim, false)).toBeNull();
    site.durability = 50;
    expect(buildingPose(person, sim, false)).toBe('b0');
  });

  it('does not show a hammer for an unfinished earthwork', () => {
    const { person, site, sim } = buildFixture();
    site.earth = [];
    site.def.earthwork = { kind: 'dig' };
    expect(buildingPose(person, sim, false)).toBeNull();
  });
});

describe('garment mending animation', () => {
  it('cycles a sewing gesture only after a live mending action enters work', () => {
    const person = new Person('Mender', 4, 4, 0, new RNG('mending-animation'));
    person.action = 'mend_garment'; person.actionTimer = 1; person.actionTotal = 100; person.workedTicks = 1;
    expect([1, 3, 5, 7, 9].map(ticks => { person.workedTicks = ticks; return mendingPose(person, false, 0); }))
      .toEqual(['r0', 'r1', 'r2', 'r3', 'r0']);
    expect(person.actionTotal).toBe(100);
    expect(person.workedTicks).toBe(9);
  });

  it('hides the gesture while moving, dead, interrupted, or still preparing', () => {
    const person = new Person('Mender', 4, 4, 0, new RNG('mending-animation-guards'));
    person.action = 'mend_garment'; person.actionTimer = 1; person.actionTotal = 100; person.workedTicks = 1;
    expect(mendingPose(person, true)).toBeNull();
    expect(mendingPose(person, false)).toBe('r0');
    person.actionTimer = 0; expect(mendingPose(person, false)).toBeNull();
    person.actionTimer = 1; person.actionTotal = 0; expect(mendingPose(person, false)).toBeNull();
    person.actionTotal = 100; person.workedTicks = 0; expect(mendingPose(person, false)).toBeNull();
    person.workedTicks = 1; person.alive = false; expect(mendingPose(person, false)).toBeNull();
    person.alive = true; person.action = 'idle'; expect(mendingPose(person, false)).toBeNull();
  });

  it('freezes the sewing frame against the bounded simulation fraction', () => {
    const person = new Person('Mender', 4, 4, 0, new RNG('mending-animation-clock'));
    person.action = 'mend_garment'; person.actionTimer = 1; person.actionTotal = 100; person.workedTicks = 2;
    expect(mendingPose(person, false, 0.5)).toBe('r0');
    expect(mendingPose(person, false, 1)).toBe('r1');
  });
});

describe('hide dressing animation', () => {
  it('cycles the grease-working gesture only after a live treatment action enters work', () => {
    const person = new Person('Hide dresser', 4, 4, 0, new RNG('hide-dressing-animation'));
    person.action = 'dress_hide'; person.actionTimer = 1; person.actionTotal = 100; person.workedTicks = 1;
    expect([1, 3, 5, 7, 9].map(ticks => { person.workedTicks = ticks; return hideDressingPose(person, false, 0); }))
      .toEqual(['h0', 'h1', 'h2', 'h3', 'h0']);
    expect(person.actionTotal).toBe(100);
    expect(person.workedTicks).toBe(9);
  });

  it('hides the gesture while moving, dead, interrupted, preparing, or doing another action', () => {
    const person = new Person('Hide dresser', 4, 4, 0, new RNG('hide-dressing-animation-guards'));
    person.action = 'dress_hide'; person.actionTimer = 1; person.actionTotal = 100; person.workedTicks = 1;
    expect(hideDressingPose(person, true)).toBeNull();
    expect(hideDressingPose(person, false)).toBe('h0');
    person.actionTimer = 0; expect(hideDressingPose(person, false)).toBeNull();
    person.actionTimer = 1; person.actionTotal = 0; expect(hideDressingPose(person, false)).toBeNull();
    person.actionTotal = 100; person.workedTicks = 0; expect(hideDressingPose(person, false)).toBeNull();
    person.workedTicks = 1; person.alive = false; expect(hideDressingPose(person, false)).toBeNull();
    person.alive = true; person.action = 'idle'; expect(hideDressingPose(person, false)).toBeNull();
  });

  it('uses the bounded simulation fraction to freeze the grease-working frame', () => {
    const person = new Person('Hide dresser', 4, 4, 0, new RNG('hide-dressing-animation-clock'));
    person.action = 'dress_hide'; person.actionTimer = 1; person.actionTotal = 100; person.workedTicks = 2;
    expect(hideDressingPose(person, false, 0.5)).toBe('h0');
    expect(hideDressingPose(person, false, 1)).toBe('h1');
  });
});

describe('grass cutting animation', () => {
  function grassFixture() {
    const person = new Person('Cutter', 4.5, 4.5, 0, new RNG('cut-grass-animation'));
    person.action = 'cut_grass'; person.targetX = 4; person.targetY = 4;
    person.actionTimer = 10; person.workedTicks = 1;
    let height = 0.9;
    const sim = { world: { grassAt: () => height } } as unknown as Pick<Simulation, 'world'>;
    return { person, sim, setHeight: (next: number) => { height = next; } };
  }

  it('cycles four low cutting strokes only over real tall grass', () => {
    const { person, sim } = grassFixture();
    expect([1, 3, 5, 7, 9].map(ticks => { person.workedTicks = ticks; return cuttingGrassPose(person, sim, false, 0); }))
      .toEqual(['q0', 'q1', 'q2', 'q3', 'q0']);
    expect(person.actionTimer).toBe(10);
    expect(person.workedTicks).toBe(9);
  });

  it('hides the swing during travel, away from its tile, without work, or after grass is cut', () => {
    const { person, sim, setHeight } = grassFixture();
    expect(cuttingGrassPose(person, sim, true)).toBeNull();
    person.x = 7;
    expect(cuttingGrassPose(person, sim, false)).toBeNull();
    person.x = 4.5; person.workedTicks = 0;
    expect(cuttingGrassPose(person, sim, false)).toBeNull();
    person.workedTicks = 1; person.actionTimer = 0;
    expect(cuttingGrassPose(person, sim, false)).toBeNull();
    person.actionTimer = 10; setHeight(0.49);
    expect(cuttingGrassPose(person, sim, false)).toBeNull();
    person.action = 'idle'; setHeight(0.9);
    expect(cuttingGrassPose(person, sim, false)).toBeNull();
    person.action = 'cut_grass'; person.alive = false;
    expect(cuttingGrassPose(person, sim, false)).toBeNull();
  });

  it('interpolates only the bounded simulation fraction', () => {
    const { person, sim } = grassFixture();
    person.workedTicks = 2;
    expect(cuttingGrassPose(person, sim, false, 0.5)).toBe('q0');
    expect(cuttingGrassPose(person, sim, false, 1)).toBe('q1');
    expect(cuttingGrassPose(person, sim, false, 50)).toBe('q1');
  });
});

describe('tree planting animation', () => {
  function plantingFixture() {
    const person = new Person('Planter', 4.5, 4.5, 0, new RNG('plant-animation'));
    person.action = 'plant'; person.targetX = 4; person.targetY = 4;
    person.actionTimer = 10; person.workedTicks = 1;
    let biome = 'grass', depth = 0;
    const sim = { world: { biomeAt: () => biome, depthDug: () => depth } } as unknown as Pick<Simulation, 'world'>;
    return { person, sim, setGround: (nextBiome: string, nextDepth: number) => { biome = nextBiome; depth = nextDepth; } };
  }

  it('cycles four low hand-to-soil poses after planting work starts', () => {
    const { person, sim } = plantingFixture();
    expect([1, 3, 5, 7, 9].map(ticks => { person.workedTicks = ticks; return plantingPose(person, sim, false, 0); }))
      .toEqual(['p0', 'p1', 'p2', 'p3', 'p0']);
    expect(person.actionTimer).toBe(10);
    expect(person.workedTicks).toBe(9);
  });

  it('hides the gesture while travelling, outside the tile, before work or on invalid ground', () => {
    const { person, sim, setGround } = plantingFixture();
    expect(plantingPose(person, sim, true)).toBeNull();
    person.x = 7;
    expect(plantingPose(person, sim, false)).toBeNull();
    person.x = 4.5; person.workedTicks = 0;
    expect(plantingPose(person, sim, false)).toBeNull();
    person.workedTicks = 1; person.actionTimer = 0;
    expect(plantingPose(person, sim, false)).toBeNull();
    person.actionTimer = 10; setGround('water', 0);
    expect(plantingPose(person, sim, false)).toBeNull();
    setGround('grass', 0.2);
    expect(plantingPose(person, sim, false)).toBeNull();
    setGround('forest', 0); person.alive = false;
    expect(plantingPose(person, sim, false)).toBeNull();
  });

  it('advances only by the bounded simulation fraction', () => {
    const { person, sim } = plantingFixture();
    person.workedTicks = 2;
    expect(plantingPose(person, sim, false, 0.5)).toBe('p0');
    expect(plantingPose(person, sim, false, 1)).toBe('p1');
    expect(plantingPose(person, sim, false, 50)).toBe('p1');
  });
});

describe('fishing animation', () => {
  function fishingFixture() {
    const person = new Person('Fisher', 4, 4, 0, new RNG('fishing-animation'));
    person.action = 'forage'; person.targetNodeId = 1;
    person.actionTimer = 10; person.actionTotal = 10; person.workedTicks = 1;
    const node = { x: 4.3, y: 4, kind: 'fish', depleted: false };
    const sim = { nodesById: new Map([[1, node]]), world: { isShallow: () => true } } as unknown as Pick<Simulation, 'nodesById' | 'world'>;
    return { person, node, sim };
  }

  it('cycles four shallow-water pulls using work progress only', () => {
    const { person, sim } = fishingFixture();
    expect([1, 3, 5, 7, 9].map(ticks => {
      person.workedTicks = ticks;
      return fishingPose(person, sim, false, 0);
    })).toEqual(['f0', 'f1', 'f2', 'f3', 'f0']);
    expect(person.actionTimer).toBe(10);
    expect([person.x, person.y]).toEqual([4, 4]);
  });

  it('does not show a pull while travelling, away, stopped, dead, depleted or outside the shallows', () => {
    const { person, node, sim } = fishingFixture();
    expect(fishingPose(person, sim, true)).toBeNull();
    person.x = 8;
    expect(fishingPose(person, sim, false)).toBeNull();
    person.x = 4; person.actionTimer = 0;
    expect(fishingPose(person, sim, false)).toBeNull();
    person.actionTimer = 10; person.workedTicks = 0;
    expect(fishingPose(person, sim, false)).toBeNull();
    person.workedTicks = 1; person.alive = false;
    expect(fishingPose(person, sim, false)).toBeNull();
    person.alive = true; node.depleted = true;
    expect(fishingPose(person, sim, false)).toBeNull();
    node.depleted = false;
    sim.world.isShallow = () => false;
    expect(fishingPose(person, sim, false)).toBeNull();
  });

  it('freezes with the simulation fraction and ignores non-fish forage targets', () => {
    const { person, node, sim } = fishingFixture(); person.workedTicks = 2;
    expect(fishingPose(person, sim, false, 0.5)).toBe('f0');
    expect(fishingPose(person, sim, false, 0.5)).toBe('f0');
    expect(fishingPose(person, sim, false, 1)).toBe('f1');
    expect(fishingPose(person, sim, false, 20)).toBe('f1');
    node.kind = 'flint';
    expect(fishingPose(person, sim, false)).toBeNull();
  });
});

describe('mineral extraction animation', () => {
  function extractionFixture() {
    const person = new Person('Knapping worker', 4, 4, 0, new RNG('extraction-animation'));
    person.action = 'forage'; person.targetNodeId = 1;
    person.actionTimer = 10; person.workedTicks = 1;
    const node = { x: 4.3, y: 4, kind: 'flint', depleted: false };
    const sim = { nodesById: new Map([[1, node]]) } as unknown as Pick<Simulation, 'nodesById'>;
    return { person, node, sim };
  }

  it('cycles one four-frame strike-and-collect gesture for flint, clay and ore', () => {
    const { person, node, sim } = extractionFixture();
    for (const kind of ['flint', 'clay', 'copper_ore', 'tin_ore', 'iron_ore']) {
      node.kind = kind;
      expect([1, 3, 5, 7, 9].map(ticks => {
        person.workedTicks = ticks;
        return extractionPose(person, sim, false, 0);
      }), kind).toEqual(['x0', 'x1', 'x2', 'x3', 'x0']);
    }
    expect(person.actionTimer).toBe(10);
    expect([person.x, person.y]).toEqual([4, 4]);
  });

  it('shows no stroke while travelling, outside reach, in tool setup, stopped, dead or depleted', () => {
    const { person, node, sim } = extractionFixture();
    expect(extractionPose(person, sim, true)).toBeNull();
    person.x = 8;
    expect(extractionPose(person, sim, false)).toBeNull();
    person.x = 4; person.actionTotal = 0;
    expect(extractionPose(person, sim, false)).toBeNull();
    person.actionTotal = 10; person.actionTimer = 0;
    expect(extractionPose(person, sim, false)).toBeNull();
    person.actionTimer = 10; person.action = 'idle';
    expect(extractionPose(person, sim, false)).toBeNull();
    person.action = 'forage'; person.alive = false;
    expect(extractionPose(person, sim, false)).toBeNull();
    person.alive = true; node.depleted = true;
    expect(extractionPose(person, sim, false)).toBeNull();
  });

  it('ignores food and surface materials outside the extraction family', () => {
    const { person, node, sim } = extractionFixture();
    for (const kind of ['berries', 'sticks', 'reeds', 'wild_grain', 'fish', 'native_copper', 'gold']) {
      node.kind = kind;
      expect(extractionPose(person, sim, false), kind).toBeNull();
    }
    sim.nodesById.clear();
    expect(extractionPose(person, sim, false)).toBeNull();
  });

  it('holds and interpolates the frame using simulation progress only', () => {
    const { person, sim } = extractionFixture(); person.workedTicks = 2;
    expect(extractionPose(person, sim, false, 0.5)).toBe('x0');
    expect(extractionPose(person, sim, false, 0.5)).toBe('x0');
    expect(extractionPose(person, sim, false, 1)).toBe('x1');
    expect(extractionPose(person, sim, false, 50)).toBe('x1');
    expect(extractionPose(person, sim, false, -50)).toBe('x0');
  });
});
