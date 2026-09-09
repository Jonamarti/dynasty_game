/**
 * The tech tree's structural invariants.
 *
 * These are cheap assertions about a data table rather than questions about the
 * world, which is why they live here and not in `simcheck`. Every one of them
 * exists because the thing it forbids actually happened:
 *
 *  - `longhouse` was gated behind `requiresTech: 'carpentry'` while `carpentry`
 *    was not a member of `TECHS`, so it was unbuildable for its entire
 *    existence, always listed as locked, and nothing anywhere noticed.
 *  - `farming` sat at the top of the tree gating a whole era and did nothing at
 *    all on the ground. `TECH_EFFECTS` is the guard against a second one.
 */
import { describe, it, expect } from 'vitest';
import {
  TECH, TECHS, TECH_EFFECTS, ERAS, ERA_ORDER, eraFor, reachableFrom,
  techPower, carryFactor, forageYieldFactor, nutritionFactor, warmthFrom,
  type Tech,
} from '../knowledge/Tech.ts';
import { BUILDINGS, isStation } from '../entities/Building.ts';
import { ITEMS } from '../entities/Item.ts';
import { RESOURCE_DEFS } from '../entities/ResourceNode.ts';
import { TREES } from '../entities/Tree.ts';
import { RECIPES, craftableItems, recipeFor } from '../entities/Recipe.ts';
import { INSCRIPTIONS, Inscription } from '../entities/Inscription.ts';
import { Person, SKILLS } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';

function someone(): Person {
  return new Person('Test', 0, 0, 0, new RNG('tech-test'));
}

