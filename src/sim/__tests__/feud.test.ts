import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

describe('household feuds', () => {
  it('keeps a cross-band wrong on both houses', () => {
    const sim = new Simulation({
      seed: 'household-feud',
      world: { width: 64, height: 64, berryBushes: 30, flintOutcrops: 8, deadwood: 12, gameHerds: 3 },
      population: { bands: 2, peoplePerBand: 4 },
    });
    const actor = sim.livingPeople().find(person => person.bandId === 0 && !person.isChild)!;
    const target = sim.livingPeople().find(person => person.bandId === 1 && !person.isChild)!;
    actor.x = target.x;
    actor.y = target.y;
    sim.social.emit('assault', actor, target, 1, sim.time.tick,
      sim.peopleHash, sim.config.sightRadius);
    for (let i = 0; i < sim.config.time.ticksPerDay; i++) sim.step();

    const aggressor = sim.householdsById.get(actor.householdId!)!;
    const victim = sim.householdsById.get(target.householdId!)!;
    expect(aggressor.feud.get(victim.id)).toBeGreaterThan(0);
    expect(victim.feud.get(aggressor.id)).toBeGreaterThan(0);

    sim.social.emit('gift', actor, target, 1, sim.time.tick,
      sim.peopleHash, sim.config.sightRadius);
    for (let i = 0; i < sim.config.time.ticksPerDay; i++) sim.step();
    expect(aggressor.feud.has(victim.id)).toBe(false);
    expect(victim.feud.has(aggressor.id)).toBe(false);
  });
});
