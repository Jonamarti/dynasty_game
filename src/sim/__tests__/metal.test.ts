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
import { fittedActionToolFor } from '../../render/EquipmentAnimation.ts';
import { RNG } from '../core/RNG.ts';
import { Person, DAYS_PER_YEAR } from '../entities/Person.ts';
import { TECH, TECHS, TECH_EFFECTS, ageIndex, warmthFrom, techPower, awlFactor, forageYieldFactor, SEWN_RECIPES, WEBS, techsOfWeb, webOf, AXE_TOOLS, axeFactor, axeItemOf, weaponOf, buildFactor, reapFactor, weaponItemOf, protectionOf, armourOf } from '../knowledge/Tech.ts';
import { availableActions } from '../ai/ActionCatalog.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { BUILDINGS, isStation, type Building } from '../entities/Building.ts';
import { ORE_COUNTS, RESOURCE_DEFS, ResourceNode } from '../entities/ResourceNode.ts';
import { wantedOreKinds, canWork } from '../knowledge/Ore.ts';
import { digTool } from '../core/Earth.ts';
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
      nodes: sim.nodes.filter(n => !(n.kind in ORE_COUNTS)).map(n => `${n.id}:${n.kind}:${n.x},${n.y}:${n.amount}`),
      animals: sim.animals.map(a => `${a.id}:${a.species}:${a.x},${a.y}`),
      people: sim.people.map(p => `${p.id}:${p.name}:${p.x},${p.y}`),
    });
    const withOre = key(new Simulation({ seed: 'metal-ore' }));
    const saved = { ...ORE_COUNTS };
    for (const kind of Object.keys(ORE_COUNTS)) ORE_COUNTS[kind as keyof typeof ORE_COUNTS] = 0;
    let without;
    try { without = key(new Simulation({ seed: 'metal-ore' })); } finally { Object.assign(ORE_COUNTS, saved); }
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

