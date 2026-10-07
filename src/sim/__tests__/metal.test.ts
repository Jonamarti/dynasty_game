/**
 * The metal tier (M15 phase 37, M8.3).
 *
 * One block per node, added in the commit that adds the node. Each asserts the
 * three things "no node ships inert" asks for: the node is declared the way the
 * plan says, something in the world reads it, and the thing it unlocks works
 * end to end where a person can reach it. The end-to-end cases are
 * deterministic unit tests rather than `simcheck` rows for the reason
 * `orders.test.ts` gives: a scenario run is chaotic, and a check that can only
 * report n/a is worse than none.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { Person, DAYS_PER_YEAR } from '../entities/Person.ts';
import { TECH, TECHS, TECH_EFFECTS, ageIndex, warmthFrom, techPower, awlFactor, SEWN_RECIPES } from '../knowledge/Tech.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { BUILDINGS, isStation, type Building } from '../entities/Building.ts';
import { ORE_COUNTS, RESOURCE_DEFS, ResourceNode } from '../entities/ResourceNode.ts';
import { wantedOreKinds } from '../knowledge/Ore.ts';
import { geographicResourceAvailable } from '../world/GeographicResources.ts';
import { earthWorldGeography } from '../world/WorldGeography.ts';
import { WORLD_FEATURE } from '../world/WorldFeatureSeeds.ts';
import type { LoadedWorldMap } from '../world/WorldAtlas.ts';
import { sparkFires, type Notice } from '../knowledge/Synthesis.ts';

const SMALL = {
  seed: 'metal',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

/** A quiet person with an empty pack, so a test measures what it means to. */
function settle(person: Person): void {
  person.needs.thirst = 0;
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.workedTicks = 0;
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
}

function adult(name: string): Person {
  const person = new Person(name, 4, 4, 0, new RNG('metal-' + name));
  person.age = 30 * DAYS_PER_YEAR;
  return person;
}

/** Knows `tech` outright, at its base power. */
function teach(person: Person, ...techs: (typeof TECHS)[number][]): void {
  for (const tech of techs) person.knownTech.add(tech);
}

/** A world whose founders already know `techs`, run past the first daily pass. */
function worldKnowing(techs: string[], seed = 'metal'): Simulation {
  const sim = new Simulation({ ...SMALL, seed, population: { ...SMALL.population, startingTech: techs } });
  // `Simulation.knownTech` is rebuilt in the daily block, and `place` gates on it.
  for (let i = 0; i < 300; i++) sim.step();
  return sim;
}

/** A finished `stationId` a few steps away from `person`, on open ground. */
function stationNear(sim: Simulation, person: Person, stationId: string): Building {
  let station: Building | null = null;
  for (const [dx, dy] of [[6, 6], [-6, 6], [6, -6], [-6, -6], [8, 0], [0, 8], [4, 0], [0, 4]]) {
    station = sim.place(stationId, Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
    if (station) break;
  }
  expect(station, 'somewhere to put the ' + stationId).not.toBeNull();
  station!.complete = true;
  return station!;
}

describe('charcoal and the pit', () => {
  it('needs firemaking and carpentry, and is a device of the Chalcolithic', () => {
    const def = TECH.charcoal;
    expect(def.requires).toEqual(['firemaking', 'carpentry']);
    expect(def.kind).toBe('device');
    expect(def.domain).toBe('fire');
    expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH.carpentry.age));
    expect(def.firstKnown.length).toBeGreaterThan(0);
  });

  it('makes the pit a station that only the knowing may raise', () => {
    const pit = BUILDINGS.charcoal_pit!;
    expect(isStation(pit)).toBe(true);
    expect(pit.requiresTech).toBe('charcoal');
    expect(pit.storage).toBe(0);
    // Everything it is built of is something a band can fetch for a site.
    for (const id of Object.keys(pit.materials)) expect(['sticks', 'mud', 'flint']).toContain(id);
  });

  it('turns deadwood into charcoal at the pit and nowhere else', () => {
    const recipe = RECIPES.charcoal!;
    expect(recipe.station).toBe('charcoal_pit');
    expect(recipe.tech).toBe('charcoal');
    // Sticks, not timber: nothing in the pack-filling scorers fells a tree for a recipe.
    expect(Object.keys(recipe.ingredients)).toEqual(['sticks']);
    expect(recipe.output).toEqual({ charcoal: 3 });
    expect(recipe.keep).toBeGreaterThan(0);
  });

  it('is a fuel and not a food, a weapon or a garment', () => {
    const item = ITEMS.charcoal!;
    expect(item.nutrition).toBe(0);
    expect(item.weapon).toBeUndefined();
    expect(item.protects).toBeUndefined();
  });

  it('warms only somebody who both knows how it is made and carries some', () => {
    const bare = adult('bare');
    const knower = adult('knower');
    const carrier = adult('carrier');
    const both = adult('both');
    teach(knower, 'charcoal');
    teach(both, 'charcoal');
    carrier.inventory.add('charcoal', 2);
    both.inventory.add('charcoal', 2);
    expect(warmthFrom(knower)).toBe(warmthFrom(bare));
    expect(warmthFrom(carrier)).toBe(warmthFrom(bare));
    expect(warmthFrom(both)).toBeGreaterThan(warmthFrom(bare));
    // Diminishing returns: never total warmth.
    teach(both, 'firemaking', 'clothing');
    expect(warmthFrom(both)).toBeLessThan(1);
  });

  it('declares what it does', () => {
    expect(TECH_EFFECTS.charcoal.site).toContain('charcoal_pit');
  });

  it('is made at the pit end to end', () => {
    const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal']);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('sticks', 6);
    expect(techPower(person, 'charcoal')).toBeGreaterThan(0);
    const pit = stationNear(sim, person, 'charcoal_pit');

    expect(sim.order(person, 'craft', { recipeId: 'charcoal', buildingId: pit.id })).toBe(true);
    for (let i = 0; i < 1500 && person.inventory.count('charcoal') === 0; i++) {
      person.needs.thirst = 0;
      person.needs.hunger = 0;
      sim.step();
    }
    expect(person.inventory.count('charcoal')).toBe(3);
    expect(person.inventory.count('sticks')).toBe(0);
    expect(pit.contains(person.x, person.y)).toBe(true);
  });

  it('is refused away from the pit, and the reason names it', () => {
    const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal']);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('sticks', 6);
    expect(sim.order(person, 'craft', { recipeId: 'charcoal' })).toBe(false);
    expect(sim.lastRefusal).toContain('pit');
  });
});

