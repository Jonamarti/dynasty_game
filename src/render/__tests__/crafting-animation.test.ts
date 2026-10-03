import { describe, expect, it } from 'vitest';
import { Person } from '../../sim/entities/Person.ts';
import { RNG } from '../../sim/core/RNG.ts';
import type { Simulation } from '../../sim/core/Simulation.ts';
import { craftingPose } from '../WorkAnimation.ts';
import { RECIPES } from '../../sim/entities/Recipe.ts';

function fixture() {
  const person = new Person('Maker', 4, 4, 0, new RNG('craft-animation'));
  person.action = 'craft'; person.targetRecipe = 'handaxe';
  person.actionTimer = 10; person.workedTicks = 1;
  const sim = { buildingsById: new Map() } as Pick<Simulation, 'buildingsById'>;
  return { person, sim };
}

describe('crafting animation', () => {
  it('cycles four manipulations without touching the craft bank or its countdown', () => {
    const { person, sim } = fixture();
    person.bankWork('craft:handaxe');
    const bank = person.bankedFor('craft:handaxe');
    expect([1, 3, 5, 7, 9].map(ticks => {
      person.workedTicks = ticks;
      return craftingPose(person, sim, false, 0);
    })).toEqual(['m0', 'm1', 'm2', 'm3', 'm0']);
    expect(person.actionTimer).toBe(10);
    expect(person.bankedFor('craft:handaxe')).toBe(bank);
  });

  it('does not manipulate while moving, unstarted, interrupted, dead or without a recipe', () => {
    const { person, sim } = fixture();
    expect(craftingPose(person, sim, true)).toBeNull();
    person.workedTicks = 0;
    expect(craftingPose(person, sim, false)).toBeNull();
    person.workedTicks = 1; person.actionTimer = 0;
    expect(craftingPose(person, sim, false)).toBeNull();
    person.actionTimer = 10; person.action = 'idle';
    expect(craftingPose(person, sim, false)).toBeNull();
    person.action = 'craft'; person.alive = false;
    expect(craftingPose(person, sim, false)).toBeNull();
    person.alive = true; person.targetRecipe = 'missing';
    expect(craftingPose(person, sim, false)).toBeNull();
    person.targetRecipe = null;
    expect(craftingPose(person, sim, false)).toBeNull();
  });

  it('requires the named completed station and containment for station recipes', () => {
    const { person, sim } = fixture();
    const recipe = Object.values(RECIPES).find(candidate => candidate.station !== undefined)!;
    person.targetRecipe = recipe.id; person.targetBuildingId = 7;
    expect(craftingPose(person, sim, false)).toBeNull();
    let inside = false;
    const station = { complete: true, def: { id: recipe.station }, contains: () => inside };
    sim.buildingsById.set(7, station as any);
    expect(craftingPose(person, sim, false)).toBeNull();
    inside = true;
    expect(craftingPose(person, sim, false)).toBe('m0');
    station.complete = false;
    expect(craftingPose(person, sim, false)).toBeNull();
    station.complete = true; station.def.id = 'wrong';
    expect(craftingPose(person, sim, false)).toBeNull();
  });

  it('freezes while paused and reads no private knowledge or material quantities', () => {
    const { person, sim } = fixture(); person.workedTicks = 2;
    Object.defineProperty(person, 'knownTech', { get: () => { throw new Error('Private knowledge read'); } });
    Object.defineProperty(person, 'inventory', { get: () => { throw new Error('Private inventory read'); } });
    expect(craftingPose(person, sim, false, 0.5)).toBe('m0');
    expect(craftingPose(person, sim, false, 0.5)).toBe('m0');
    expect(craftingPose(person, sim, false, 1)).toBe('m1');
    expect(craftingPose(person, sim, false, 100)).toBe('m1');
    expect(craftingPose(person, sim, false, -100)).toBe('m0');
  });
});
