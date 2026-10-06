/**
 * The recipe and weapon nodes that open the sub-webs (M15 phase 13d).
 *
 * One block per node, added in the commit that adds the node. Each asserts the
 * three things "no node ships inert" asks for: the node is declared the way the
 * plan says (tier, requirements, age), something in the world reads it, and the
 * thing it unlocks works end to end where a person can reach it.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { KnowledgeSystem } from '../systems/KnowledgeSystem.ts';
import { Person, DAYS_PER_YEAR } from '../entities/Person.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { World } from '../core/World.ts';
import { makeConfig } from '../core/Config.ts';
import { TECH, WEBS, SUB_WEBS, ageIndex, difficultyOf, tierOf, webOf, techsOfWeb } from '../knowledge/Tech.ts';
import { sparkFires, type Notice } from '../knowledge/Synthesis.ts';
import { weaponOf, techPower } from '../knowledge/Tech.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { SICKENS } from '../entities/Body.ts';
import type { Building } from '../entities/Building.ts';

const SMALL = {
  seed: 'craft-nodes',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};
const config = makeConfig({ seed: 'craft-nodes-ctx' });

/** A quiet person with an empty pack, so a test measures what it means to. */
function settle(person: Person): void {
  person.needs.thirst = 0;
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.workedTicks = 0;
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
}

/** A notice with exactly these things true, for reading one spark. */
function notice(parts: Partial<Notice>): Notice {
  return {
    knows: new Set(), holding: new Set(), lately: new Set(), feeling: new Set(),
    wanting: new Set(), place: 'grass', saw: new Set(), season: 'summer', ...parts,
  };
}

function adult(name: string): Person {
  const person = new Person(name, 4, 4, 0, new RNG('craft-nodes-' + name));
  person.age = 30 * DAYS_PER_YEAR;
  return person;
}