describe('mining', () => {
  it('needs ground stone and hafting, and is a device of the Chalcolithic', () => {
    const def = TECH.mining;
    expect(def.requires).toEqual(['ground_stone', 'hafting']);
    expect(def.kind).toBe('device');
    expect(def.domain).toBe('stone');
    expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH.ground_stone.age));
  });

  it('can be thought of in the hills by anybody who gathers there with an axe', () => {
    const quiet: Notice = {
      knows: new Set(['hafting']), holding: new Set(), lately: new Set(['gather']), feeling: new Set(),
      wanting: new Set(), place: 'hills', saw: new Set(), season: 'summer',
    };
    expect(TECH.mining.sparks.some(spark => sparkFires(spark, quiet))).toBe(true);
    expect(TECH.mining.sparks.some(spark => sparkFires(spark, { ...quiet, place: 'water' }))).toBe(false);
  });

  it('puts copper and tin in the hills, and a great deal less tin than copper', () => {
    const sim = new Simulation({ seed: 'metal-ore' });
    const copper = sim.nodes.filter(n => n.kind === 'copper_ore');
    const tin = sim.nodes.filter(n => n.kind === 'tin_ore');
    expect(copper.length).toBeGreaterThan(0);
    expect(tin.length).toBeGreaterThan(0);
    expect(tin.length).toBeLessThan(copper.length);
    for (const node of [...copper, ...tin]) {
      expect(sim.world.biomeAt(node.x, node.y)).toBe('hills');
      expect(node.def.requiresTech).toBe('mining');
      expect(node.def.regrowPerTick).toBe(0);
    }
    expect(ITEMS.tin_ore!.baseValue).toBeGreaterThan(ITEMS.copper_ore!.baseValue);
  });

  it('is found on a map only where the region has that metal', () => {
    expect(geographicResourceAvailable(earth(0), 20, 10, 'copper_ore')).toBe(false);
    expect(geographicResourceAvailable(earth(WORLD_FEATURE.copper), 20, 10, 'copper_ore')).toBe(true);
    expect(geographicResourceAvailable(earth(WORLD_FEATURE.copper), 20, 10, 'tin_ore')).toBe(false);
    expect(geographicResourceAvailable(earth(WORLD_FEATURE.tin), 20, 10, 'tin_ore')).toBe(true);
    expect(geographicResourceAvailable(earth(WORLD_FEATURE.tin), 20, 10, 'copper_ore')).toBe(false);
  });

  it('is the gate on a seam: canWork is false until the technique is known', () => {
    const miner = adult('miner');
    const hand = adult('hand');
    teach(miner, 'mining');
    expect(canWork(hand, 'copper_ore')).toBe(false);
    expect(canWork(hand, 'tin_ore')).toBe(false);
    expect(canWork(miner, 'copper_ore')).toBe(true);
    // Surface copper needs no technique at all.
    expect(canWork(hand, 'native_copper')).toBe(true);
    expect(canWork(hand, 'flint')).toBe(true);
  });

  it('gives more flint from the same outcrop, and the ore its own multiplier', () => {
    const bare = adult('bare');
    const miner = adult('miner');
    teach(miner, 'mining');
    expect(forageYieldFactor(bare, 'flint')).toBe(1);
    expect(forageYieldFactor(miner, 'flint')).toBeGreaterThan(forageYieldFactor(bare, 'flint'));
    expect(forageYieldFactor(miner, 'copper_ore')).toBeGreaterThan(1);
    expect(forageYieldFactor(bare, 'copper_ore')).toBe(1);
  });

  it('refuses an order to mine, with the reason, before anybody walks', () => {
    const sim = worldKnowing(['ground_stone', 'hafting'], 'metal-mine');
    const person = sim.livingPeople()[0]!;
    settle(person);
    const seam = new ResourceNode('copper_ore', Math.round(person.x) + 2, Math.round(person.y), new RNG('seam'), sim.ids);
    sim.nodes.push(seam);
    sim.nodesById.set(seam.id, seam);
    sim.nodeHash.rebuild(sim.nodes);
    expect(sim.order(person, 'gather', { nodeId: seam.id })).toBe(false);
    expect(sim.lastRefusal).toContain('mine');
    expect(person.action).toBe('idle');
  });

  it('says why in the menu, and offers the verb to a miner', () => {
    const sim = worldKnowing(['ground_stone', 'hafting', 'mining'], 'metal-menu');
    const [miner, hand] = sim.livingPeople();
    teach(miner!, 'mining');
    hand!.knownTech.delete('mining');
    hand!.ideas.length = 0;
    const seam = new ResourceNode('copper_ore', 10, 10, new RNG('seam'), sim.ids);
    const ctx = { world: sim.world, nearWater: false, buildings: sim.buildings,
      backersWanted: 3, relationships: sim.relationships, tick: 0 };
    const target = { kind: 'node' as const, x: 10, y: 10, node: seam };
    const refused = availableActions(hand!, target, ctx)[0]!;
    expect(refused.enabled).toBe(false);
    expect(refused.reason).toBe('You do not know how to mine');
    const offered = availableActions(miner!, target, ctx)[0]!;
    expect(offered.enabled).toBe(true);
    expect(offered.label).toBe('Mine copper ore');
  });

  it('is mined end to end: the ore comes up in the pack of somebody who knows how', () => {
    const sim = worldKnowing(['ground_stone', 'hafting', 'mining'], 'metal-dig');
    const person = sim.livingPeople()[0]!;
    settle(person);
    const seam = new ResourceNode('copper_ore', Math.round(person.x) + 2, Math.round(person.y), new RNG('seam'), sim.ids);
    seam.amount = 12;
    sim.nodes.push(seam);
    sim.nodesById.set(seam.id, seam);
    sim.nodeHash.rebuild(sim.nodes);
    expect(sim.order(person, 'gather', { nodeId: seam.id })).toBe(true);
    for (let i = 0; i < 800 && person.inventory.count('copper_ore') === 0; i++) {
      person.needs.thirst = 0;
      person.needs.hunger = 0;
      sim.step();
    }
    expect(person.inventory.count('copper_ore')).toBeGreaterThan(0);
    expect(seam.amount).toBeLessThan(12);
  });

  it('stops with a named reason if the seam is worked by somebody who lost the knowledge', () => {
    const sim = worldKnowing(['ground_stone', 'hafting', 'mining'], 'metal-lose');
    const person = sim.livingPeople()[0]!;
    settle(person);
    const seam = new ResourceNode('copper_ore', Math.round(person.x) + 6, Math.round(person.y), new RNG('seam'), sim.ids);
    sim.nodes.push(seam);
    sim.nodesById.set(seam.id, seam);
    sim.nodeHash.rebuild(sim.nodes);
    expect(sim.order(person, 'gather', { nodeId: seam.id })).toBe(true);
    sim.interruptions.length = 0;
    person.knownTech.delete('mining');
    person.ideas.length = 0;
    for (let i = 0; i < 200 && sim.interruptions.length === 0; i++) {
      person.needs.thirst = 0;
      person.needs.hunger = 0;
      sim.step();
    }
    expect(sim.interruptions.map(n => n.reason)).toContain('cannot_mine');
  });

  it('is wanted by the person who can smelt and nobody else (the seam is the smith\'s)', () => {
    // `wantedOreKinds` reads recipes that consume ore; until `smelting` ships a
    // miner has no recipe to want an ore for, which is the honest answer.
    const miner = adult('miner');
    teach(miner, 'mining');
    expect(wantedOreKinds(miner)).toEqual([]);
  });
});

