/**
 * How knowledge gets from one head to another.
 *
 * The health checks say transmission happens *somewhere* in a long run; these
 * say what each channel actually does, which is the half a statistical check
 * cannot answer. Every assertion is a rule stated in the M6b plan: a child can
 * be taught and cannot teach, what a child holds is latent until they are
 * grown, and watching is free but slow.
 */
import { describe, it, expect } from 'vitest';
import { Person, DAYS_PER_YEAR } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { KnowledgeSystem } from '../systems/KnowledgeSystem.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { World } from '../core/World.ts';
import { makeConfig } from '../core/Config.ts';
import { countHolders } from '../systems/KnowledgeSystem.ts';
import { Simulation } from '../core/Simulation.ts';

/** A small world with one band, so a test can find its people by hand. */
const SMALL = {
  seed: 'records',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

const config = makeConfig({ seed: 'transmission-test' });

function world(): World {
  return new World(config.world, new RNG('transmission-world'));
}

function person(name: string, years: number): Person {
  const made = new Person(name, 4, 4, 0, new RNG('transmission-' + name));
  made.age = years * DAYS_PER_YEAR;
  return made;
}

function context(seed = 'transmission-ctx'): Parameters<KnowledgeSystem['daily']>[1] {
  return {
    rng: new RNG(seed),
    tick: 1000,
    peopleHash: new SpatialHash<Person>(8),
    world: world(),
    season: 'summer',
    ticksPerDay: config.time.ticksPerDay,
    knowledge: config.knowledge,
    learning: config.learning,
    onInsight: () => {},
  };
}

describe('teaching a child', () => {
  it('lands, where before phase 4 it could not happen at all', () => {
    const knowledge = new KnowledgeSystem();
    const parent = person('Parent', 30);
    const child = person('Child', 8);
    parent.knownTech.add('firemaking');
    parent.skills.teach = 100;

    // Regard 1 and a skilled teacher: the roll is generous, but it is still a
    // roll, so the lesson is repeated rather than assumed.
    const rng = new RNG('lesson');
    let taught: string | null = null;
    for (let attempt = 0; attempt < 20 && taught === null; attempt++) {
      taught = knowledge.teach(parent, child, 1, 1000, rng);
    }

    expect(child.isChild).toBe(true);
    expect(taught).toBe('firemaking');
    expect(child.knownTech.has('firemaking')).toBe(true);
    // Level zero: what you were shown is the plain version of the design.
    expect(child.techLevel.get('firemaking')).toBe(0);
  });

  it('is refused when the child lacks the groundwork', () => {
    // `requires` gates teaching as well as conception. A child who has never
    // seen fire cannot be handed cooking, which is what stops a newborn being
    // loaded with the whole tree by one enthusiastic grandparent.
    const knowledge = new KnowledgeSystem();
    const parent = person('Parent', 40);
    const child = person('Child', 6);
    parent.knownTech.add('cooking');
    parent.skills.teach = 100;

    const rng = new RNG('groundwork');
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(knowledge.teach(parent, child, 1, 1000, rng)).toBeNull();
    }
    expect(child.knownTech.size).toBe(0);
  });

  it('does not let the child pass it on until they are grown', () => {
    const knowledge = new KnowledgeSystem();
    const child = person('Child', 9);
    const other = person('Friend', 10);
    child.knownTech.add('firemaking');
    child.skills.teach = 100;

    const rng = new RNG('too-young');
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(knowledge.teach(child, other, 1, 1000, rng)).toBeNull();
    }
    expect(other.knownTech.size).toBe(0);

    // The same person, grown. Nothing else about them has changed.
    child.age = 30 * DAYS_PER_YEAR;
    let taught: string | null = null;
    for (let attempt = 0; attempt < 20 && taught === null; attempt++) {
      taught = knowledge.teach(child, other, 1, 1000, rng);
    }
    expect(taught).toBe('firemaking');
  });

  it('keeps what it learned into adulthood', () => {
    // The point of the whole channel. A generation that can only be taught
    // after it has already grown up has to re-derive everything in between.
    const child = person('Child', 7);
    child.knownTech.add('cordage');
    child.age = 30 * DAYS_PER_YEAR;
    expect(child.isChild).toBe(false);
    expect(child.knownTech.has('cordage')).toBe(true);
  });
});