describe('the tech table', () => {
  it('gives every technology an effect', () => {
    // The invariant behind "no node ships inert". If this fails you have added
    // a technology without wiring anything to it — add the effect, or leave the
    // node out until you do.
    for (const tech of TECHS) {
      expect(TECH_EFFECTS[tech], tech + ' has no declared effect').toBeDefined();
      expect(TECH_EFFECTS[tech].summary.length).toBeGreaterThan(0);
      expect(TECH_EFFECTS[tech].site.length).toBeGreaterThan(0);
    }
    expect(Object.keys(TECH_EFFECTS).sort()).toEqual([...TECHS].sort());
  });

  it('declares each technology under its own id, with a real skill', () => {
    for (const tech of TECHS) {
      expect(TECH[tech].id).toBe(tech);
      expect(SKILLS).toContain(TECH[tech].skill);
      expect(TECH[tech].difficulty).toBeGreaterThan(0);
      expect(TECH[tech].difficulty).toBeLessThanOrEqual(1);
    }
  });

  it('only names prerequisites that exist', () => {
    for (const tech of TECHS) {
      for (const required of TECH[tech].requires) {
        expect(TECHS, tech + ' requires unknown ' + required).toContain(required);
      }
    }
  });

  it('has no cycles, so everything is reachable from nothing', () => {
    // Walk the tree the way a person does: start knowing nothing and keep
    // taking whatever has become reachable. Anything a cycle encloses is never
    // reachable and would be left over.
    const known = new Set<string>();
    for (let pass = 0; pass < TECHS.length + 1; pass++) {
      const next = reachableFrom(known);
      if (next.length === 0) break;
      for (const tech of next) known.add(tech);
    }
    expect([...known].sort()).toEqual([...TECHS].sort());
  });

  it('gates buildings only on technologies that exist', () => {
    // The check that would have caught the longhouse.
    for (const def of Object.values(BUILDINGS)) {
      if (def.requiresTech === null) continue;
      expect(TECHS, def.id + ' requires unknown tech ' + def.requiresTech)
        .toContain(def.requiresTech as Tech);
    }
  });

  it('makes a sewn coat the largest thing anybody carries against the cold', () => {
    // M8.1's third term in `warmthFrom`, and the double gate the basket and the
    // net already use: knowing how is not enough, and carrying one is not
    // enough either. A coat in the hands of somebody who could not have made it
    // is a heap of skins — the rule `handaxe` still breaks.
    const bare = someone();
    const sewer = someone();
    sewer.knownTech.add('tailoring');
    const carrier = someone();
    carrier.inventory.add('fur_coat', 1);
    const clad = someone();
    clad.knownTech.add('tailoring');
    clad.inventory.add('fur_coat', 1);

    expect(warmthFrom(sewer)).toBe(warmthFrom(bare));
    expect(warmthFrom(carrier)).toBe(warmthFrom(bare));
    expect(warmthFrom(clad)).toBeGreaterThan(warmthFrom(bare));
    // And it stacks with the other two answers without ever reaching 1, which
    // is what would invert the chill into warming.
    const everything = someone();
    everything.knownTech.add('tailoring');
    everything.knownTech.add('firemaking');
    everything.knownTech.add('clothing');
    everything.inventory.add('fur_coat', 1);
    expect(warmthFrom(everything)).toBeGreaterThan(warmthFrom(clad));
    expect(warmthFrom(everything)).toBeLessThan(1);
  });

  it('sends station recipes to buildings that exist and are stations', () => {
    // M8.1, mechanism 4, and the same shape of check as the one above it. A
    // `station: 'kiln'` with no kiln in `BUILDINGS` is the longhouse defect one
    // table along: the recipe would be offered, ordered, refused every time, and
    // every other test in the suite would pass. Naming a building that exists
    // but is not flagged `station` is the same failure wearing a coat — the
    // planner would never raise it and the catalogue would never offer the
    // recipe on it.
    for (const recipe of Object.values(RECIPES)) {
      if (recipe.station === undefined) continue;
      const def = BUILDINGS[recipe.station];
      expect(def, recipe.id + ' is made at unknown building ' + recipe.station)
        .toBeDefined();
      expect(isStation(def!), recipe.station + ' is not flagged as a station').toBe(true);
    }
  });

  it('gives every station something that can be made at it', () => {
    // The arrow reversed, and the rule `Recipe.ts` was written to keep: a
    // workshop nothing has a recipe for is declared content that does nothing,
    // and the band planner would spend a site slot on it every time.
    for (const def of Object.values(BUILDINGS)) {
      if (!isStation(def)) continue;
      expect(
        Object.values(RECIPES).some(recipe => recipe.station === def.id),
        def.id + ' is a station with no recipe'
      ).toBe(true);
    }
  });

  it('only asks buildings for materials the world can actually produce', () => {
    // The check that would have caught the granary, and the companion to the
    // one above: gating on a technology that exists is not enough if the thing
    // it unlocks asks for an item nothing can make.
    //
    // `granary` wanted six `pottery` and `pottery` was the one id in `ITEMS`
    // with no source anywhere — not a resource node, not a tree, not a kill,
    // not a recipe. It had been the best store in the game and unbuildable for
    // its whole existence, exactly like the longhouse, and every existing test
    // passed.
    const producible = new Set<string>([
      ...Object.values(RESOURCE_DEFS).map(def => def.itemId),
      ...Object.values(TREES).map(def => def.fruitItem).filter(id => id !== null),
      // Taken off a kill in `doHunt`.
      'meat', 'hide',
      // Cut from a felled trunk in `doChop`.
      'wood',
      ...craftableItems(),
    ] as string[]);

    for (const def of Object.values(BUILDINGS)) {
      for (const itemId of Object.keys(def.materials)) {
        expect(ITEMS[itemId], def.id + ' asks for unknown item ' + itemId).toBeDefined();
        expect(
          producible.has(itemId),
          def.id + ' asks for ' + itemId + ', which nothing in the world produces'
        ).toBe(true);
      }
    }
  });

  it('gates at least one building on something, and that thing is reachable', () => {
    const gated = Object.values(BUILDINGS).filter(d => d.requiresTech !== null);
    expect(gated.length).toBeGreaterThan(0);
  });
});