describe('smelting and the furnace', () => {
  it('needs native copper, charcoal and the kiln, and is a device of the Chalcolithic', () => {
    const def = TECH.smelting;
    expect(def.requires).toEqual(['native_copper', 'charcoal', 'kiln']);
    expect(def.kind).toBe('device');
    expect(def.domain).toBe('metal');
    for (const required of def.requires) {
      expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH[required].age));
    }
  });

  it('is a station only the knowing may raise, built of flint and clay like the kiln', () => {
    const furnace = BUILDINGS.furnace!;
    expect(isStation(furnace)).toBe(true);
    expect(furnace.requiresTech).toBe('smelting');
    expect(furnace.storage).toBe(0);
    expect(Object.keys(furnace.materials).sort()).toEqual(['flint', 'mud']);
    // More than the kiln it is the pivot from.
    expect(furnace.workTicks).toBeGreaterThan(BUILDINGS.kiln!.workTicks);
  });

  it('turns ore and charcoal into ingots at the furnace and nowhere else', () => {
    const recipe = RECIPES.smelt_copper!;
    expect(recipe.station).toBe('furnace');
    expect(recipe.tech).toBe('smelting');
    expect(recipe.skill).toBe('smith');
    expect(recipe.ingredients).toEqual({ copper_ore: 3, charcoal: 2 });
    expect(recipe.output).toEqual({ copper: 2 });
    expect(ITEMS.copper!.baseValue).toBeGreaterThan(ITEMS.copper_ore!.baseValue);
  });

  it('sends the smith to the seam, and a smith with enough ore nowhere', () => {
    const smith = adult('smith');
    teach(smith, 'mining', 'smelting');
    expect(wantedOreKinds(smith)).toContain('copper_ore');
    smith.inventory.add('copper_ore', 3);
    expect(wantedOreKinds(smith)).not.toContain('copper_ore');
    // Four ingots are all the smith keeps; past that there is nothing to want.
    smith.inventory.remove('copper_ore', 3);
    smith.inventory.add('copper', 4);
    expect(wantedOreKinds(smith)).not.toContain('copper_ore');
    // Without the technique to dig it, the seam is not wanted however much is needed.
    const heir = adult('heir');
    teach(heir, 'smelting');
    expect(wantedOreKinds(heir)).not.toContain('copper_ore');
  });

  it('smelts at the furnace end to end', () => {
    const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal', 'smelting']);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('copper_ore', 3);
    person.inventory.add('charcoal', 2);
    const furnace = stationNear(sim, person, 'furnace');
    expect(sim.order(person, 'craft', { recipeId: 'smelt_copper', buildingId: furnace.id })).toBe(true);
    for (let i = 0; i < 2000 && person.inventory.count('copper') === 0; i++) {
      person.needs.thirst = 0;
      person.needs.hunger = 0;
      sim.step();
    }
    expect(person.inventory.count('copper')).toBe(2);
    expect(person.inventory.count('copper_ore')).toBe(0);
    expect(person.inventory.count('charcoal')).toBe(0);
  });

  it('is abandoned without the charcoal, with the reason named', () => {
    const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal', 'smelting']);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('copper_ore', 3);
    const furnace = stationNear(sim, person, 'furnace');
    // The order is taken and the work abandons on the first tick, with the
    // reason a `craft` always gives for a pack that lacks the parts.
    expect(sim.order(person, 'craft', { recipeId: 'smelt_copper', buildingId: furnace.id })).toBe(true);
    sim.interruptions.length = 0;
    for (let i = 0; i < 20 && sim.interruptions.length === 0; i++) sim.step();
    expect(sim.interruptions.map(n => n.reason)).toContain('lack_materials');
    expect(person.inventory.count('copper')).toBe(0);
  });
});

