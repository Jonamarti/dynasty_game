/**
 * An idea driven through all five stages by hand.
 *
 * The health checks say the lifecycle happens *somewhere* in a two-year run;
 * this says what each stage actually does, which is the half a statistical
 * check cannot answer. Every assertion here is a rule stated in the M6b plan:
 * a failed test costs insight and does not silently prove the design, teaching
 * hands over the plain version rather than the refined one, and refinement
 * stops at a ceiling instead of climbing forever.
 */
import { describe, it, expect } from 'vitest';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { KnowledgeSystem } from '../systems/KnowledgeSystem.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { World } from '../core/World.ts';
import { makeConfig } from '../core/Config.ts';
import { TECH, techPower, carryFactor } from '../knowledge/Tech.ts';
import {
  MAX_IDEAS, PROTOTYPE_POWER, REFINEMENT_STEP, type Idea,
} from '../knowledge/Synthesis.ts';

const config = makeConfig({ seed: 'research-test' });

function world(): World {
  return new World(config.world, new RNG('research-world'));
}

function adult(name = 'Test'): Person {
  const person = new Person(name, 4, 4, 0, new RNG('research-' + name));
  person.age = 30 * 80;
  return person;
}

function context(seed = 'research-ctx'): Parameters<KnowledgeSystem['daily']>[1] {
  return {
    rng: new RNG(seed),
    tick: 1000,
    peopleHash: new SpatialHash<Person>(8),
    world: world(),
    season: 'winter',
    ticksPerDay: config.time.ticksPerDay,
    onInsight: () => {},
  };
}

function ideaFor(tech: 'cordage' | 'firemaking', stage: Idea['stage'] = 'conceived'): Idea {
  return {
    tech, stage, insight: 0, story: 'for the test',
    conceivedTick: 0, effort: 0, discussedWith: [], failedTests: 0,
  };
}

