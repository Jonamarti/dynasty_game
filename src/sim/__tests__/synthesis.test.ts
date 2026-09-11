/**
 * The spark table's structural invariants.
 *
 * The companion to `tech.test.ts`. Everything asserted here is cheap and
 * static, and every one of them guards a failure that would be invisible in
 * play: a technology with no way in, a spark naming an item that does not
 * exist, a spark that can fire before its prerequisites are met. All three
 * would leave a node passing `techs-have-effects` while being unreachable —
 * which is exactly how `requiresTech: 'carpentry'` kept the longhouse
 * unbuildable for its whole existence with a full green test suite.
 */
import { describe, it, expect } from 'vitest';
import { TECH, TECHS, DOMAINS, type Tech } from '../knowledge/Tech.ts';
import {
  describeIngredient, satisfies, sparkFires, sparkStatus, type Notice,
} from '../knowledge/Synthesis.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { BUILDINGS } from '../entities/Building.ts';
import { INSCRIPTIONS } from '../entities/Inscription.ts';
import { NEEDS } from '../entities/Person.ts';
import { BIOMES } from '../core/World.ts';
import { SEASONS } from '../core/TimeManager.ts';
import { EVENT_TYPES } from '../social/Events.ts';
import { STOP_REASONS } from '../../render/Floaters.ts';
import { ACTION_LABELS } from '../../render/Floaters.ts';

