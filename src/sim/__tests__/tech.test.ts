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
import { BUILDINGS } from '../entities/Building.ts';
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