describe('watching', () => {
  it('reaches a child, and reaches them more readily than an adult', () => {
    // Free and passive, and the reason childhood is worth simulating at all.
    // Measured as a rate over many days rather than asserted on one roll,
    // because both chances are small and the claim is about which is larger.
    const knower = person('Knower', 35);
    knower.knownTech.add('firemaking');

    const learnDay = (watcher: Person, seed: string): number => {
      const knowledge = new KnowledgeSystem();
      const hash = new SpatialHash<Person>(8);
      hash.rebuild([knower, watcher]);
      const ctx = { ...context(seed), peopleHash: hash };
      for (let day = 0; day < 400; day++) {
        knowledge.daily([watcher], { ...ctx, tick: 1000 + day * config.time.ticksPerDay });
        if (watcher.knownTech.has('firemaking')) return day;
      }
      return 400;
    };

    let childDays = 0;
    let adultDays = 0;
    for (let seed = 0; seed < 8; seed++) {
      childDays += learnDay(person('C' + seed, 8), 'watch-child-' + seed);
      adultDays += learnDay(person('A' + seed, 30), 'watch-adult-' + seed);
    }

    expect(childDays, 'no child ever picked anything up by watching')
      .toBeLessThan(400 * 8);
    expect(childDays, 'a child was no quicker to notice than an adult')
      .toBeLessThan(adultDays);
  });

  it('does not let a child conceive of anything', () => {
    // A nine-year-old does not invent hafting. Watching and being taught are
    // the two channels open to them; the other two are not.
    const knowledge = new KnowledgeSystem();
    const child = person('Child', 9);
    const ctx = context('no-ideas');
    for (let day = 0; day < 400; day++) {
      knowledge.daily([child], { ...ctx, tick: 1000 + day * config.time.ticksPerDay });
    }
    expect(child.ideas).toHaveLength(0);
  });
});

describe('what the world counts as known', () => {
  it('does not count a child, so knowledge held only by one is latent', () => {
    // `refreshEra` asks this of adults alone. Two reasons beyond the story: the
    // era fraction divides holders by adults, so counting children in the
    // numerator could put it over one; and `knownTech` gates the build menu, so
    // a band would otherwise be able to raise a granary because somebody's
    // daughter once watched a pot being fired.
    const adult = person('Adult', 30);
    const child = person('Child', 9);
    child.knownTech.add('pottery');

    const adultsOnly = countHolders([adult, child].filter(p => !p.isChild));
    expect(adultsOnly.get('pottery')).toBe(0);

    // And it becomes the world's the day they grow up, with nothing anywhere
    // having to remember to hand it over.
    child.age = 30 * DAYS_PER_YEAR;
    const later = countHolders([adult, child].filter(p => !p.isChild));
    expect(later.get('pottery')).toBe(1);
  });
});