describe('the spark table', () => {
  it('gives every technology at least one way in', () => {
    // The companion to `techs-have-effects`: that one stops a node entering the
    // tree with nothing to do, this one stops a node entering the web with no
    // way to reach it.
    for (const tech of TECHS) {
      expect(TECH[tech].sparks.length, tech + ' has no spark').toBeGreaterThan(0);
      for (const spark of TECH[tech].sparks) {
        expect(spark.needs.length, tech + ' has an empty spark').toBeGreaterThan(0);
        expect(spark.weight).toBeGreaterThan(0);
        expect(spark.story.length, tech + ' has a spark with no story').toBeGreaterThan(0);
      }
    }
  });

  it('gives every technology more than one way in, so the tree is a web', () => {
    // One route per node is a tree with extra steps. The whole point of this
    // milestone is that the same technology arrives for different reasons in
    // different bands.
    for (const tech of TECHS) {
      expect(TECH[tech].sparks.length, tech + ' has only one route in')
        .toBeGreaterThanOrEqual(2);
    }
  });

  it('only names ingredients that exist', () => {
    // Ingredients are strings, which is what makes the table readable and also
    // what makes this test necessary. A misspelt item id would be a technology
    // nobody could ever conceive of, passing every other assertion here.
    const actions = new Set(Object.keys(ACTION_LABELS));
    const seen = new Set([...EVENT_TYPES, ...Object.keys(STOP_REASONS)]);
    for (const tech of TECHS) {
      for (const spark of TECH[tech].sparks) {
        for (const ingredient of spark.needs) {
          const where = tech + ' spark ' + ingredient.kind;
          switch (ingredient.kind) {
            case 'knows': expect(TECHS, where).toContain(ingredient.tech); break;
            case 'holding':
              expect(Object.keys(ITEMS), where).toContain(ingredient.item); break;
            case 'doing': expect([...actions], where).toContain(ingredient.action); break;
            case 'feeling': expect(NEEDS, where).toContain(ingredient.need); break;
            case 'place': expect(BIOMES, where).toContain(ingredient.biome); break;
            case 'saw': expect([...seen], where).toContain(ingredient.what); break;
            case 'season': expect(SEASONS, where).toContain(ingredient.season); break;
          }
        }
      }
    }
  });

  it('gives every technology exactly one road past the drawing board', () => {
    // An idea with no way out of `researching` is conceivable and permanently
    // unfinishable, which is the inert-content rule wearing a different hat.
    //
    // There are two roads now and a technology must take exactly one. A device
    // is built, so its prototype has to cost materials the world can actually
    // produce. A practice is tried by doing it, so it must cost nothing *and*
    // name the actions that count — a practice with an empty `practisedBy` is
    // the same permanent stall, arrived at from the other side, and it is the
    // mistake this half of the check exists to catch.
    for (const tech of TECHS) {
      const def = TECH[tech];
      const cost = def.prototype;
      if (def.kind === 'practice') {
        expect(Object.keys(cost).length, tech + ' is a practice with materials')
          .toBe(0);
        expect(def.practisedBy?.length ?? 0, tech + ' can never be tried out')
          .toBeGreaterThan(0);
        continue;
      }
      expect(def.practisedBy, tech + ' is a device with practice actions')
        .toBeUndefined();
      expect(Object.keys(cost).length, tech + ' costs nothing to build')
        .toBeGreaterThan(0);
      for (const [itemId, count] of Object.entries(cost)) {
        expect(Object.keys(ITEMS), tech + ' wants unknown ' + itemId).toContain(itemId);
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  it('never calls a technology a practice when it unlocks something', () => {
    // The line between the two kinds is not a matter of taste: a device is a
    // technology that gates a recipe, a building or a form of writing. This is
    // that rule, enforced — a practice that quietly starts gating a recipe
    // would leave the player with something to make and no way to be told they
    // had made the first one.
    const gated = new Set<string>();
    for (const recipe of Object.values(RECIPES)) gated.add(recipe.tech);
    for (const building of Object.values(BUILDINGS)) {
      if (building.requiresTech) gated.add(building.requiresTech);
    }
    for (const form of Object.values(INSCRIPTIONS)) gated.add(form.literacy);

    for (const tech of TECHS) {
      if (TECH[tech].kind !== 'practice') continue;
      expect(gated.has(tech), tech + ' is a practice that unlocks something').toBe(false);
    }
  });

  it('never lets a spark fire before its prerequisites are met', () => {
    // `requires` gates understanding and `sparks` gates the idea occurring, and
    // a spark that names a technology as an ingredient without that technology
    // also being required is a route into a node you cannot understand.
    for (const tech of TECHS) {
      for (const spark of TECH[tech].sparks) {
        for (const ingredient of spark.needs) {
          if (ingredient.kind !== 'knows') continue;
          expect(TECH[tech].requires, tech + ' is sparked by ' + ingredient.tech +
            ' without requiring it').toContain(ingredient.tech);
        }
      }
    }
  });

  it('can put every ingredient it names into words', () => {
    // The tech web answers "why has this not occurred to me?" out of this
    // vocabulary. A missing entry degrades to a raw id in the panel, which is
    // the sort of thing nobody notices until a player asks what `node_empty`
    // means, so it is asserted rather than left to a fallback.
    const label = (kind: 'tech' | 'item', id: string) =>
      kind === 'tech' ? TECH[id as Tech].label : (ITEMS[id]?.label ?? id);
    for (const tech of TECHS) {
      for (const spark of TECH[tech].sparks) {
        for (const ingredient of spark.needs) {
          const words = describeIngredient(ingredient, label);
          expect(words.length, tech + ' ' + ingredient.kind).toBeGreaterThan(0);
          // A raw id leaking through is the failure this is looking for.
          expect(words, tech + ' ' + ingredient.kind).not.toMatch(/_/);
        }
      }
    }
  });

  it('gives every technology a domain and a refinement ceiling', () => {
    for (const tech of TECHS) {
      expect(DOMAINS).toContain(TECH[tech].domain);
      expect(TECH[tech].maxRefinement).toBeGreaterThan(0);
    }
  });

  it('leaves at least one route into each technology that needs no rare thing', () => {
    // The tripwire for the deadlock the plan calls out: a node all of whose
    // routes need an unlikely coincidence is unreachable in play while passing
    // everything above. Hunting is the case that made this concrete — hides are
    // scarce because hunts are, and clothing's best spark wants one — so every
    // node also wants a route built out of what an ordinary day supplies.
    const rare = new Set(['hide', 'handaxe', 'pottery', 'meat', 'wood']);
    for (const tech of TECHS) {
      const ordinary = TECH[tech].sparks.some(spark =>
        spark.needs.every(ingredient =>
          ingredient.kind !== 'holding' || !rare.has(ingredient.item)));
      expect(ordinary, tech + ' can only be conceived while holding something rare')
        .toBe(true);
    }
  });
});

describe('reading a situation', () => {
  const notice: Notice = {
    knows: new Set(['firemaking']),
    holding: new Set(['flint', 'sticks']),
    lately: new Set(['gather', 'forage']),
    feeling: new Set(['cold']),
    place: 'forest',
    saw: new Set(['hands_full']),
    season: 'winter',
  };

  it('reads each kind of ingredient off the situation', () => {
    expect(satisfies({ kind: 'knows', tech: 'firemaking' }, notice)).toBe(true);
    expect(satisfies({ kind: 'knows', tech: 'cordage' }, notice)).toBe(false);
    expect(satisfies({ kind: 'holding', item: 'flint' }, notice)).toBe(true);
    expect(satisfies({ kind: 'holding', item: 'hide' }, notice)).toBe(false);
    expect(satisfies({ kind: 'doing', action: 'gather' }, notice)).toBe(true);
    expect(satisfies({ kind: 'doing', action: 'hunt' }, notice)).toBe(false);
    expect(satisfies({ kind: 'feeling', need: 'cold' }, notice)).toBe(true);
    expect(satisfies({ kind: 'feeling', need: 'hunger' }, notice)).toBe(false);
    expect(satisfies({ kind: 'place', biome: 'forest' }, notice)).toBe(true);
    expect(satisfies({ kind: 'place', biome: 'hills' }, notice)).toBe(false);
    expect(satisfies({ kind: 'saw', what: 'hands_full' }, notice)).toBe(true);
    expect(satisfies({ kind: 'saw', what: 'theft' }, notice)).toBe(false);
    expect(satisfies({ kind: 'season', season: 'winter' }, notice)).toBe(true);
    expect(satisfies({ kind: 'season', season: 'spring' }, notice)).toBe(false);
  });

  it('needs the whole situation, not part of it', () => {
    expect(sparkFires({
      needs: [{ kind: 'holding', item: 'flint' }, { kind: 'feeling', need: 'cold' }],
      weight: 1, story: '',
    }, notice)).toBe(true);
    expect(sparkFires({
      needs: [{ kind: 'holding', item: 'flint' }, { kind: 'feeling', need: 'hunger' }],
      weight: 1, story: '',
    }, notice)).toBe(false);
  });

  it('can say which half of a situation is missing', () => {
    // The predicate behind the tech web's "why not". It has to be the same one
    // conception uses, or the panel will eventually lie about the simulation.
    const status = sparkStatus({
      needs: [{ kind: 'knows', tech: 'firemaking' }, { kind: 'holding', item: 'mud' }],
      weight: 1, story: '',
    }, notice);
    expect(status.met).toHaveLength(1);
    expect(status.missing).toHaveLength(1);
    expect(status.missing[0]).toEqual({ kind: 'holding', item: 'mud' });
  });

  it('finds the worked example in the plan satisfiable', () => {
    // Cold hands holding a hide, which is clothing's heaviest route.
    const cold: Notice = { ...notice, holding: new Set(['hide']) };
    const clothing = TECH['clothing' as Tech].sparks[0]!;
    expect(sparkFires(clothing, cold)).toBe(true);
  });
});