describe('bellows and the metal web', () => {
  it('opens a web of its own at native copper, with smelting and the bellows in it', () => {
    expect(WEBS.metal.gate).toBe('native_copper');
    expect(TECH.native_copper.opens).toBe('metal');
    expect(techsOfWeb('metal')).toEqual(expect.arrayContaining(['smelting', 'bellows']));
    for (const tech of techsOfWeb('metal')) {
      expect(webOf(tech)).toBe('metal');
    }
  });

  it('needs smelting and leatherwork', () => {
    const def = TECH.bellows;
    expect(def.requires).toEqual(['smelting', 'leatherwork']);
    expect(def.kind).toBe('device');
    for (const required of def.requires) {
      expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH[required].age));
    }
  });

  it('gives more metal in less time from the same charge', () => {
    const plain = RECIPES.smelt_copper!;
    const blown = RECIPES.smelt_copper_bellows!;
    expect(blown.tech).toBe('bellows');
    expect(blown.station).toBe('furnace');
    expect(blown.ingredients).toEqual(plain.ingredients);
    expect(blown.output.copper!).toBeGreaterThan(plain.output.copper!);
    expect(blown.workTicks).toBeLessThan(plain.workTicks);
  });

  it('is declared ahead of the plain run, because the scorer breaks ties by order', () => {
    const order = Object.keys(RECIPES);
    expect(order.indexOf('smelt_copper_bellows')).toBeLessThan(order.indexOf('smelt_copper'));
  });

  it('runs the blown smelt in fewer ticks for three ingots, and the plain one for two', () => {
    const run = (recipeId: string): { copper: number; ticks: number } => {
      const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal', 'smelting', 'leatherwork', 'bellows'], 'metal-bellows');
      const person = sim.livingPeople()[0]!;
      settle(person);
      person.inventory.add('copper_ore', 3);
      person.inventory.add('charcoal', 2);
      const furnace = stationNear(sim, person, 'furnace');
      expect(sim.order(person, 'craft', { recipeId, buildingId: furnace.id })).toBe(true);
      let ticks = 0;
      while (person.inventory.count('copper') === 0 && ticks < 3000) {
        person.needs.thirst = 0;
        person.needs.hunger = 0;
        sim.step();
        ticks++;
      }
      return { copper: person.inventory.count('copper'), ticks };
    };
    const blown = run('smelt_copper_bellows');
    const plain = run('smelt_copper');
    expect(blown.copper).toBe(3);
    expect(plain.copper).toBe(2);
    expect(blown.ticks).toBeLessThan(plain.ticks);
  });

  it('is not something a smith without the bellows can order: the work stops with a reason', () => {
    const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal', 'smelting'], 'metal-nobellows');
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('copper_ore', 3);
    person.inventory.add('charcoal', 2);
    const furnace = stationNear(sim, person, 'furnace');
    expect(sim.order(person, 'craft', { recipeId: 'smelt_copper_bellows', buildingId: furnace.id })).toBe(true);
    sim.interruptions.length = 0;
    for (let i = 0; i < 20 && sim.interruptions.length === 0; i++) sim.step();
    expect(sim.interruptions.map(n => n.reason)).toContain('dont_know_how');
    expect(person.inventory.count('copper')).toBe(0);
  });
});

