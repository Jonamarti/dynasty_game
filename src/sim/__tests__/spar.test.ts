/**
 * M11 phase 11, first commit: `spar`, the deliberate half of the fix for
 * `docs/bugs.md`'s "nobody in this world has any fight skill" — `doHunt`'s
 * small trickle is the other half and needs no test of its own beyond
 * `hunting.test.ts`'s existing kill coverage, since it is one added line in
 * an already-tested path.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'spar-test',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

/** A world one day old. See `traps.test.ts` for why this matters on tick zero. */
function aDayIn(sim: Simulation): void {
  for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
}

/** Somebody with nothing pressing, so a test measures what it means to. */
function settle(person: Person): void {
  person.needs.thirst = 0;
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
}

describe('a spar', () => {
  it('refuses a grudging partner, and says why', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const [person, other] = sim.livingPeople();
    settle(person!);
    other!.x = person!.x;
    other!.y = person!.y;
    // Below SPAR_MIN_REGARD (0): a grudging opponent is not a training
    // partner, the same gate `doDiscuss` uses for an argument. Deep enough
    // to clear the same-band `bias` a fresh edge already carries — see
    // `RelationshipGraph.opinion`'s components.
    sim.relationships.edge(other!.id, person!.id).deeds = -500;

    expect(sim.order(person!, 'spar', { personId: other!.id })).toBe(true);
    for (let i = 0; i < 100 && person!.order !== null; i++) sim.step();
    expect(sim.interruptions.some(stop => stop.reason === 'partner_unwilling')).toBe(true);
  });

  it('trains fight skill on both parties, and nobody is hurt', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const [person, other] = sim.livingPeople();
    settle(person!);
    other!.x = person!.x;
    other!.y = person!.y;
    const beforePerson = person!.skills.fight;
    const beforeOther = other!.skills.fight;
    const healthPerson = person!.health;
    const healthOther = other!.health;

    expect(sim.order(person!, 'spar', { personId: other!.id })).toBe(true);
    for (let i = 0; i < 100 && person!.order !== null; i++) sim.step();

    expect(person!.skills.fight).toBeGreaterThan(beforePerson);
    expect(other!.skills.fight).toBeGreaterThan(beforeOther);
    expect(person!.health).toBe(healthPerson);
    expect(other!.health).toBe(healthOther);
  });

  it('sets a cooldown on both parties, not only the one who asked', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const [person, other] = sim.livingPeople();
    settle(person!);
    other!.x = person!.x;
    other!.y = person!.y;

    expect(sim.order(person!, 'spar', { personId: other!.id })).toBe(true);
    for (let i = 0; i < 100 && person!.order !== null; i++) sim.step();

    expect(person!.socialCooldownUntil).toBeGreaterThan(sim.time.tick);
    expect(other!.socialCooldownUntil).toBeGreaterThan(sim.time.tick);
  });
});
