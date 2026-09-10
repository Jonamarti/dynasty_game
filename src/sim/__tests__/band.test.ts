/**
 * Deterministic tests for M6b phase 6: jobs and rebellion.
 *
 * Rebellion is a rare stochastic event by design — `considerRebellion` gates
 * it behind `defiance`, a roll a band only gets to make once a day — so a
 * `simcheck` scenario cannot assert it reliably: across fifteen seeds of the
 * `century` scenario, six saw no rebellion at all in a full two years. That is
 * exactly the shape `AGENTS.md` documents for `prototypes-can-fail`, deleted
 * for the same reason. What is asserted here instead is the mechanism: prime
 * one person to despise the chief past all doubt and confirm something gives.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

const SMALL = {
  seed: 'rebellion',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 10 },
};

describe('jobs', () => {
  it('assigns a job to yourself without a compliance roll', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    expect(sim.assignJob(person, person, 'forager')).toBe(true);
    expect(person.job).toBe('forager');
  });

  it('says why a job assignment was refused', () => {
    const sim = new Simulation(SMALL);
    const [leader, subordinate] = sim.livingPeople();
    // A stranger with no standing at all: `standingOver`'s floor is low
    // enough that this refuses on any RNG stream.
    subordinate!.traits.loyalty = 0;
    subordinate!.traits.tradition = 0;
    const ok = sim.assignJob(leader!, subordinate!, 'hunter');
    if (!ok) {
      expect(sim.lastRefusal).not.toBeNull();
      expect(subordinate!.job).toBeNull();
    }
  });
});

describe('rebellion', () => {
  it('fires when someone is primed to despise the chief and cannot be swayed', () => {
    const sim = new Simulation(SMALL);
    const band = sim.bands[0]!;

    // Run until a chief is chosen and let founding-generated relationships
    // settle for a few days first, so the population is not still forming
    // its very first impressions when the grievance is engineered in.
    for (let i = 0; i < 3000 && sim.bandSystem.chiefByBand.get(band.id) === undefined; i++) {
      sim.step();
    }
    const chiefId = sim.bandSystem.chiefByBand.get(band.id);
    expect(chiefId).toBeDefined();
    const chief = sim.peopleById.get(chiefId!)!;

    // Locked in against the very grievance about to be engineered: a huge
    // persuade score keeps `chooseChief`'s own daily re-election from handing
    // the chiefdom to somebody else the moment one relationship craters, which
    // would point the rest of this test at the wrong person.
    chief.skills.persuade = 100;

    const rebel = sim.livingPeople().find(p =>
      p.bandId === band.id && p.id !== chief.id && !p.isChild)!;
    expect(rebel).toBeDefined();

    // Loyalty 0 and opinion -100 make `defiance` exactly 1, and `RNG.next()`
    // never returns a value that high — the roll that gates
    // `considerRebellion`'s action cannot fail, whatever the seed.
    rebel.traits.loyalty = 0;
    sim.relationships.addDeed(rebel.id, chief.id, -100, sim.time.tick);

    // Five days, not one: `REBELLION_QUORUM` also has to be met by band
    // members who have actually crossed paths with the chief, and with a
    // freshly engineered grievance that can take a day longer to reach than
    // `defiance` itself, which is guaranteed the moment it is checked. Widened
    // from three days in M7: routed movement reaches the same places by a
    // different, sometimes slightly longer, sequence of steps, which pushed
    // this particular quorum out to just under four days.
    const before = sim.insights.length;
    for (let i = 0; i < 5 * 240; i++) sim.step();

    const fired = sim.insights.slice(before).some(n => n.personId === rebel.id);
    expect(fired).toBe(true);
    expect(sim.bandSystem.chiefByBand.get(band.id)).toBeDefined();
  });
});
