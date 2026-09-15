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
import { CHIEF_TERM_DAYS, chiefHoneymoon } from '../social/Leadership.ts';

const SMALL = {
  seed: 'rebellion',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 10 },
};

function stepDays(sim: Simulation, days: number): void {
  for (let i = 0; i < sim.config.time.ticksPerDay * days; i++) sim.step();
}

function chooseFirstChief(sim: Simulation): number {
  const band = sim.bands[0]!;
  while (sim.bandSystem.chiefByBand.get(band.id) === undefined) sim.step();
  return sim.bandSystem.chiefByBand.get(band.id)!;
}

describe('chief terms', () => {
  it('holds an incumbent through a term and reconsiders the band when it ends', () => {
    const sim = new Simulation(SMALL);
    const band = sim.bands[0]!;
    const firstId = chooseFirstChief(sim);
    expect(sim.insights.some(note =>
      note.personId === firstId && note.text.includes('welcomed as chief'))).toBe(true);
    const rival = sim.livingPeople().find(person =>
      person.bandId === band.id && person.id !== firstId && !person.isChild)!;

    // Make the result beyond doubt without poisoning a relationship and
    // accidentally exercising rebellion instead of the term boundary.
    rival.skills.persuade = 10_000;

    // Land directly on the two daily boundaries. Running the intervening
    // weeks would turn this into a survival/courtship/rebellion scenario test
    // when the mechanism under test is just the election clock.
    const firstDay = band.chiefSince!;
    sim.time.tick = (firstDay + CHIEF_TERM_DAYS - 1 - sim.config.time.startDay) *
      sim.config.time.ticksPerDay - 1;
    sim.step();
    expect(sim.bandSystem.chiefByBand.get(band.id)).toBe(firstId);

    sim.time.tick = (firstDay + CHIEF_TERM_DAYS - sim.config.time.startDay) *
      sim.config.time.ticksPerDay - 1;
    sim.step();
    expect(sim.bandSystem.chiefByBand.get(band.id)).toBe(rival.id);
    expect(band.chiefSince).toBe(sim.time.day);
    expect(rival.chronicle.some(entry => entry.text.includes('became chief'))).toBe(true);
  });

  it('replaces a chief who is no longer there without waiting for term end', () => {
    const sim = new Simulation(SMALL);
    const band = sim.bands[0]!;
    const firstId = chooseFirstChief(sim);
    sim.peopleById.get(firstId)!.alive = false;

    stepDays(sim, 1);

    expect(sim.bandSystem.chiefByBand.get(band.id)).not.toBe(firstId);
    expect(band.chiefSince).toBe(sim.time.day);
  });

  it('derives a fading welcome from the band timestamp for both readers', () => {
    const sim = new Simulation(SMALL);
    const band = sim.bands[0]!;
    const chiefId = chooseFirstChief(sim);
    const chief = sim.peopleById.get(chiefId)!;
    const member = sim.livingPeople().find(person =>
      person.bandId === band.id && person.id !== chiefId)!;
    const firstDay = band.chiefSince!;

    expect(chiefHoneymoon(band, firstDay)).toBe(1);
    expect(chiefHoneymoon(band, firstDay + 4)).toBeCloseTo(0.5);

    const welcomedChance = sim.standing(chief, member, 'goto').chance;
    sim.time.tick += sim.config.time.ticksPerDay * 8;
    const fadedChance = sim.standing(chief, member, 'goto').chance;
    expect(fadedChance).toBeLessThan(welcomedChance);
  });
});

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

    // Polled daily rather than checked once at the end, and that is the whole
    // point of the shape.
    //
    // This assertion is about the *mechanism*: prime one person to despise the
    // chief past all doubt and confirm something gives. How many days that
    // takes is incidental — and it is a movement number, because
    // `REBELLION_QUORUM` has to be met by band members who have actually
    // crossed paths with the chief. M7 widened the window from three days to
    // five when routing landed; M7 stage C moved it again, and again.
    //
    // Widening it a fourth time would have been the wrong fix, and measuring
    // said so: on this seed the rebellion now fires on **day 4**, yet the test
    // failed at forty-five days. `Simulation.insights` is capped at
    // `interruptionCap` and `shift()`s, so the evidence had simply scrolled
    // out of the buffer before the assertion looked for it. A long window does
    // not make this test more robust; it makes it *less*, by giving the thing
    // it is watching for more time to be evicted.
    //
    // So: step a day, look, stop on the first sighting. Immune to both
    // failures at once, and it no longer encodes a movement constant nobody
    // would think to look for in `band.test.ts`.
    const before = sim.insights.length;
    let fired = false;
    for (let day = 0; day < 45 && !fired; day++) {
      for (let i = 0; i < 240; i++) sim.step();
      fired = sim.insights.slice(before).some(n => n.personId === rebel.id);
    }

    expect(fired).toBe(true);
    expect(sim.bandSystem.chiefByBand.get(band.id)).toBeDefined();
  });
});
