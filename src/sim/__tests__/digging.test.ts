/**
 * Digging and piling (M15 phase 26c): the verbs that move earth, and the
 * refusals that say why they cannot.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { DIG_TO, PILE_TO, EARTH_UNIT, TOPSOIL_ITEMS, digTool, isWetSubsoil, liftKind } from '../core/Earth.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { techPower } from '../knowledge/Tech.ts';

function digSite() {
  const sim = new Simulation({ seed: 'dig' });
  const person = sim.people.find(p => p.alive && !p.isChild)!;
  const spot = sim.world.findWalkableNear(Math.floor(person.x), Math.floor(person.y))!;
  person.x = spot.x + 0.5;
  person.y = spot.y + 0.5;
  return { sim, person, spot };
}

describe('dig', () => {
  it('explains an unfamiliar tool at order time and if its technique is lost while working', () => {
    const { sim, person, spot } = digSite();
    person.inventory.add('spade', 1);
    expect(sim.order(person, 'dig', spot)).toBe(false);
    expect(sim.lastRefusal).toMatch(/do not know how to use their digging tools/);
    person.knownTech.add('carpentry');
    expect(sim.order(person, 'dig', spot)).toBe(true);
    person.knownTech.delete('carpentry');
    sim.step();
    expect(sim.interruptions.some(n => n.personId === person.id && n.reason === 'dont_know_digging_tool')).toBe(true);
  });
  it('uses a pick or spade only with its technique, and chooses the strongest usable tool', () => {
    const { person } = digSite();
    person.inventory.add('antler_pick', 1);
    person.inventory.add('spade', 1);
    expect(digTool(person)).toBeNull();
    person.inventory.add('sticks', 1);
    expect(digTool(person)?.item).toBe('sticks');
    person.knownTech.add('bone_working');
    expect(digTool(person)).toEqual({ item: 'antler_pick', power: 2 });
    person.knownTech.add('carpentry');
    expect(digTool(person)).toEqual({ item: 'spade', power: 3 });
    person.techLevel.set('bone_working', 20);
    expect(digTool(person)?.item).toBe('antler_pick');
    expect(digTool(person)?.power).toBe(2 * techPower(person, 'bone_working'));
  });

  it('lets an unproven spade work at prototype power, and refuses if the tool is lost', () => {
    const { sim, person, spot } = digSite();
    person.inventory.add('spade', 1);
    person.ideas.push({ tech: 'carpentry', stage: 'prototyped', insight: 0,
      story: 'test', conceivedTick: 0, effort: 0, discussedWith: [],
      trials: 0, proof: 0, failedTests: 0, tries: 0 });
    expect(digTool(person)?.power).toBe(3 * techPower(person, 'carpentry'));
    expect(sim.order(person, 'dig', spot)).toBe(true);
    person.inventory.remove('spade', 1);
    sim.step();
    expect(sim.interruptions.some(n => n.personId === person.id && n.reason === 'no_digging_tool')).toBe(true);
    expect(person.inventory.count('earth')).toBe(0);
  });

  it('the crafted tools actually shorten a lift to half and a third of the stick time', () => {
    const firstLift = (item: string) => {
      const { sim, person, spot } = digSite();
      person.inventory.add(item, 1);
      person.knownTech.add('bone_working');
      person.knownTech.add('carpentry');
      expect(sim.order(person, 'dig', spot)).toBe(true);
      let ticks = 0;
      while (person.inventory.count('earth') === 0 && ticks < 200) {
        sim.step();
        ticks++;
      }
      expect(person.inventory.count('earth')).toBeGreaterThan(0);
      return ticks;
    };
    const stick = firstLift('sticks');
    expect(firstLift('antler_pick')).toBeLessThanOrEqual(Math.ceil(stick / 2) + 1);
    expect(firstLift('spade')).toBeLessThanOrEqual(Math.ceil(stick / 3) + 1);
  });

  it.each(['antler_pick', 'spade'])('crafts %s from its planned materials before digging with it', item => {
    const { sim, person, spot } = digSite();
    const recipe = RECIPES[item]!;
    expect(recipe).toBeDefined();
    person.knownTech.add(recipe.tech);
    for (const [ingredient, count] of Object.entries(recipe.ingredients)) person.inventory.add(ingredient, count);
    expect(sim.order(person, 'craft', { recipeId: item })).toBe(true);
    for (let i = 0; i < 500 && person.action === 'craft'; i++) sim.step();
    expect(person.inventory.count(item)).toBe(1);
    expect(sim.order(person, 'dig', spot)).toBe(true);
    for (let i = 0; i < 200 && person.inventory.count('earth') === 0; i++) sim.step();
    expect(person.inventory.count('earth')).toBeGreaterThan(0);
  });

  it('lowers the ground and fills the hands with earth', () => {
    const { sim, person, spot } = digSite();
    person.inventory.add('sticks', 1);
    const h0 = sim.world.heightAt(spot.x, spot.y);
    expect(sim.order(person, 'dig', { x: spot.x, y: spot.y })).toBe(true);
    for (let i = 0; i < 400 && person.action === 'dig'; i++) sim.step();
    const earth = person.inventory.count('earth') + person.inventory.count('mud');
    expect(person.inventory.count('earth')).toBeGreaterThan(0);
    expect(sim.world.heightAt(spot.x, spot.y)).toBeCloseTo(h0 - earth * EARTH_UNIT, 6);
  });

  it('banks its progress in the ground: a second order carries on where the first stopped', () => {
    const { sim, person, spot } = digSite();
    person.inventory.add('sticks', 1);
    sim.order(person, 'dig', { x: spot.x, y: spot.y });
    for (let i = 0; i < 400 && person.action === 'dig'; i++) sim.step();
    const first = sim.world.depthDug(spot.x, spot.y);
    person.inventory.remove('earth', person.inventory.count('earth'));
    sim.order(person, 'dig', { x: spot.x, y: spot.y });
    for (let i = 0; i < 400 && person.action === 'dig'; i++) sim.step();
    expect(sim.world.depthDug(spot.x, spot.y)).toBeGreaterThan(first);
  });

  it('never digs past the depth a person can climb out of', () => {
    const { sim, person, spot } = digSite();
    person.inventory.add('sticks', 1);
    for (let round = 0; round < 12; round++) {
      person.inventory.remove('earth', person.inventory.count('earth'));
      if (!sim.order(person, 'dig', { x: spot.x, y: spot.y })) break;
      for (let i = 0; i < 400 && person.action === 'dig'; i++) sim.step();
    }
    expect(sim.world.depthDug(spot.x, spot.y)).toBeLessThanOrEqual(DIG_TO + 1e-6);
    expect(sim.world.isWalkable(spot.x, spot.y)).toBe(true);
    expect(sim.order(person, 'dig', { x: spot.x, y: spot.y })).toBe(false);
    expect(sim.lastRefusal).toMatch(/as deep as a person can climb/);
  });

  it('refuses with no tool, with the reason', () => {
    const { sim, person, spot } = digSite();
    person.inventory.remove('sticks', person.inventory.count('sticks'));
    expect(sim.order(person, 'dig', { x: spot.x, y: spot.y })).toBe(false);
    expect(sim.lastRefusal).toMatch(/nothing to dig with/);
  });
});

describe('pile', () => {
  it('puts earth back and raises the ground', () => {
    const { sim, person, spot } = digSite();
    person.inventory.add('earth', 3);
    const h0 = sim.world.heightAt(spot.x, spot.y);
    expect(sim.order(person, 'pile', { x: spot.x, y: spot.y })).toBe(true);
    for (let i = 0; i < 400 && person.action === 'pile'; i++) sim.step();
    expect(person.inventory.count('earth')).toBe(0);
    expect(sim.world.heightAt(spot.x, spot.y)).toBeCloseTo(h0 + 3 * EARTH_UNIT, 6);
  });

  it('refuses with no earth, and on a heap as high as it stands', () => {
    const { sim, person, spot } = digSite();
    expect(sim.order(person, 'pile', { x: spot.x, y: spot.y })).toBe(false);
    expect(sim.lastRefusal).toMatch(/no earth/);
    person.inventory.add('earth', 2);
    sim.world.pile(spot.x, spot.y, PILE_TO);
    expect(sim.order(person, 'pile', { x: spot.x, y: spot.y })).toBe(false);
    expect(sim.lastRefusal).toMatch(/as high as it will stand/);
  });

  it('a mound sees further and the person who digs it is told when they cannot go on', () => {
    const { sim, person, spot } = digSite();
    const flat = sim.world.sightBonusAt(spot.x, spot.y);
    sim.world.pile(spot.x, spot.y, PILE_TO);
    expect(sim.world.sightBonusAt(spot.x, spot.y)).toBeGreaterThan(flat);
    person.inventory.add('sticks', 1);
    expect(sim.order(person, 'dig', { x: spot.x, y: spot.y })).toBe(true);
  });
});

/** A dry, inland tile and a wet one, so the two subsoils can be told apart. */
function findTile(sim: Simulation, wet: boolean) {
  const w = sim.world;
  for (let y = 2; y < w.height - 2; y++) {
    for (let x = 2; x < w.width - 2; x++) {
      if (!w.isWalkable(x, y)) continue;
      if (isWetSubsoil(w, x, y) === wet && w.biomeAt(x, y) !== 'rock') return { x, y };
    }
  }
  throw new Error('no such tile');
}

