import { describe, it, expect } from 'vitest';
import { compactBandNeedsHooks } from '../compact/CompactBandNeeds.ts';
import { makeConfig } from '../core/Config.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { nurslingHungerFactor } from '../ai/Nursing.ts';
describe('compact family needs', () => {
  it('reads living babies dynamically and shares the detailed nursing factors', () => {
    const config = makeConfig(); const ids = new IdSpace();
    const mother = new Person('Mother', 0, 0, 1, new RNG('mother-needs'), 360, ids);
    const baby = new Person('Baby', 0, 0, 1, new RNG('baby-needs'), 360, ids);
    mother.age = 25 * 360; mother.sex = 'female'; baby.age = 0; baby.motherId = mother.id;
    const people = new Map([[mother.id, mother]]);
    const hooks = compactBandNeedsHooks(people, config.childhood, config.time, config.needs);
    expect(hooks.hungerFactor!(mother)).toBe(1);
    people.set(baby.id, baby); mother.childIds.push(baby.id);
    expect(hooks.hungerFactor!(mother)).toBe(1 + config.childhood.lactationHunger);
    expect(hooks.hungerFactor!(baby)).toBe(nurslingHungerFactor(config.childhood.feedsPerDay, config.time.ticksPerDay, config.needs.hungerRate));
    baby.die('starvation');
    expect(hooks.hungerFactor!(mother)).toBe(1);
  });
  it('keeps zero configured hunger drift finite for a newborn', () => {
    const config = makeConfig({ needs: { hungerRate: 0 } });
    const baby = new Person('Baby', 0, 0, 1, new RNG('closed-baby'), 360, new IdSpace()); baby.age = 0;
    const hooks = compactBandNeedsHooks(new Map([[baby.id, baby]]), config.childhood, config.time, config.needs);
    expect(config.needs.hungerRate * hooks.hungerFactor!(baby)).toBe(0);
  });
});