describe('casting', () => {
  it('needs smelting and pottery, and joins the metal web', () => {
    const def = TECH.casting;
    expect(def.requires).toEqual(['smelting', 'pottery']);
    expect(def.web).toBe('metal');
    expect(def.kind).toBe('device');
    for (const required of def.requires) {
      expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH[required].age));
    }
  });

  it('pours an axe and a dagger at the furnace out of the ingot', () => {
    for (const id of ['copper_axe', 'copper_dagger']) {
      const recipe = RECIPES[id]!;
      expect(recipe.tech).toBe('casting');
      expect(recipe.station).toBe('furnace');
      expect(recipe.skill).toBe('smith');
      expect(Object.keys(recipe.ingredients)).toEqual(['copper']);
    }
  });

  it('keeps every axe in the table positive at the refinement its technique allows', () => {
    // The `ground_stone` rule, as a test, so that the next axe cannot break it:
    // a multiplier at or under zero fells a tree in no time at all.
    for (const axe of AXE_TOOLS) {
      const def = TECH[axe.tech];
      const person = adult(axe.item);
      teach(person, axe.tech);
      person.techLevel.set(axe.tech, def.maxRefinement);
      person.inventory.add(axe.item, 1);
      expect(axeFactor(person), axe.item).toBeGreaterThan(0.05);
    }
  });

  it('fells faster with a cast axe than with a polished one, and never without knowing how it was made', () => {
    const stone = adult('stone');
    teach(stone, 'ground_stone');
    stone.inventory.add('stone_axe', 1);
    const cast = adult('cast');
    teach(cast, 'casting');
    cast.inventory.add('copper_axe', 1);
    const stranger = adult('stranger');
    stranger.inventory.add('copper_axe', 1);
    expect(axeFactor(cast)).toBeLessThan(axeFactor(stone));
    expect(axeFactor(stranger)).toBe(1);
    // A person carrying both takes the better one into the tree.
    teach(stone, 'casting');
    stone.inventory.add('copper_axe', 1);
    expect(axeItemOf(stone)).toBe('copper_axe');
    // And the old axes behave exactly as they did.
    const old = adult('old');
    teach(old, 'hafting', 'ground_stone');
    old.inventory.add('handaxe', 1);
    old.inventory.add('stone_axe', 1);
    expect(axeItemOf(old)).toBe('stone_axe');
    expect(axeFactor(old)).toBeCloseTo(0.35);
  });

  it('is a weapon only in the dagger, and the dagger needs casting to be worth anything', () => {
    expect(ITEMS.copper_axe!.weapon).toBeUndefined();
    expect(ITEMS.copper_dagger!.weapon!.tech).toBe('casting');
    const smith = adult('smith');
    const stranger = adult('stranger');
    teach(smith, 'casting');
    smith.inventory.add('copper_dagger', 1);
    stranger.inventory.add('copper_dagger', 1);
    expect(weaponOf(smith, false)?.power).toBeGreaterThan(0);
    expect(weaponOf(stranger, false)).toBeNull();
  });

  it('pours a cast axe at the furnace end to end', () => {
    const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal', 'smelting', 'pottery', 'casting']);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('copper', 2);
    const furnace = stationNear(sim, person, 'furnace');
    expect(sim.order(person, 'craft', { recipeId: 'copper_axe', buildingId: furnace.id })).toBe(true);
    for (let i = 0; i < 2000 && person.inventory.count('copper_axe') === 0; i++) {
      person.needs.thirst = 0;
      person.needs.hunger = 0;
      sim.step();
    }
    expect(person.inventory.count('copper_axe')).toBe(1);
    expect(person.inventory.count('copper')).toBe(0);
  });

  it('draws the fitted axe whatever it is made of', () => {
    for (const axe of AXE_TOOLS) {
      const person = adult(axe.item);
      person.action = 'chop';
      person.inventory.add(axe.item, 1);
      person.equipment.right = { item: axe.item, count: 1 };
      expect(fittedActionToolFor(person, true), axe.item).toBe('handaxe');
    }
  });
});

