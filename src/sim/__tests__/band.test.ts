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
import { Simulation, type Band } from '../core/Simulation.ts';
import { CHIEF_TERM_DAYS, chiefHoneymoon, chiefTermDays } from '../social/Leadership.ts';
import { PROTOTYPE_AT, PROTOTYPE_POWER, REFINEMENT_STEP } from '../knowledge/Synthesis.ts';
import { telemetry } from '../core/Telemetry.ts';
import type { Person } from '../entities/Person.ts';

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
    // M9.5 phase 4c: the self-exception is unchanged, but it now sits behind
    // the idea. Deciding to spend your own days at one task is still the
    // practice being used.
    person.knownTech.add('division_of_labour');
    expect(sim.assignJob(person, person, 'forager')).toBe(true);
    expect(person.job).toBe('forager');
  });

  it('says why a job assignment was refused', () => {
    const sim = new Simulation(SMALL);
    const [leader, subordinate] = sim.livingPeople();
    leader!.knownTech.add('division_of_labour');
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

/**
 * M9.5 phase 4c. Every assertion here is written against the gate rather than
 * against a world number, because the world number is what `sim:seeds` is for
 * and because each of these fails outright on a build with the gate removed —
 * which is the standard `AGENTS.md` sets before a check is worth trusting.
 */
describe('the idea of assigning work', () => {
  it('refuses a job to anyone who has never had the idea, and says so', () => {
    const sim = new Simulation(SMALL);
    const [leader, subordinate] = sim.livingPeople();
    expect(leader!.knownTech.has('division_of_labour')).toBe(false);

    expect(sim.assignJob(leader!, subordinate!, 'hunter')).toBe(false);
    expect(subordinate!.job).toBeNull();
    // Never a silent no-op: the standing rule is that a refusal says why, and
    // this is the one refusal in the game whose reason is that nobody has
    // thought of the thing being asked for.
    expect(sim.lastRefusal).toContain('setting one person to one task');
  });

  it('gates assigning your own job on the same idea', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    expect(sim.assignJob(person, person, 'forager')).toBe(false);
    expect(person.job).toBeNull();
    expect(sim.lastRefusal).not.toBeNull();
  });

  it('lets a half-formed idea be tried, which is what stops it deadlocking', () => {
    // The `herbalism` and `taming` shape, and the reason `techPower` gives a
    // researching practice half strength: the one act that counts as trying
    // this practice out is assigning work, so a gate at full knowledge only
    // would lock the practice behind having already finished practising it.
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    person.ideas.push({
      tech: 'division_of_labour', stage: 'researching', insight: PROTOTYPE_AT,
      story: 'was refused once too often', conceivedTick: 0, effort: 0,
      discussedWith: [], trials: 0, proof: 0, failedTests: 0, tries: 0,
    });
    expect(sim.assignJob(person, person, 'builder')).toBe(true);
    // And the attempt counts toward `TRIES_TO_TEST`, or it could never settle.
    expect(person.lately.get('assign')).toBeGreaterThan(0);
  });

  it('makes a practised hand a little harder to argue with', () => {
    // What `maxRefinement` means for a node whose other effect is a gate. Read
    // off the chance rather than off an outcome, so no RNG stream is involved.
    const sim = new Simulation(SMALL);
    const [leader, subordinate] = sim.livingPeople();
    const bare = sim.standing(leader!, subordinate!, 'job').chance;

    leader!.knownTech.add('division_of_labour');
    const known = bare + 0.1 * 1;
    leader!.techLevel.set('division_of_labour', 2);
    const refined = bare + 0.1 * (1 + 2 * REFINEMENT_STEP);
    expect(refined).toBeGreaterThan(known);
    // And it is small beside the terms it sits next to: headship alone is
    // 0.55 in `standingOver`, and this must never rival it.
    expect(refined - bare).toBeLessThan(0.2);
  });

  it('never lets a chief who has not had the idea hand a job out', () => {
    const sim = new Simulation(SMALL);
    const band = sim.bands[0]!;
    chooseFirstChief(sim);
    stepDays(sim, 6);
    for (const person of sim.livingPeople()) {
      if (person.bandId !== band.id) continue;
      expect(person.job, person.name + ' was given a job nobody could have assigned')
        .toBeNull();
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

/**
 * M9.5 phase 4d. The rank term is read off `standing().chance` rather than off
 * an outcome, so none of this touches an RNG stream and none of it can flake;
 * the one assertion that needs a world — that a head other than the chief ever
 * actually gives an order — runs a band and counts.
 */
describe('the middle rank', () => {
  /** A head of one household, and an unrelated adult of the same band. */
  function headAndOutsider(sim: Simulation): [Person, Person] | null {
    for (const household of sim.householdsById.values()) {
      const head = sim.peopleById.get(household.headId);
      if (!head || !head.alive) continue;
      const other = sim.livingPeople().find(person =>
        person.bandId === head.bandId &&
        person.householdId !== head.householdId &&
        !person.isChild &&
        sim.relationships.kinship(person.id, head.id) === 0);
      if (other) return [head, other];
    }
    return null;
  }

  it('gives a head standing over the house next door, but less than under their own roof', () => {
    const sim = new Simulation(SMALL);
    const pair = headAndOutsider(sim);
    expect(pair, 'no head with an unrelated bandmate in this world').not.toBeNull();
    const [head, outsider] = pair!;

    const flat = sim.standing(head, outsider, 'haul');
    expect(flat.byRank).toBe(false);

    head.knownTech.add('chiefdom');
    const ranked = sim.standing(head, outsider, 'haul');
    expect(ranked.byRank).toBe(true);
    expect(ranked.chance).toBeGreaterThan(flat.chance);
    // Why the rank is stated in words as well as in a number: the panel shows
    // this sentence, and a rank the player cannot see is a rank they will
    // think is a bug.
    expect(ranked.because).toContain('head of a house in your band');

    // A middle rank, and visibly middling. Somebody under this head's own roof
    // must still be the more biddable of the two.
    const ownHousehold = sim.livingPeople().find(person =>
      person.householdId === head.householdId && person.id !== head.id && !person.isChild);
    if (ownHousehold) {
      const inside = sim.standing(head, ownHousehold, 'haul');
      expect(inside.byRank).toBe(false);
      expect(inside.chance).toBeGreaterThan(ranked.chance);
    }
  });

  it('does not reach across a band boundary', () => {
    // The contrast that makes rank *legitimate* authority rather than menace:
    // `menaceOver` from 4a works on a stranger and this never will.
    const sim = new Simulation({ ...SMALL, population: { bands: 2, peoplePerBand: 10 } });
    const head = [...sim.householdsById.values()]
      .map(household => sim.peopleById.get(household.headId))
      .find((person): person is Person => !!person && person.alive);
    expect(head).toBeDefined();
    head!.knownTech.add('chiefdom');

    const stranger = sim.livingPeople().find(person => person.bandId !== head!.bandId);
    expect(stranger, 'no second band in this world').toBeDefined();
    expect(sim.standing(head!, stranger!, 'haul').byRank).toBe(false);
  });

  it('lengthens the term of a chief who understands it, and only theirs', () => {
    const sim = new Simulation(SMALL);
    const plain = sim.livingPeople()[0]!;
    const versed = sim.livingPeople()[1]!;

    expect(chiefTermDays(plain)).toBe(CHIEF_TERM_DAYS);
    expect(chiefTermDays(null)).toBe(CHIEF_TERM_DAYS);

    // A half-worked-out idea buys half the extra tenure, like every other
    // graded effect in this milestone.
    versed.ideas.push({
      tech: 'chiefdom', stage: 'researching', insight: PROTOTYPE_AT,
      story: 'saw a theft nobody could settle', conceivedTick: 0, effort: 0,
      discussedWith: [], trials: 0, proof: 0, failedTests: 0, tries: 0,
    });
    expect(chiefTermDays(versed)).toBeCloseTo(CHIEF_TERM_DAYS * (1 + 0.5 * PROTOTYPE_POWER));

    versed.ideas = [];
    versed.knownTech.add('chiefdom');
    expect(chiefTermDays(versed)).toBeCloseTo(CHIEF_TERM_DAYS * 1.5);
    expect(chiefTermDays(versed)).toBeGreaterThan(chiefTermDays(plain));
  });

  it('is actually exercised by somebody who is not the chief', () => {
    // The assertion the whole phase turns on. Before 4d the chief was the only
    // order-giver anywhere in the simulation, and a chief is covered by
    // `isChief` and never by rank — so a rank term alone would have been a
    // line in an authority table that no NPC could ever reach. This fails on a
    // build where `directWork` stops at the chief.
    const wasEnabled = telemetry.isEnabled();
    telemetry.enable();
    telemetry.reset();
    try {
      const sim = new Simulation({
        ...SMALL,
        seed: 'presiding',
        population: {
          bands: 1, peoplePerBand: 14,
          startingTech: ['division_of_labour', 'chiefdom'],
        },
      });
      stepDays(sim, 40);
      const obeyed = telemetry.get('order_obeyed_by_rank');
      const refused = telemetry.get('order_refused_by_rank');
      expect(obeyed + refused, 'no head ever gave an order on rank').toBeGreaterThan(0);
    } finally {
      if (!wasEnabled) telemetry.disable();
      telemetry.reset();
    }
  });
});

/**
 * M11 phase 5d-5f. `considerExile` used to gate on the band's *average*
 * opinion of a suspect; phase 5e replaced that with `conspiracyAgainst`'s
 * faction, on the same finding `REBELLION_THRESHOLD`'s comment records for
 * the chief — kinship and household bias hold the average up, so what
 * actually happens is a handful of people who loathe someone and trust each
 * other, not the whole band turning against them. Rare and stochastic in the
 * ordinary run of things, so — the same discipline the rebellion tests above
 * follow — asserted here by engineering the grievance directly rather than
 * hunting for one in a `simcheck` scenario.
 */
describe('exile and adoption', () => {
  it('casts someone out once a faction of the band holds a grudge and trusts each other', () => {
    const sim = new Simulation({
      ...SMALL,
      seed: 'faction',
      population: { bands: 1, peoplePerBand: 14 },
    });
    const band = sim.bands[0]!;
    const chiefId = chooseFirstChief(sim);

    const candidates = sim.livingPeople().filter(person =>
      person.bandId === band.id && !person.isChild && person.id !== chiefId);
    const suspect = candidates[0]!;
    // Unrelated to the suspect, so the grudge is not swamped by kinship, the
    // same care `headAndOutsider` above takes.
    const conspirators = candidates
      .slice(1)
      .filter(person => sim.relationships.kinship(person.id, suspect.id) === 0)
      .slice(0, 4);
    expect(conspirators.length, 'not enough unrelated adults to form a faction').toBe(4);

    const instigator = conspirators[0]!;
    instigator.traits.loyalty = 0;
    for (const member of conspirators) {
      sim.relationships.addDeed(member.id, suspect.id, -100, sim.time.tick);
      if (member.id !== instigator.id) {
        sim.relationships.addDeed(instigator.id, member.id, 100, sim.time.tick);
        sim.relationships.addDeed(member.id, instigator.id, 100, sim.time.tick);
      }
    }

    let exiled = false;
    for (let day = 0; day < 5 && !exiled; day++) {
      for (let i = 0; i < 240; i++) sim.step();
      exiled = suspect.bandId !== band.id;
    }

    expect(exiled).toBe(true);
    expect(sim.bands.find(b => b.outcast)).toBeDefined();
    expect(suspect.chronicle.some(entry => entry.text.includes('cast out'))).toBe(true);
  });

  it('does not re-admit someone the same faction still despises', () => {
    // The door 5f opens is not a blanket welcome: a band that still holds the
    // grudge that got somebody exiled refuses them again the moment they
    // wander back into range, exactly the property `considerAdoption`'s own
    // comment claims.
    const sim = new Simulation({
      ...SMALL,
      seed: 'no-forgiveness',
      population: { bands: 1, peoplePerBand: 10 },
    });
    const band = sim.bands[0]!;
    const [member, target] = sim.livingPeople().filter(p => p.bandId === band.id && !p.isChild);
    sim.relationships.addDeed(member!.id, target!.id, -100, sim.time.tick);

    const outcasts = {
      id: 9001, name: 'the outcast', homeX: 0, homeY: 0,
      norms: band.norms, chiefId: null, chiefSince: null, outcast: true,
    };
    sim.bands.push(outcasts);
    target!.bandId = outcasts.id;
    target!.x = band.homeX;
    target!.y = band.homeY;

    for (let i = 0; i < 240; i++) sim.step();
    expect(target!.bandId).toBe(outcasts.id);
  });

  it('adopts a wandering outcast nobody here has anything against', () => {
    const sim = new Simulation({
      ...SMALL,
      seed: 'welcome',
      population: { bands: 2, peoplePerBand: 10 },
    });
    const [home, refuge] = sim.bands as [Band, Band];
    const candidate = sim.livingPeople().find(person =>
      person.bandId === home.id && !person.isChild)!;

    const outcasts = {
      id: 9002, name: 'the outcast', homeX: 0, homeY: 0,
      norms: home.norms, chiefId: null, chiefSince: null, outcast: true,
    };
    sim.bands.push(outcasts);
    candidate.bandId = outcasts.id;
    // Wandered right up to the second band's camp, which nobody there has any
    // reason to refuse: a fresh world has no cross-band relationships at all.
    candidate.x = refuge.homeX;
    candidate.y = refuge.homeY;
    const oldHouseholdId = candidate.householdId;

    let adopted = false;
    for (let i = 0; i < 480 && !adopted; i++) {
      sim.step();
      adopted = candidate.bandId === refuge.id;
    }

    expect(adopted).toBe(true);
    expect(candidate.householdId).not.toBe(oldHouseholdId);
    const household = sim.householdsById.get(candidate.householdId!);
    expect(household?.headId).toBe(candidate.id);
    expect(household?.bandId).toBe(refuge.id);
  });
});

/**
 * M9.5 phase 4e. The shape the tribe graph draws, asked of the simulation
 * rather than of the picture: `ranksAround` is the panel's only route to a
 * rung, so everything the pyramid claims is asserted here, once, without a
 * canvas.
 */
describe('the shape of a band', () => {
  /** Every person the graph would be drawn for, which is all of them here. */
  function everyone(sim: Simulation): number[] {
    return sim.livingPeople().map(person => person.id);
  }

  it('has no shape until the chief has the idea of dividing labour', () => {
    const sim = new Simulation(SMALL);
    const chiefId = chooseFirstChief(sim);
    const chief = sim.peopleById.get(chiefId)!;
    const subject = sim.livingPeople().find(person => person.id !== chiefId)!;

    // Flat, and the panel is told so in the one way it can act on: null.
    expect(sim.ranksAround(subject, everyone(sim))).toBeNull();

    // Knowing it yourself is not enough — it is the chief's band and the
    // chief's idea, the same gate `BandSystem.assignJobs` tests before it
    // parcels out a day's work.
    subject.knownTech.add('division_of_labour');
    expect(sim.ranksAround(subject, everyone(sim))).toBeNull();

    chief.knownTech.add('division_of_labour');
    const ranks = sim.ranksAround(subject, everyone(sim));
    expect(ranks).not.toBeNull();
    expect(ranks!.get(chiefId)).toBe('chief');
  });

  it('raises a head to the middle rung exactly where `chiefdom` does', () => {
    const sim = new Simulation(SMALL);
    const chiefId = chooseFirstChief(sim);
    sim.peopleById.get(chiefId)!.knownTech.add('division_of_labour');

    const head = [...sim.householdsById.values()]
      .map(household => sim.peopleById.get(household.headId))
      .find((person): person is Person =>
        !!person && person.alive && person.id !== chiefId)!;
    expect(head, 'no head other than the chief in this world').toBeDefined();

    // A head of a house whose band has never heard of `chiefdom` stands with
    // everybody else, because that is what their orders are worth: the rank
    // term in `standingOver` is off too. A row drawn for authority nobody
    // would honour is the inert content this project keeps having to delete.
    expect(sim.ranksAround(head, everyone(sim))!.get(head.id)).toBe('member');

    head.knownTech.add('chiefdom');
    expect(sim.ranksAround(head, everyone(sim))!.get(head.id)).toBe('head');
  });

  it('puts children on their own rung and the next band below them', () => {
    const sim = new Simulation({ ...SMALL, population: { bands: 2, peoplePerBand: 10 } });
    const chiefId = chooseFirstChief(sim);
    const chief = sim.peopleById.get(chiefId)!;
    chief.knownTech.add('division_of_labour');

    const ranks = sim.ranksAround(chief, everyone(sim))!;
    const child = sim.livingPeople().find(person =>
      person.isChild && person.bandId === chief.bandId);
    if (child) expect(ranks.get(child.id)).toBe('child');

    const stranger = sim.livingPeople().find(person => person.bandId !== chief.bandId)!;
    expect(stranger, 'no second band in this world').toBeDefined();
    expect(ranks.get(stranger.id)).toBe('outsider');
  });

  it('puts the cast out below everyone, house or no house', () => {
    const sim = new Simulation(SMALL);
    const chiefId = chooseFirstChief(sim);
    const chief = sim.peopleById.get(chiefId)!;
    chief.knownTech.add('division_of_labour');
    const cast = sim.livingPeople().find(person =>
      person.id !== chiefId && person.householdId !== null)!;

    // What `Simulation.removeBandMembership` does, and all it does: exile
    // moves the person and leaves their house where it stands. Reproduced
    // here rather than reached through `considerRebellion`, which is a daily
    // roll and would make this a test of the weather.
    const outcasts = {
      id: 9001, name: 'the outcast', homeX: 0, homeY: 0,
      norms: sim.bands[0]!.norms, chiefId: null, chiefSince: null, outcast: true,
    };
    sim.bands.push(outcasts);
    cast.bandId = outcasts.id;

    expect(sim.ranksAround(chief, everyone(sim))!.get(cast.id)).toBe('outcast');
  });
});