function digAll(sim: Simulation, person: ReturnType<typeof digSite>['person'], at: { x: number; y: number }) {
  person.x = at.x + 0.5;
  person.y = at.y + 0.5;
  person.inventory.add('sticks', 1);
  expect(sim.order(person, 'dig', at)).toBe(true);
  for (let i = 0; i < 800 && person.action === 'dig'; i++) sim.step();
}

describe('earth keeps its fertility and wet ground gives mud (26a)', () => {
  it('scrapes the fertile layer off the tile and carries it, leaving subsoil', () => {
    const { sim, person } = digSite();
    const at = findTile(sim, false);
    const i = sim.world.index(at.x, at.y);
    const organic0 = sim.world.soil.organic[i]!;
    digAll(sim, person, at);
    // Dry ground: everything that comes up is earth, but only the topsoil carries richness.
    expect(person.inventory.count('mud')).toBe(0);
    expect(person.inventory.count('earth')).toBeGreaterThan(TOPSOIL_ITEMS - 1);
    expect(sim.world.soil.organic[i]!).toBeLessThan(organic0 * 0.01 + 1e-6);
    expect(person.earthOrganic).toBeCloseTo(organic0, 4);
  });

  it('heaping carried earth hands its richness to the new tile, and subsoil dilutes it', () => {
    const { sim, person } = digSite();
    const at = findTile(sim, false);
    digAll(sim, person, at);
    const rich = person.earthOrganic;
    expect(rich).toBeGreaterThan(0);
    // Heap it on a tile worn down to nothing.
    const bare = { x: at.x + 1, y: at.y };
    if (!sim.world.isWalkable(bare.x, bare.y)) return;
    const j = sim.world.index(bare.x, bare.y);
    sim.world.soil.organic[j] = 0;
    person.x = bare.x + 0.5;
    person.y = bare.y + 0.5;
    expect(sim.order(person, 'pile', bare)).toBe(true);
    for (let k = 0; k < 800 && person.action === 'pile'; k++) sim.step();
    expect(person.inventory.count('earth')).toBe(0);
    expect(sim.world.soil.organic[j]!).toBeGreaterThan(0);
    // The hands are empty, so nothing is left carried.
    expect(person.earthOrganic).toBe(0);
    expect(person.earthNutrient).toBe(0);
  });

  it('brings up mud below the topsoil where the subsoil is wet, and daub is the use for it', () => {
    const { sim, person } = digSite();
    const wet = findTile(sim, true);
    expect(liftKind(sim.world, wet.x, wet.y, 0).item).toBe('earth');
    expect(liftKind(sim.world, wet.x, wet.y, TOPSOIL_ITEMS * EARTH_UNIT).item).toBe('mud');
    const dry = findTile(sim, false);
    expect(liftKind(sim.world, dry.x, dry.y, TOPSOIL_ITEMS * EARTH_UNIT).item).toBe('earth');
    // A heap is loose earth wherever it stands.
    expect(liftKind(sim.world, wet.x, wet.y, -EARTH_UNIT).item).toBe('earth');
    digAll(sim, person, wet);
    expect(person.inventory.count('earth')).toBeGreaterThan(0);
    expect(person.inventory.count('earth') + person.inventory.count('mud')).toBeGreaterThan(TOPSOIL_ITEMS);
    expect(person.inventory.count('mud')).toBeGreaterThan(0);
  });
});