describe('alloying and bronze', () => {
  it('needs casting and mining, and is the Bronze Age', () => {
    const def = TECH.alloying;
    expect(def.requires).toEqual(['casting', 'mining']);
    expect(def.web).toBe('metal');
    expect(def.age).toBe('bronze');
    for (const required of def.requires) {
      expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH[required].age));
    }
  });

  it('can be thought of by a founder who casts and holds only copper', () => {
    const notice: Notice = {
      knows: new Set(['casting']), holding: new Set(['copper']), lately: new Set(['craft']), feeling: new Set(),
      wanting: new Set(), place: 'grass', saw: new Set(), season: 'summer',
    };
    expect(TECH.alloying.sparks.some(spark => sparkFires(spark, notice))).toBe(true);
  });

  it('smelts tin from its ore and runs a tenth of it into the copper', () => {
    const tin = RECIPES.smelt_tin!;
    const bronze = RECIPES.alloy_bronze!;
    for (const recipe of [tin, bronze]) {
      expect(recipe.tech).toBe('alloying');
      expect(recipe.station).toBe('furnace');
      expect(recipe.skill).toBe('smith');
    }
    expect(tin.ingredients).toEqual({ tin_ore: 2, charcoal: 1 });
    expect(tin.output).toEqual({ tin: 1 });
    // Three parts copper to one of tin, which is the real alloy and not a generous one.
    expect(bronze.ingredients).toEqual({ copper: 3, tin: 1 });
    expect(bronze.output).toEqual({ bronze: 3 });
    expect(ITEMS.tin!.baseValue).toBeGreaterThan(ITEMS.copper!.baseValue);
    expect(ITEMS.bronze!.baseValue).toBeGreaterThan(ITEMS.copper!.baseValue);
  });

  it('sends the alloyer to the tin and not to the copper once the ingots are in the pack', () => {
    const smith = adult('smith');
    teach(smith, 'mining', 'smelting', 'alloying');
    smith.inventory.add('copper', 4);
    expect(wantedOreKinds(smith)).toContain('tin_ore');
    expect(wantedOreKinds(smith)).not.toContain('copper_ore');
    smith.inventory.add('tin', 2);
    expect(wantedOreKinds(smith)).not.toContain('tin_ore');
  });

  it('leaves a whole island with tin for a handful of bronze tools and no more', () => {
    // The scarcity is the design: one seam, and what it holds bounds what the
    // island can ever pour. Counted, so that raising it is a decision.
    const sim = new Simulation({ seed: 'metal-ore' });
    const ore = sim.nodes.filter(n => n.kind === 'tin_ore').reduce((sum, n) => sum + n.def.maxAmount, 0);
    const ingots = Math.floor(ore / RECIPES.smelt_tin!.ingredients.tin_ore!);
    const bronze = Math.floor(ingots / RECIPES.alloy_bronze!.ingredients.tin!) * RECIPES.alloy_bronze!.output.bronze!;
    expect(bronze).toBeGreaterThan(0);
    expect(bronze).toBeLessThan(40);
  });

  it('smelts tin and alloys bronze at the furnace end to end', () => {
    const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal', 'smelting', 'pottery', 'casting', 'ground_stone', 'hafting', 'mining', 'alloying']);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('tin_ore', 2);
    person.inventory.add('charcoal', 1);
    const furnace = stationNear(sim, person, 'furnace');
    expect(sim.order(person, 'craft', { recipeId: 'smelt_tin', buildingId: furnace.id })).toBe(true);
    for (let i = 0; i < 2000 && person.inventory.count('tin') === 0; i++) {
      person.needs.thirst = 0;
      person.needs.hunger = 0;
      sim.step();
    }
    expect(person.inventory.count('tin')).toBe(1);
    person.inventory.add('copper', 3);
    expect(sim.order(person, 'craft', { recipeId: 'alloy_bronze', buildingId: furnace.id })).toBe(true);
    for (let i = 0; i < 2000 && person.inventory.count('bronze') === 0; i++) {
      person.needs.thirst = 0;
      person.needs.hunger = 0;
      sim.step();
    }
    expect(person.inventory.count('bronze')).toBe(3);
    expect(person.inventory.count('tin')).toBe(0);
    expect(person.inventory.count('copper')).toBe(0);
  });
});