/** A one-cell Earth whose only feature flags are `features`, for a gate test. */
function earth(features: number) {
  const loaded: LoadedWorldMap = {
    entry: { id: 'metal-gate', title: 'Metal gate', file: 'metal-gate.bin', seaLevelMeters: 0, recommended: false },
    raster: {
      width: 4, height: 2,
      elevationMeters: Int16Array.from({ length: 8 }, () => 100),
      koppen: Uint8Array.from({ length: 8 }, () => 0),
      features: Uint32Array.from({ length: 8 }, () => features), seaLevelMeters: 0,
    },
  };
  return earthWorldGeography(loaded, 10);
}

describe('native copper', () => {
  it('needs stoneworking, and opens the metal domain', () => {
    const def = TECH.native_copper;
    expect(def.requires).toEqual(['stoneworking']);
    expect(def.domain).toBe('metal');
    expect(def.kind).toBe('device');
    expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH.stoneworking.age));
    expect(TECH_EFFECTS.native_copper.site).toContain('RECIPES.copper_awl');
  });

  it('can be thought of by somebody who has never held a nugget', () => {
    const quiet: Notice = {
      knows: new Set(['stoneworking']), holding: new Set(), lately: new Set(['gather']), feeling: new Set(),
      wanting: new Set(), place: 'hills', saw: new Set(), season: 'summer',
    };
    expect(TECH.native_copper.sparks.some(spark => sparkFires(spark, quiet))).toBe(true);
    // And not by somebody who does not understand stone.
    expect(TECH.native_copper.sparks.some(spark => sparkFires(spark, { ...quiet, knows: new Set() }))).toBe(false);
  });

  it('lies on the hills of a classic island, a handful and no more', () => {
    const sim = new Simulation({ seed: 'metal-ore' });
    const nuggets = sim.nodes.filter(n => n.kind === 'native_copper');
    expect(nuggets.length).toBeGreaterThan(0);
    expect(nuggets.length).toBeLessThanOrEqual(Math.round(ORE_COUNTS.native_copper! * sim.config.world.resourceScale));
    for (const node of nuggets) {
      expect(sim.world.biomeAt(node.x, node.y)).toBe('hills');
      expect(node.def.itemId).toBe('copper_nugget');
      expect(node.def.regrowPerTick).toBe(0);
    }
    expect(RESOURCE_DEFS.native_copper.requiresTech).toBeUndefined();
  });

  it('is placed in a pass of its own, so every other thing stands where it stood', () => {
    // The determinism test compares two runs of the same build and cannot see
    // this: a new kind in `spawnResources`' plan would move every herd and
    // person. Switch the ore off and compare the world with it on.
    const key = (sim: Simulation) => ({
      nodes: sim.nodes.filter(n => n.kind !== 'native_copper').map(n => `${n.id}:${n.kind}:${n.x},${n.y}:${n.amount}`),
      animals: sim.animals.map(a => `${a.id}:${a.species}:${a.x},${a.y}`),
      people: sim.people.map(p => `${p.id}:${p.name}:${p.x},${p.y}`),
    });
    const withOre = key(new Simulation({ seed: 'metal-ore' }));
    const saved = ORE_COUNTS.native_copper;
    ORE_COUNTS.native_copper = 0;
    let without;
    try { without = key(new Simulation({ seed: 'metal-ore' })); } finally { ORE_COUNTS.native_copper = saved; }
    expect(withOre).toEqual(without);
  });

  it('is placed the same way twice', () => {
    const a = new Simulation({ seed: 'metal-ore' }).nodes.filter(n => n.kind === 'native_copper');
    const b = new Simulation({ seed: 'metal-ore' }).nodes.filter(n => n.kind === 'native_copper');
    expect(a.map(n => `${n.id}:${n.x},${n.y}`)).toEqual(b.map(n => `${n.id}:${n.x},${n.y}`));
  });

  it('is found on a map only where the region has copper in it', () => {
    expect(geographicResourceAvailable(earth(0), 20, 10, 'native_copper')).toBe(false);
    expect(geographicResourceAvailable(earth(WORLD_FEATURE.copper), 20, 10, 'native_copper')).toBe(true);
    // Tin is not copper.
    expect(geographicResourceAvailable(earth(WORLD_FEATURE.tin), 20, 10, 'native_copper')).toBe(false);
  });

  it('is wanted by the person who can use it and by nobody else', () => {
    const knower = adult('knower');
    const stranger = adult('stranger');
    teach(knower, 'stoneworking', 'native_copper');
    expect(wantedOreKinds(stranger)).toEqual([]);
    expect(wantedOreKinds(knower)).toEqual(['native_copper']);
    // With the awl and the pendant made there is nothing left to want.
    knower.inventory.add('copper_awl', 1);
    knower.inventory.add('copper_pendant', 1);
    expect(wantedOreKinds(knower)).toEqual([]);
  });

  it('makes an awl and a pendant by hand, with no fire and no station', () => {
    for (const id of ['copper_awl', 'copper_pendant']) {
      const recipe = RECIPES[id]!;
      expect(recipe.tech).toBe('native_copper');
      expect(recipe.skill).toBe('smith');
      expect(recipe.station).toBeUndefined();
      expect(Object.keys(recipe.ingredients)).toEqual(['copper_nugget']);
    }
    // The pendant is worth more than the nugget it is made of: that is what it is for.
    expect(ITEMS.copper_pendant!.baseValue).toBeGreaterThan(2 * ITEMS.copper_nugget!.baseValue);
  });

  it('speeds only the stitched recipes, and only for whoever knows and carries', () => {
    const bare = adult('bare');
    const knower = adult('knower');
    const carrier = adult('carrier');
    const both = adult('both');
    teach(knower, 'native_copper');
    teach(both, 'native_copper');
    carrier.inventory.add('copper_awl', 1);
    both.inventory.add('copper_awl', 1);
    for (const id of SEWN_RECIPES) {
      expect(RECIPES[id], id).toBeDefined();
      expect(awlFactor(bare, id)).toBe(1);
      expect(awlFactor(knower, id)).toBe(1);
      expect(awlFactor(carrier, id)).toBe(1);
      expect(awlFactor(both, id)).toBeLessThan(1);
      expect(awlFactor(both, id)).toBeGreaterThan(0);
    }
    expect(awlFactor(both, 'handaxe')).toBe(1);
  });

  it('shortens a sewn craft end to end', () => {
    const ticksToSew = (withAwl: boolean): number => {
      const sim = worldKnowing(['leatherwork', 'cordage', 'stoneworking', 'native_copper'], 'metal-awl');
      const person = sim.livingPeople()[0]!;
      settle(person);
      person.inventory.add('hide', 1);
      person.inventory.add('rope', 1);
      if (withAwl) person.inventory.add('copper_awl', 1);
      expect(sim.order(person, 'craft', { recipeId: 'hide_bag' })).toBe(true);
      let ticks = 0;
      while (person.inventory.count('hide_bag') === 0 && ticks < 2000) {
        person.needs.thirst = 0;
        person.needs.hunger = 0;
        sim.step();
        ticks++;
      }
      expect(person.inventory.count('hide_bag')).toBe(1);
      return ticks;
    };
    expect(ticksToSew(true)).toBeLessThan(ticksToSew(false));
  });

  it('is picked up from the ground by anybody, and never grows back', () => {
    const sim = worldKnowing(['stoneworking', 'native_copper'], 'metal-pick');
    const person = sim.livingPeople()[0]!;
    settle(person);
    const node = new ResourceNode('native_copper', Math.round(person.x) + 2, Math.round(person.y), new RNG('nugget'), sim.ids);
    node.amount = 3;
    sim.nodes.push(node);
    sim.nodesById.set(node.id, node);
    sim.nodeHash.rebuild(sim.nodes);
    expect(sim.order(person, 'gather', { nodeId: node.id })).toBe(true);
    for (let i = 0; i < 600 && person.inventory.count('copper_nugget') === 0; i++) {
      person.needs.thirst = 0;
      person.needs.hunger = 0;
      sim.step();
    }
    expect(person.inventory.count('copper_nugget')).toBeGreaterThan(0);
    const left = node.amount;
    node.regrow(100000, 1);
    expect(node.amount).toBe(left);
  });
});