describe('eras', () => {
  it('orders every era and only real technologies', () => {
    expect(ERA_ORDER).toEqual(ERAS.map(e => e.id));
    for (const era of ERAS) {
      for (const tech of era.needs) expect(TECHS).toContain(tech);
    }
  });

  it('needs strictly more as it goes on, so an era cannot be skipped backwards', () => {
    for (let i = 1; i < ERAS.length; i++) {
      expect(ERAS[i]!.needs.length).toBeGreaterThanOrEqual(ERAS[i - 1]!.needs.length);
    }
  });

  it('falls back to the stone age when everybody is gone', () => {
    expect(eraFor(new Map(), 0).id).toBe('stone');
  });

  it('rises and falls with how many people hold the knowledge', () => {
    const holders = new Map<Tech, number>([['firemaking', 8]]);
    expect(eraFor(holders, 10).id).toBe('fire');
    // The same knowledge in fewer heads is not an age.
    holders.set('firemaking', 1);
    expect(eraFor(holders, 10).id).toBe('stone');
  });
});

describe('technology in one person’s hands', () => {
  it('is worth nothing until it is known', () => {
    const person = someone();
    expect(techPower(person, 'cordage')).toBe(0);
    expect(carryFactor(person)).toBe(1);
    expect(nutritionFactor(person)).toBe(1);
    expect(warmthFrom(person)).toBe(0);
  });

  it('pays out once it is', () => {
    const person = someone();
    person.knownTech.add('cordage');
    expect(carryFactor(person)).toBeCloseTo(1.25);

    person.knownTech.add('cooking');
    expect(nutritionFactor(person)).toBeCloseTo(1.35);
  });

  it('tells flint from berries, because different knowledge lies behind them', () => {
    const person = someone();
    person.knownTech.add('plant_lore');
    expect(forageYieldFactor(person, 'berries')).toBeCloseTo(1.3);
    expect(forageYieldFactor(person, 'flint')).toBe(1);

    person.knownTech.add('stoneworking');
    expect(forageYieldFactor(person, 'flint')).toBeCloseTo(1.5);
  });

  it('stacks fire and clothing without ever reaching total warmth', () => {
    // Adding them would put a clothed firemaker past 1, which inverts the chill
    // into warming and makes February the most comfortable month of the year.
    const person = someone();
    person.knownTech.add('firemaking');
    person.knownTech.add('clothing');
    const both = warmthFrom(person);
    expect(both).toBeGreaterThan(0.45);
    expect(both).toBeLessThan(1);
  });

  it('carries more with cordage than without', () => {
    const bare = someone();
    const equipped = someone();
    equipped.age = bare.age;
    equipped.knownTech.add('cordage');
    expect(equipped.carryCapacity).toBeGreaterThan(bare.carryCapacity);
  });
});