describe('bronze tools', () => {
  it('needs alloying, and is read by the functions that read the stone tools', () => {
    const def = TECH.bronze_tools;
    expect(def.requires).toEqual(['alloying']);
    expect(def.web).toBe('metal');
    expect(TECH_EFFECTS.bronze_tools.site).toContain('DIG_TOOLS');
  });

  it('pours four tools at the furnace out of bronze, none of them a weapon', () => {
    for (const id of ['bronze_axe', 'bronze_adze', 'bronze_sickle', 'bronze_spade']) {
      const recipe = RECIPES[id]!;
      expect(recipe.tech).toBe('bronze_tools');
      expect(recipe.station).toBe('furnace');
      expect(Object.keys(recipe.ingredients)).toEqual(['bronze']);
      expect(ITEMS[id]!.weapon, id).toBeUndefined();
    }
  });

  it('fells faster than copper, builds faster than polished stone and reaps faster than flint', () => {
    const smith = adult('smith');
    teach(smith, 'bronze_tools', 'casting', 'ground_stone', 'sickle');
    const base = { fell: axeFactor(smith), build: buildFactor(smith), reap: reapFactor(smith) };
    smith.inventory.add('copper_axe', 1);
    const copper = axeFactor(smith);
    smith.inventory.add('bronze_axe', 1);
    expect(axeFactor(smith)).toBeLessThan(copper);
    expect(axeItemOf(smith)).toBe('bronze_axe');
    smith.inventory.add('adze', 1);
    const stoneBuild = buildFactor(smith);
    smith.inventory.add('bronze_adze', 1);
    expect(buildFactor(smith)).toBeGreaterThan(stoneBuild);
    expect(stoneBuild).toBeGreaterThan(base.build);
    smith.inventory.add('sickle', 1);
    const flint = reapFactor(smith);
    smith.inventory.add('bronze_sickle', 1);
    expect(reapFactor(smith)).toBeLessThan(flint);
    expect(base.fell).toBe(1);
    expect(base.reap).toBe(1);
  });

  it('pays only the person who knows how and carries the tool', () => {
    const stranger = adult('stranger');
    for (const id of ['bronze_axe', 'bronze_adze', 'bronze_sickle']) stranger.inventory.add(id, 1);
    expect(axeFactor(stranger)).toBe(1);
    expect(buildFactor(stranger)).toBe(buildFactor(adult('bare')));
    expect(reapFactor(stranger)).toBe(1);
  });

  it('digs at five times a stick and ahead of the wooden spade', () => {
    const digger = adult('digger');
    teach(digger, 'bronze_tools', 'carpentry');
    digger.inventory.add('sticks', 1);
    const stick = digTool(digger)!.power;
    digger.inventory.add('spade', 1);
    const wooden = digTool(digger)!;
    expect(wooden.item).toBe('spade');
    digger.inventory.add('bronze_spade', 1);
    const bronze = digTool(digger)!;
    expect(bronze.item).toBe('bronze_spade');
    expect(bronze.power / stick).toBeGreaterThanOrEqual(5);
    expect(bronze.power).toBeGreaterThan(wooden.power);
    // Without the technique it is a heavy stick and no more.
    const stranger = adult('stranger');
    stranger.inventory.add('bronze_spade', 1);
    expect(digTool(stranger)).toBeNull();
  });

  it('keeps the new axe and sickle positive at the refinement the technique allows', () => {
    const smith = adult('refined');
    teach(smith, 'bronze_tools');
    smith.techLevel.set('bronze_tools', TECH.bronze_tools.maxRefinement);
    smith.inventory.add('bronze_axe', 1);
    smith.inventory.add('bronze_sickle', 1);
    expect(axeFactor(smith)).toBeGreaterThan(0.05);
    expect(reapFactor(smith)).toBeGreaterThan(0.05);
  });

  it('casts a bronze spade at the furnace end to end', () => {
    const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal', 'smelting', 'pottery', 'casting', 'ground_stone', 'hafting', 'mining', 'alloying', 'bronze_tools']);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('bronze', 3);
    const furnace = stationNear(sim, person, 'furnace');
    expect(sim.order(person, 'craft', { recipeId: 'bronze_spade', buildingId: furnace.id })).toBe(true);
    for (let i = 0; i < 2500 && person.inventory.count('bronze_spade') === 0; i++) {
      person.needs.thirst = 0;
      person.needs.hunger = 0;
      sim.step();
    }
    expect(person.inventory.count('bronze_spade')).toBe(1);
    expect(person.inventory.count('bronze')).toBe(0);
  });
});