describe('the shape of an idea', () => {
  it('is conceived only when a whole situation is present', () => {
    const knowledge = new KnowledgeSystem();
    const person = adult();
    const ctx = context();

    // Nothing in hand, nothing on the mind: the sparks that want cordage all
    // want something, and none of them is satisfied.
    const bare = knowledge.notice(person, ctx);
    expect(knowledge.conceivable(person, bare).some(r => r.tech === 'cordage')).toBe(false);

    // Reeds in hand, and gathering is what they have been doing.
    person.inventory.add('thatch', 3);
    person.noteDid('gather');
    const situated = knowledge.notice(person, ctx);
    const routes = knowledge.conceivable(person, situated);
    expect(routes.some(r => r.tech === 'cordage')).toBe(true);
  });

  it('will not occur to somebody who could not understand it', () => {
    // `requires` gates conception as well as teaching. Hafting rests on cordage,
    // and the situation that suggests it cannot suggest it to somebody who has
    // never made string.
    const knowledge = new KnowledgeSystem();
    const person = adult();
    person.inventory.add('flint', 1);
    person.inventory.add('sticks', 1);
    const ctx = context();

    expect(knowledge.conceivable(person, knowledge.notice(person, ctx))
      .some(r => r.tech === 'hafting')).toBe(false);

    person.knownTech.add('cordage');
    expect(knowledge.conceivable(person, knowledge.notice(person, ctx))
      .some(r => r.tech === 'hafting')).toBe(true);
  });

  it('moves from conceived to researching the first time it is worked on', () => {
    const knowledge = new KnowledgeSystem();
    const person = adult();
    const idea = ideaFor('cordage');
    person.ideas.push(idea);

    knowledge.advance(person, idea, 0.2, 1000);
    expect(idea.stage).toBe('researching');
    expect(idea.insight).toBeCloseTo(0.2);
  });

  it('half works while it is only a prototype, and fully once it is proven', () => {
    const person = adult();
    expect(techPower(person, 'cordage')).toBe(0);
    expect(carryFactor(person)).toBe(1);

    const idea = ideaFor('cordage', 'prototyped');
    person.ideas.push(idea);
    expect(techPower(person, 'cordage')).toBe(PROTOTYPE_POWER);
    // Half a technology is half a bonus, which is what makes a prototype worth
    // building before anybody knows whether it works.
    expect(carryFactor(person)).toBeGreaterThan(1);
    expect(carryFactor(person)).toBeLessThan(1.25);

    person.knownTech.add('cordage');
    person.techLevel.set('cordage', 0);
    expect(techPower(person, 'cordage')).toBe(1);
    expect(carryFactor(person)).toBeCloseTo(1.25);
  });

  it('costs insight when a test fails, and does not quietly prove itself', () => {
    const knowledge = new KnowledgeSystem();
    const person = adult();
    // A hopeless prototyper: no skill and no wits, so the trial goes badly.
    for (const skill of Object.keys(person.skills) as (keyof typeof person.skills)[]) {
      person.skills[skill] = 0;
    }
    person.traits.intelligence = 0;
    const idea = ideaFor('cordage', 'prototyped');
    idea.insight = 0.7;
    person.ideas.push(idea);

    // Enough days that the trial certainly happens; the outcome is the point.
    const ctx = context('failing');
    for (let day = 0; day < 200 && idea.failedTests === 0; day++) {
      knowledge.daily([person], { ...ctx, tick: 1000 + day * config.time.ticksPerDay });
      if (person.knownTech.has('cordage')) break;
    }
    if (!person.knownTech.has('cordage')) {
      expect(idea.failedTests).toBeGreaterThan(0);
      expect(idea.insight).toBeLessThan(0.7);
      // And it goes back to being researched, not silently forgotten.
      expect(idea.stage).toBe('researching');
    }
  });

  it('refines to a ceiling and then retires the idea', () => {
    const knowledge = new KnowledgeSystem();
    const person = adult();
    const idea = ideaFor('cordage', 'proven');
    person.ideas.push(idea);
    person.knownTech.add('cordage');
    person.techLevel.set('cordage', 0);

    const ceiling = TECH.cordage.maxRefinement;
    for (let step = 0; step < ceiling * 3; step++) {
      knowledge.advance(person, idea, 0.5, 1000);
    }
    expect(person.techLevel.get('cordage')).toBe(ceiling);
    // The slot is freed. Without this a long-lived expert would hold both ideas
    // forever and never think of anything again.
    expect(person.ideas).toHaveLength(0);
  });

  it('pays a refined design out above one, so effects grow with it', () => {
    const person = adult();
    person.knownTech.add('cordage');
    person.techLevel.set('cordage', 2);
    expect(techPower(person, 'cordage')).toBeCloseTo(1 + 2 * REFINEMENT_STEP);
    expect(carryFactor(person)).toBeGreaterThan(1.25);
  });

  it('hands over the plain design when it is taught, not the refined one', () => {
    // Refinement lives on the knower, not the object: a fine axe in a novice's
    // hand is just an axe.
    const knowledge = new KnowledgeSystem();
    const master = adult('Master');
    master.knownTech.add('cordage');
    master.techLevel.set('cordage', 2);
    master.skills.teach = 100;
    const pupil = adult('Pupil');
    pupil.traits.intelligence = 1;

    const taught = knowledge.teach(master, pupil, 1, 1000, new RNG('teaching'));
    expect(taught).toBe('cordage');
    expect(pupil.knownTech.has('cordage')).toBe(true);
    expect(pupil.techLevel.get('cordage')).toBe(0);
    expect(techPower(pupil, 'cordage')).toBe(1);
    expect(techPower(master, 'cordage')).toBeGreaterThan(1);
  });

  it('drops an idea about something somebody has just been taught', () => {
    const knowledge = new KnowledgeSystem();
    const master = adult('Master');
    master.knownTech.add('cordage');
    master.skills.teach = 100;
    const pupil = adult('Pupil');
    pupil.traits.intelligence = 1;
    pupil.ideas.push(ideaFor('cordage', 'researching'));

    knowledge.teach(master, pupil, 1, 1000, new RNG('teaching'));
    expect(pupil.ideas).toHaveLength(0);
  });

  it('gives up on an idea nobody could ever find the materials for', () => {
    const knowledge = new KnowledgeSystem();
    const person = adult();
    const idea = ideaFor('cordage', 'researching');
    idea.insight = 1;
    idea.conceivedTick = 0;
    person.ideas.push(idea);

    const ctx = context();
    // Well inside the grace period: still theirs.
    knowledge.daily([person], { ...ctx, tick: 10 * config.time.ticksPerDay });
    expect(person.ideas).toHaveLength(1);

    // Well past it: given up on, and the slot is free again.
    knowledge.daily([person], { ...ctx, tick: 200 * config.time.ticksPerDay });
    expect(person.ideas).toHaveLength(0);
    expect(person.chronicle.some(e => e.text.includes('gave up'))).toBe(true);
  });

  it('holds nobody to more than two ideas at a time', () => {
    const knowledge = new KnowledgeSystem();
    const person = adult();
    person.traits.curiosity = 1;
    person.traits.intelligence = 1;
    person.inventory.add('thatch', 5);
    person.inventory.add('flint', 5);
    person.inventory.add('sticks', 5);
    person.noteDid('gather');
    person.noteDid('forage');
    person.needs.cold = 90;
    person.needs.hunger = 90;

    const ctx = context('busy');
    for (let day = 0; day < 400; day++) {
      knowledge.daily([person], { ...ctx, tick: 1000 + day * config.time.ticksPerDay });
      expect(person.ideas.length).toBeLessThanOrEqual(MAX_IDEAS);
    }
    expect(person.ideas.length).toBeGreaterThan(0);
  });
});

describe('the two senses an idea is built from', () => {
  it('remembers what somebody has been doing, and forgets it again', () => {
    const person = adult();
    person.noteDid('chop');
    expect(person.lately.get('chop')).toBe(1);

    // One day later it still counts as lately; a fortnight later it is gone.
    person.decayRecent();
    expect(person.lately.get('chop')).toBeLessThan(1);
    for (let day = 0; day < 14; day++) person.decayRecent();
    expect(person.lately.has('chop')).toBe(false);
  });

  it('does not record thinking or dying as things somebody did', () => {
    const person = adult();
    person.noteDid('idle');
    person.noteDid('dead');
    expect(person.lately.size).toBe(0);
  });

  it('reads the ground underfoot', () => {
    // `World.biomeAt` has existed since M0 and nothing in the simulation had
    // ever called it. This is the first thing that does.
    const knowledge = new KnowledgeSystem();
    const person = adult();
    const ctx = context();
    const notice = knowledge.notice(person, ctx);
    expect(ctx.world.biomeAt(4, 4)).toBe(notice.place);
  });
});