describe('recipes', () => {
  it('names only things that exist', () => {
    // Ingredients and outputs are plain strings, so a typo would be a recipe
    // nobody could ever complete while every other test went on passing. This
    // is the same guard `spark-ingredients-are-real` provides for the sparks.
    for (const recipe of Object.values(RECIPES)) {
      expect(recipe.id).toBe(recipe.id);
      expect(TECHS, recipe.id + ' needs unknown tech ' + recipe.tech).toContain(recipe.tech);
      expect(SKILLS, recipe.id + ' names unknown skill ' + recipe.skill).toContain(recipe.skill);
      expect(recipe.workTicks).toBeGreaterThan(0);
      const parts = Object.entries(recipe.ingredients);
      expect(parts.length, recipe.id + ' is made of nothing').toBeGreaterThan(0);
      for (const [itemId, count] of parts) {
        expect(ITEMS[itemId], recipe.id + ' needs unknown item ' + itemId).toBeDefined();
        expect(count).toBeGreaterThan(0);
      }
      const out = Object.entries(recipe.output);
      expect(out.length, recipe.id + ' produces nothing').toBe(1);
      for (const [itemId, count] of out) {
        expect(ITEMS[itemId], recipe.id + ' produces unknown item ' + itemId).toBeDefined();
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  it('makes nothing out of itself', () => {
    // A recipe whose output is one of its own ingredients would let a person
    // stand in a field turning one pot into one pot for ever, and the scorer
    // would rate it as work.
    for (const recipe of Object.values(RECIPES)) {
      for (const itemId of Object.keys(recipe.output)) {
        expect(
          recipe.ingredients[itemId],
          recipe.id + ' consumes what it produces'
        ).toBeUndefined();
      }
    }
  });

  it('gives a reason to make everything it can make', () => {
    // "No node ships inert", applied to recipes. A recipe is worth having only
    // if somebody would ever want its output: either it is worth carrying for
    // its own sake (`keep`), or some building is built out of it. Without this
    // the table would happily grow entries nothing in the world consumes.
    const wantedByBuildings = new Set<string>();
    for (const def of Object.values(BUILDINGS)) {
      for (const itemId of Object.keys(def.materials)) wantedByBuildings.add(itemId);
    }
    for (const recipe of Object.values(RECIPES)) {
      const output = Object.keys(recipe.output)[0]!;
      expect(
        recipe.keep > 0 || wantedByBuildings.has(output),
        recipe.id + ' makes ' + output + ', which nothing wants'
      ).toBe(true);
    }
  });

  it('can be finished by somebody with no skill at all', () => {
    // A job done in **one uninterrupted pull** has to fit inside a stretch of
    // work, or nobody unskilled can ever finish it: the interruption check
    // stops the stretch, the action restarts from the beginning, and the person
    // spends their life on the same half-made thing. In practice the binding
    // limit is tighter than `MAX_WORK_STRETCH` — a novice picks up thirty-five
    // points of thirst in four hundred ticks and thirst interrupts first — so
    // the ceiling here is deliberately conservative.
    //
    // Inscriptions are *not* in this list, and that is the point: cutting a
    // stone takes twelve hundred ticks for a novice, which no ceiling could
    // accommodate, so the work banks on the record the way it banks on a
    // building site. That is the escape hatch for anything genuinely long —
    // bank the progress somewhere, do not shrink the job until it fits.
    //
    // Actions that work in short repeated cycles — harvesting, felling — are
    // unaffected either way, because the check runs between cycles.
    //
    // **Recipes used to be held to the tight ceiling and no longer are**, and
    // the reason is the escape hatch above rather than a relaxed standard:
    // `doCraft` banks its hours on the crafter now, so an interrupted craft
    // resumes where it stopped instead of starting again. The bow is what
    // exposed the stale premise — 140 ticks is exactly 400 for a novice — and
    // shortening it to squeeze under a line that had stopped meaning anything
    // would have been the wrong fix. What guards the banking is an end-to-end
    // case in `orders.test.ts`, "banks its hours so an interrupted craft is not
    // begun again"; what is left here is a sanity bound, because a recipe longer
    // than a whole stretch of work is still a design mistake.
    const NOVICE = 0.35;
    const CEILING = 400;
    for (const recipe of Object.values(RECIPES)) {
      expect(recipe.workTicks / NOVICE, recipe.id + ' is longer than any one stretch')
        .toBeLessThan(900);
    }
    // The counterpart: anything longer than that had better be banking work.
    for (const def of Object.values(INSCRIPTIONS)) {
      if (def.workTicks / NOVICE < CEILING) continue;
      const record = new Inscription(def, 0, 0, { id: 1, name: 'T' }, 0);
      record.begin('cordage');
      record.addWork(1);
      expect(record.progress, def.id + ' is long and banks nothing').toBeGreaterThan(0);
    }
  });

  it('finds the recipe for a made item and not for a gathered one', () => {
    expect(recipeFor('pottery')?.id).toBe('pot');
    expect(recipeFor('handaxe')?.id).toBe('handaxe');
    expect(recipeFor('berries')).toBeNull();
  });
});