describe('bronze arms', () => {
  it('needs alloying and the spear', () => {
    const def = TECH.bronze_arms;
    expect(def.requires).toEqual(['alloying', 'spear']);
    expect(def.web).toBe('metal');
    for (const required of def.requires) {
      expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH[required].age));
    }
  });

  it('pours a sword and a helm at the furnace out of bronze', () => {
    for (const id of ['bronze_sword', 'bronze_helm']) {
      const recipe = RECIPES[id]!;
      expect(recipe.tech).toBe('bronze_arms');
      expect(recipe.station).toBe('furnace');
      expect(Object.keys(recipe.ingredients)).toEqual(['bronze']);
    }
  });

  it('is the best blade in the game for whoever knows it, and a plain stick for whoever does not', () => {
    const smith = adult('smith');
    const stranger = adult('stranger');
    teach(smith, 'bronze_arms', 'casting');
    for (const person of [smith, stranger]) {
      person.inventory.add('bronze_sword', 1);
      person.inventory.add('copper_dagger', 1);
    }
    const sword = ITEMS.bronze_sword!.weapon!;
    const dagger = ITEMS.copper_dagger!.weapon!;
    expect(sword.damage).toBeGreaterThan(dagger.damage);
    expect(sword.reach).toBeGreaterThan(dagger.reach);
    expect(weaponItemOf(smith, false)).toBe('bronze_sword');
    // The stranger has the sword and cannot swing it as a smith does; the dagger
    // is no better to them, so nothing at all.
    expect(weaponOf(stranger, false)).toBeNull();
  });

  it('turns a blow from the head, which nothing else here covers, better for whoever made it', () => {
    const helm = ITEMS.bronze_helm!;
    expect(helm.protects!.head).toBeGreaterThan(0);
    expect(helm.armourTech).toBe('bronze_arms');
    const bare = adult('bare');
    const wearer = adult('wearer');
    const smith = adult('smith');
    for (const person of [wearer, smith]) person.inventory.add('bronze_helm', 1);
    teach(smith, 'bronze_arms');
    expect(protectionOf(bare, 'head')).toBe(0);
    // A helm off a corpse is a helm: most of its worth, to anybody.
    expect(protectionOf(wearer, 'head')).toBeCloseTo(helm.protects!.head! * 0.75, 12);
    expect(protectionOf(smith, 'head')).toBeGreaterThan(protectionOf(wearer, 'head'));
    // And it covers the head and nothing else.
    expect(protectionOf(smith, 'torso')).toBe(0);
    // However well refined, no garment makes anybody unhurtable.
    smith.techLevel.set('bronze_arms', TECH.bronze_arms.maxRefinement);
    expect(protectionOf(smith, 'head')).toBeLessThan(1);
  });

  it('leaves every garment that names no technique exactly as it was', () => {
    const wearer = adult('wearer');
    wearer.inventory.add('hide_armour', 1);
    teach(wearer, 'leatherwork');
    expect(protectionOf(wearer, 'torso')).toBe(ITEMS.hide_armour!.protects!.torso);
    expect(armourOf(wearer)).toBeGreaterThan(0);
  });

  it('moves armourOf, the mean over where blows land, when the helm is worn', () => {
    const smith = adult('smith');
    teach(smith, 'bronze_arms');
    const before = armourOf(smith);
    smith.inventory.add('bronze_helm', 1);
    expect(armourOf(smith)).toBeGreaterThan(before);
  });

  it('pours a sword at the furnace end to end', () => {
    const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal', 'smelting', 'pottery', 'casting', 'ground_stone', 'hafting', 'mining', 'alloying', 'spear', 'bronze_arms']);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('bronze', 3);
    const furnace = stationNear(sim, person, 'furnace');
    expect(sim.order(person, 'craft', { recipeId: 'bronze_sword', buildingId: furnace.id })).toBe(true);
    for (let i = 0; i < 2500 && person.inventory.count('bronze_sword') === 0; i++) {
      person.needs.thirst = 0;
      person.needs.hunger = 0;
      sim.step();
    }
    expect(person.inventory.count('bronze_sword')).toBe(1);
  });
});