describe('stone_boiling and the broth', () => {
  it('is a craft that needs cooking and leatherwork', () => {
    const def = TECH.stone_boiling;
    expect(tierOf('stone_boiling')).toBe('craft');
    expect(def.requires).toEqual(['cooking', 'leatherwork']);
    expect(def.age).toBe('upper_palaeolithic');
    expect(def.firstKnown.length).toBeGreaterThan(0);
    expect(def.kind).toBe('device');
  });

  it('is hit upon at 0.4 of its written difficulty', () => {
    expect(difficultyOf('stone_boiling', config.knowledge)).toBeCloseTo(TECH.stone_boiling.difficulty * 0.4, 12);
  });

  it('gives the broth recipe at the hearth: two bones for one ration', () => {
    const recipe = RECIPES.broth!;
    expect(recipe.tech).toBe('stone_boiling');
    expect(recipe.station).toBe('hearth');
    expect(recipe.ingredients).toEqual({ bone: 2 });
    expect(recipe.output).toEqual({ broth: 1 });
    expect(recipe.keep).toBeGreaterThan(0);
  });

  it('makes a food of fat and protein, which cannot make anybody ill', () => {
    const broth = ITEMS.broth!;
    expect(broth.nutrition).toBeGreaterThan(0);
    expect(broth.macros!.fat).toBeGreaterThan(0);
    expect(broth.macros!.protein).toBeGreaterThan(0);
    expect(broth.macros!.carb).toBe(0);
    expect(broth.macros!.fat + broth.macros!.protein + broth.macros!.carb).toBeCloseTo(1, 9);
    expect(SICKENS.broth).toBeUndefined();
    // Bone was worth nothing as food; two of them are worth a ration now.
    expect(ITEMS.bone!.nutrition).toBe(0);
  });

  it('occurs to whoever roasts with bones to hand, and by a route that needs no bone', () => {
    const [byBones, byHide, byVariety] = TECH.stone_boiling.sparks;
    const cook = ['cooking'];
    expect(sparkFires(byBones!, notice({
      knows: new Set(cook), lately: new Set(['craft']), holding: new Set(['bone']),
    }))).toBe(true);
    // Roasting alone is not enough: the bones have to be there.
    expect(sparkFires(byBones!, notice({ knows: new Set(cook), lately: new Set(['craft']) }))).toBe(false);
    expect(sparkFires(byHide!, notice({
      knows: new Set(['cooking', 'leatherwork']), feeling: new Set(['hunger']), lately: new Set(['eat']),
    }))).toBe(true);
    expect(byVariety!.needs.some(n => n.kind === 'wanting')).toBe(true);
    // 13b's guidance: a craft's routes are mostly doing and handling.
    for (const spark of TECH.stone_boiling.sparks) {
      expect(spark.needs.some(n => n.kind === 'doing' || n.kind === 'holding' || n.kind === 'wanting')).toBe(true);
    }
  });

  it('is passed on over small talk to somebody who has what it rests on', () => {
    const knowledge = new KnowledgeSystem();
    const cook = adult('Cook');
    const friend = adult('Friend');
    const stranger = adult('Stranger');
    cook.knownTech.add('stone_boiling');
    cook.skills.teach = 100;
    friend.knownTech.add('cooking');
    friend.knownTech.add('leatherwork');
    const rng = new RNG('broth-talk');
    for (let i = 0; i < 40; i++) {
      knowledge.conversationLesson(cook, friend, 'chat', 1000, rng, () => 1);
      knowledge.conversationLesson(cook, stranger, 'chat', 1000, rng, () => 1);
    }
    expect(friend.knownTech.has('stone_boiling')).toBe(true);
    expect(stranger.knownTech.has('stone_boiling')).toBe(false);
  });

  it('is proven by tasting the first broth, which the food scorer then believes in', () => {
    const knowledge = new KnowledgeSystem();
    const person = adult('Taster');
    person.knownTech.add('cooking');
    person.knownTech.add('leatherwork');
    expect(person.beliefs.expect('eat:broth').confidence).toBe(0);
    const idea = {
      tech: 'stone_boiling' as const, stage: 'prototyped' as const, insight: 1, story: 'for the test',
      conceivedTick: 0, effort: 0, discussedWith: [], trials: 0, proof: 1, failedTests: 0, tries: 0,
    };
    person.ideas.push(idea);
    const ctx = {
      rng: new RNG('prove'), tick: 1000, peopleHash: new SpatialHash<Person>(8),
      world: new World(config.world, new RNG('prove-world')), season: 'summer' as const,
      ticksPerDay: config.time.ticksPerDay, knowledge: config.knowledge, learning: config.learning,
      pileHash: new SpatialHash(8), buildingHash: new SpatialHash(8), carry: config.carry,
      onInsight: () => {},
    };
    (knowledge as unknown as { prove(p: Person, i: typeof idea, c: typeof ctx): void }).prove(person, idea, ctx);
    expect(person.knownTech.has('stone_boiling')).toBe(true);
    const belief = person.beliefs.expect('eat:broth');
    expect(belief.confidence).toBeGreaterThan(0);
    expect(belief.value).toBe(ITEMS.broth!.nutrition);
  });

  it('is made at a hearth from two bones, end to end', () => {
    const sim = new Simulation({
      ...SMALL,
      population: { ...SMALL.population, startingTech: ['firemaking', 'cooking', 'clothing', 'leatherwork', 'stone_boiling'] },
    });
    for (let i = 0; i < 300; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('bone', 2);
    let hearth: Building | null = null;
    for (const [dx, dy] of [[4, 4], [-4, 4], [4, -4], [-4, -4], [6, 0], [0, 6]]) {
      hearth = sim.place('hearth', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
      if (hearth) break;
    }
    expect(hearth).not.toBeNull();
    hearth!.complete = true;

    expect(sim.order(person, 'craft', { recipeId: 'broth', buildingId: hearth!.id })).toBe(true);
    for (let i = 0; i < 900 && person.inventory.count('broth') === 0; i++) {
      settle(person);
      person.inventory.add('bone', 2);
      sim.step();
    }
    expect(person.inventory.count('broth')).toBe(1);
    expect(hearth!.contains(person.x, person.y)).toBe(true);
  });

  it('refuses the recipe to somebody who does not know it', () => {
    const sim = new Simulation({
      ...SMALL,
      population: { ...SMALL.population, startingTech: ['firemaking', 'cooking'] },
    });
    for (let i = 0; i < 300; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('bone', 2);
    expect(sim.order(person, 'craft', { recipeId: 'broth' })).toBe(false);
  });
});


describe('flatbread and the opening of Kitchen', () => {
  it('is a craft that needs cooking and grinding, from the Epipaleolithic', () => {
    const def = TECH.flatbread;
    expect(tierOf('flatbread')).toBe('craft');
    expect(def.requires).toEqual(['cooking', 'grinding']);
    expect(def.age).toBe('mesolithic');
    expect(def.firstKnown).toContain('14,400');
    expect(def.kind).toBe('device');
    expect(difficultyOf('flatbread', config.knowledge)).toBeCloseTo(def.difficulty * 0.4, 12);
  });

  it('opens the Kitchen web at cooking, now that it has two nodes, and moves stone boiling in', () => {
    expect(WEBS.kitchen.gate).toBe('cooking');
    expect(TECH.cooking.opens).toBe('kitchen');
    expect(techsOfWeb('kitchen')).toEqual(['stone_boiling', 'flatbread']);
    expect(SUB_WEBS.map(web => web.id)).toContain('kitchen');
    expect(webOf('flatbread')).toBe('kitchen');
    expect(webOf('stone_boiling')).toBe('kitchen');
  });

  it('gives the recipe on the hearth stone: no oven, one meal for one flatbread', () => {
    const recipe = RECIPES.flatbread!;
    expect(recipe.tech).toBe('flatbread');
    expect(recipe.station).toBe('hearth');
    expect(recipe.ingredients).toEqual({ meal: 1 });
    expect(recipe.output).toEqual({ flatbread: 1 });
    // Bread before the oven: it needs nothing the oven needs.
    expect(RECIPES.bread!.station).toBe('oven');
  });

  it('is a cooked food of carbohydrate, worth more than the meal it is made from and less than loaf bread', () => {
    const flatbread = ITEMS.flatbread!;
    expect(flatbread.nutrition).toBeGreaterThan(ITEMS.meal!.nutrition);
    expect(flatbread.nutrition).toBeLessThan(ITEMS.bread!.nutrition);
    expect(flatbread.macros!.carb).toBeGreaterThan(0.5);
    expect(flatbread.macros!.fat + flatbread.macros!.protein + flatbread.macros!.carb).toBeCloseTo(1, 9);
    expect(SICKENS.flatbread).toBeUndefined();
    // It goes stale; the oven's bread is the one that keeps.
    expect(flatbread.spoilTicks).toBeGreaterThan(0);
    expect(ITEMS.bread!.spoilTicks).toBe(0);
  });

  it('occurs to somebody who grinds and cooks, by routes that need nothing rare', () => {
    const [byMeal, byGrinding] = TECH.flatbread.sparks;
    expect(sparkFires(byMeal!, notice({
      knows: new Set(['cooking', 'grinding']), holding: new Set(['meal']),
    }))).toBe(true);
    expect(sparkFires(byMeal!, notice({ knows: new Set(['cooking', 'grinding']) }))).toBe(false);
    expect(sparkFires(byGrinding!, notice({
      knows: new Set(['cooking', 'grinding']), lately: new Set(['craft']),
    }))).toBe(true);
  });

  it('is passed on over small talk to somebody who can grind and cook', () => {
    const knowledge = new KnowledgeSystem();
    const baker = adult('Baker');
    const friend = adult('Friend');
    const stranger = adult('Stranger');
    baker.knownTech.add('flatbread');
    baker.skills.teach = 100;
    for (const tech of ['cooking', 'grinding']) friend.knownTech.add(tech);
    stranger.knownTech.add('cooking');
    const rng = new RNG('flatbread-talk');
    for (let i = 0; i < 40; i++) {
      knowledge.conversationLesson(baker, friend, 'interests', 1000, rng, () => 1);
      knowledge.conversationLesson(baker, stranger, 'interests', 1000, rng, () => 1);
    }
    expect(friend.knownTech.has('flatbread')).toBe(true);
    expect(stranger.knownTech.has('flatbread')).toBe(false);
  });

  it('is baked on a hearth from meal, end to end, and the meal is spent', () => {
    const sim = new Simulation({
      ...SMALL,
      population: { ...SMALL.population, startingTech: ['firemaking', 'cooking', 'stoneworking', 'grinding', 'flatbread'] },
    });
    for (let i = 0; i < 300; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('meal', 1);
    let hearth: Building | null = null;
    for (const [dx, dy] of [[4, 4], [-4, 4], [4, -4], [-4, -4], [6, 0], [0, 6]]) {
      hearth = sim.place('hearth', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
      if (hearth) break;
    }
    expect(hearth).not.toBeNull();
    hearth!.complete = true;
    expect(sim.order(person, 'craft', { recipeId: 'flatbread', buildingId: hearth!.id })).toBe(true);
    for (let i = 0; i < 900 && person.inventory.count('flatbread') === 0; i++) {
      settle(person);
      person.inventory.add('meal', 1);
      sim.step();
    }
    expect(person.inventory.count('flatbread')).toBe(1);
  });
});

describe('fire_hardened_spear and the spear that hits harder', () => {
  function hunter(name: string, ...techs: string[]): Person {
    const person = adult(name);
    for (const tech of techs) { person.knownTech.add(tech); person.techLevel.set(tech, 0); }
    person.inventory.add('spear', 1);
    return person;
  }

  it('is a craft that needs the spear and fire, in the Weapons web', () => {
    const def = TECH.fire_hardened_spear;
    expect(tierOf('fire_hardened_spear')).toBe('craft');
    expect(def.requires).toEqual(['spear', 'firemaking']);
    expect(def.firstKnown.length).toBeGreaterThan(0);
    expect(webOf('fire_hardened_spear')).toBe('arms');
    expect(techsOfWeb('arms')).toContain('fire_hardened_spear');
    expect(difficultyOf('fire_hardened_spear', config.knowledge))
      .toBeCloseTo(def.difficulty * 0.4, 12);
  });

  it('is no earlier than what it rests on (the age test), and tried by hunting', () => {
    const def = TECH.fire_hardened_spear;
    expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH.spear.age));
    expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH.firemaking.age));
    expect(def.kind).toBe('practice');
    expect(def.practisedBy).toContain('hunt');
  });

  it('makes the spear hit harder for whoever knows it, in a hunt and in a fight', () => {
    const plain = hunter('Plain', 'spear', 'firemaking');
    const hard = hunter('Hard', 'spear', 'firemaking', 'fire_hardened_spear');
    const a = weaponOf(plain, true)!;
    const b = weaponOf(hard, true)!;
    // `doHunt` reads `hunt * power` and `doAttack` reads `damage * power`.
    expect(b.hunt * b.power).toBeGreaterThan(a.hunt * a.power);
    const c = weaponOf(plain, false)!;
    const d = weaponOf(hard, false)!;
    expect(d.damage * d.power).toBeGreaterThan(c.damage * c.power);
    expect(b.hunt).toBe(a.hunt);
    expect(b.damage).toBe(a.damage);
  });

  it('is one term: nobody who lacks it, and no weapon but the spear, is touched', () => {
    const plain = hunter('Plain', 'spear');
    const power = weaponOf(plain, false)!.power;
    expect(power).toBe(techPower(plain, 'spear'));
    const archer = adult('Archer');
    archer.knownTech.add('bow'); archer.techLevel.set('bow', 0);
    archer.knownTech.add('fire_hardened_spear'); archer.techLevel.set('fire_hardened_spear', 0);
    archer.inventory.add('bow', 1);
    expect(weaponOf(archer, true)!.power).toBe(techPower(archer, 'bow'));
    // Refining it hardens the spear further, up to its own ceiling.
    const hard = hunter('Hard', 'spear', 'fire_hardened_spear');
    const level0 = weaponOf(hard, false)!.power;
    hard.techLevel.set('fire_hardened_spear', 2);
    expect(weaponOf(hard, false)!.power).toBeGreaterThan(level0);
  });

  it('occurs to a hunter with a spear and a fire, by routes that need nothing rare', () => {
    const [byHunt, byCraft, byEscape] = TECH.fire_hardened_spear.sparks;
    const base = { knows: new Set(['spear', 'firemaking']) };
    expect(sparkFires(byHunt!, notice({ ...base, holding: new Set(['spear']), lately: new Set(['hunt']) }))).toBe(true);
    expect(sparkFires(byHunt!, notice(base))).toBe(false);
    expect(sparkFires(byCraft!, notice({ ...base, holding: new Set(['sticks']), lately: new Set(['craft']) }))).toBe(true);
    expect(sparkFires(byEscape!, notice({ ...base, saw: new Set(['quarry_escaped']) }))).toBe(true);
    for (const spark of TECH.fire_hardened_spear.sparks) {
      expect(spark.needs.some(n => n.kind === 'doing' || n.kind === 'holding' || n.kind === 'saw')).toBe(true);
    }
  });

  it('is passed on over small talk to somebody who has the spear and the fire', () => {
    const knowledge = new KnowledgeSystem();
    const teacher = adult('Smith');
    const friend = adult('Friend');
    const stranger = adult('Stranger');
    teacher.knownTech.add('fire_hardened_spear');
    teacher.skills.teach = 100;
    for (const tech of ['spear', 'firemaking']) friend.knownTech.add(tech);
    stranger.knownTech.add('spear');
    const rng = new RNG('spear-talk');
    for (let i = 0; i < 40; i++) {
      knowledge.conversationLesson(teacher, friend, 'chat', 1000, rng, () => 1);
      knowledge.conversationLesson(teacher, stranger, 'chat', 1000, rng, () => 1);
    }
    expect(friend.knownTech.has('fire_hardened_spear')).toBe(true);
    expect(stranger.knownTech.has('fire_hardened_spear')).toBe(false);
  });
});