describe('a record', () => {
  /** A world with one literate person standing on open ground. */
  function scribe(sim: Simulation, tech: string): Person {
    const who = sim.livingPeople()[0]!;
    who.knownTech.add('writing');
    who.knownTech.add(tech);
    // Enough flint for several stones. A carver writes down whatever they know
    // that is not yet written anywhere, in whatever order it comes to them, and
    // a stone holds one thing — so getting a particular technology onto one
    // means letting them work through the rest first.
    who.inventory.add('flint', 12);
    return who;
  }

  /** Keeps somebody carving until `want` is legible on a stone. */
  function driveInscribe(sim: Simulation, who: Person, want: string): void {
    const done = () => sim.inscriptions.some(r => r.techs.includes(want));
    sim.order(who, 'inscribe');
    for (let i = 0; i < 12000 && !done(); i++) {
      // Kept comfortable so the interruption check is not what ends this. The
      // point under test is the record, not the carver's thirst.
      who.needs.thirst = 0;
      who.needs.hunger = 0;
      who.needs.cold = 0;
      who.workedTicks = 0;
      if (who.order === null) sim.order(who, 'inscribe');
      sim.step();
    }
    expect(done(), want + ' never reached a stone').toBe(true);
  }

  it('holds nothing until it is finished', () => {
    // A half-cut stone is a waste of flint, not a library. Otherwise a band
    // could bank everything it knows by starting a hundred carvings.
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 20; i++) sim.step();
    const who = scribe(sim, 'cordage');
    sim.order(who, 'inscribe');
    for (let i = 0; i < 30; i++) sim.step();

    const started = sim.inscriptions[0];
    expect(started, 'nobody started carving').toBeDefined();
    expect(started!.unfinished).toBe(true);
    expect(started!.techs).toHaveLength(0);
    expect(sim.recordedTech.size).toBe(0);
  });

  it('outlives the person who cut it, and gives what they knew to a reader', () => {
    // The whole reason writing is in this game. Everywhere else, a technology
    // leaves the world when its last holder dies.
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 20; i++) sim.step();
    const author = scribe(sim, 'cordage');
    driveInscribe(sim, author, 'cordage');

    const stone = sim.inscriptions.find(r => r.techs.includes('cordage'))!;

    // Everybody who knew it dies, which in this world is how knowledge is lost.
    for (const someone of sim.livingPeople()) someone.knownTech.delete('cordage');
    for (let i = 0; i < 250; i++) sim.step();
    expect(sim.knownTech.has('cordage'), 'somebody still knew it').toBe(false);
    // And it is still recoverable, which is the half that did not exist before.
    expect(sim.recordedTech.has('cordage')).toBe(true);

    // A literate reader walks over and takes it back off the stone.
    const reader = sim.livingPeople().find(p => !p.isChild)!;
    reader.knownTech.add('writing');
    reader.x = stone.x;
    reader.y = stone.y;
    sim.order(reader, 'read', { inscriptionId: stone.id });
    for (let i = 0; i < 600 && !reader.knownTech.has('cordage'); i++) {
      reader.needs.thirst = 0;
      reader.needs.hunger = 0;
      reader.needs.cold = 0;
      reader.workedTicks = 0;
      sim.step();
    }
    expect(reader.knownTech.has('cordage'), 'the record taught nobody anything').toBe(true);
  });

  it('is inert to somebody who cannot read', () => {
    // A band can sit on a library holding the answer to its own dark age. This
    // is what makes literacy the thing worth having rather than the record.
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 20; i++) sim.step();
    const author = scribe(sim, 'cordage');
    driveInscribe(sim, author, 'cordage');
    const stone = sim.inscriptions.find(r => r.techs.includes('cordage'))!;

    const illiterate = sim.livingPeople().find(p => p.id !== author.id && !p.isChild)!;
    illiterate.knownTech.delete('writing');
    illiterate.knownTech.delete('cordage');
    illiterate.x = stone.x;
    illiterate.y = stone.y;

    sim.interruptions.length = 0;
    sim.order(illiterate, 'read', { inscriptionId: stone.id });
    for (let i = 0; i < 200 && illiterate.order !== null; i++) sim.step();

    expect(illiterate.knownTech.has('cordage'), 'an illiterate read a stone').toBe(false);
    // And is told why, rather than simply stopping.
    const mine = sim.interruptions.filter(n => n.personId === illiterate.id);
    expect(mine.map(n => n.reason)).toContain('cannot_read');
  });

  /**
   * M8.1's `ochre`, and the reason literacy stopped being one question.
   *
   * A script is an agreed code and is worth nothing outside the agreement; a
   * painted picture of a thing being done is legible to whoever can recognise
   * the thing. That cuts both ways, and the second direction is the one that
   * would have gone unnoticed: a scribe who has never seen ochre cannot read a
   * painting either.
   */
  it('makes literacy a property of the form, in both directions', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 20; i++) sim.step();

    // A painter who cannot write at all. This is the case the node exists for:
    // `writing` sits behind `marking` and `stoneworking`, and most bands never
    // get there.
    const painter = sim.livingPeople()[0]!;
    painter.knownTech.add('ochre');
    painter.knownTech.add('cordage');
    painter.inventory.add('mud', 24);
    driveInscribe(sim, painter, 'cordage');
    const painting = sim.inscriptions.find(r => r.techs.includes('cordage'))!;

    expect(painting.def.id, 'a band that cannot write left something else').toBe('ochre');
    expect(painter.knownTech.has('writing')).toBe(false);

    // A scribe, who can read every word ever cut and cannot read this.
    const scribeOnly = sim.livingPeople().find(p => p.id !== painter.id && !p.isChild)!;
    scribeOnly.knownTech.add('writing');
    scribeOnly.knownTech.delete('ochre');
    scribeOnly.knownTech.delete('cordage');
    scribeOnly.x = painting.x;
    scribeOnly.y = painting.y;

    sim.interruptions.length = 0;
    sim.order(scribeOnly, 'read', { inscriptionId: painting.id });
    for (let i = 0; i < 200 && scribeOnly.order !== null; i++) sim.step();

    expect(scribeOnly.knownTech.has('cordage'), 'a scribe read a painting').toBe(false);
    const refusals = sim.interruptions.filter(n => n.personId === scribeOnly.id);
    expect(refusals.map(n => n.reason)).toContain('cannot_read');
  });
});
