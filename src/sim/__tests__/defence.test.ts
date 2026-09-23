/**
 * Defending what is yours — M11 phase 15b.
 *
 * The writer first: who a witness caught in the act is decided by `emit`, at
 * the moment of the deed, from who was in sight and whose property it was.
 * Everything the ladder later does rests on this being right — a witness who
 * "catches" a thief robbing somebody else's people would be a guard for every
 * band at once, which is exactly the omniscience the owner's rule forbids.
 */
import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../core/SpatialHash.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { SocialSystem } from '../social/SocialSystem.ts';
import { BandRelations } from '../social/BandRelations.ts';
import { CAUGHT_MEMORY, caughtOffender } from '../social/Defence.ts';

const SIGHT = 12;

function world(list: Person[]): { social: SocialSystem; hash: SpatialHash<Person> } {
  const social = new SocialSystem(new RelationshipGraph(), new Map(), new BandRelations());
  const hash = new SpatialHash<Person>(8);
  hash.rebuild(list);
  return { social, hash };
}

function adult(name: string, x: number, y: number, band: number): Person {
  const person = new Person(name, x, y, band, new RNG('d-' + name));
  person.age = 30 * person.daysPerYear;
  return person;
}

describe('catching somebody in the act', () => {
  it('is recorded by an owner who sees their band’s store robbed', () => {
    const thief = adult('Ann', 50, 50, 1);
    const owner = adult('Bo', 53, 50, 0);
    const { social, hash } = world([thief, owner]);

    social.emit('theft', thief, null, 0.5, 1000, hash, SIGHT, true, 0);

    expect(caughtOffender(owner, 1000)).toBe(thief.id);
    expect(caughtOffender(owner, 1000 + CAUGHT_MEMORY)).toBe(thief.id);
    expect(caughtOffender(owner, 1000 + CAUGHT_MEMORY + 1)).toBeNull();
  });

  it('is not recorded by somebody whose people the property is not', () => {
    const thief = adult('Ann', 50, 50, 1);
    const stranger = adult('Cai', 52, 50, 2);
    const kin = adult('Dana', 51, 51, 1);
    const { social, hash } = world([thief, stranger, kin]);

    social.emit('theft', thief, null, 0.5, 1000, hash, SIGHT, true, 0);

    // Both saw it and both remember it; neither has anything of theirs to
    // defend, so neither holds it against the thief as an intervention.
    expect(stranger.memory.all().length).toBe(1);
    expect(caughtOffender(stranger, 1000)).toBeNull();
    expect(caughtOffender(kin, 1000)).toBeNull();
  });

  it('is recorded by the victim of a theft, and by their people in sight', () => {
    const thief = adult('Ann', 50, 50, 0);
    const victim = adult('Bo', 51, 50, 0);
    const friend = adult('Cai', 53, 50, 0);
    const outsider = adult('Dana', 52, 51, 1);
    const { social, hash } = world([thief, victim, friend, outsider]);

    social.emit('theft', thief, victim, 0.5, 1000, hash, SIGHT);

    expect(caughtOffender(victim, 1000)).toBe(thief.id);
    expect(caughtOffender(friend, 1000)).toBe(thief.id);
    expect(caughtOffender(outsider, 1000)).toBeNull();
  });

  it('is not recorded out of sight, nor by a child, nor for a blow', () => {
    const thief = adult('Ann', 50, 50, 1);
    const far = adult('Bo', 50, 50 + SIGHT + 2, 0);
    const child = new Person('Cai', 51, 50, 0, new RNG('d-child'));
    child.age = 6 * child.daysPerYear;
    const { social, hash } = world([thief, far, child]);

    social.emit('sabotage', thief, null, 0.5, 1000, hash, SIGHT, true, 0);
    expect(caughtOffender(far, 1000)).toBeNull();
    expect(caughtOffender(child, 1000)).toBeNull();

    const victim = adult('Dana', 51, 51, 0);
    hash.rebuild([thief, victim]);
    social.emit('assault', thief, victim, 0.5, 1000, hash, SIGHT);
    expect(caughtOffender(victim, 1000)).toBeNull();
  });
});

// M11 phase 15b.2, the outsider's rung, through the real scorer: `Brain`
// decides, so this runs a small world and watches what the witness chooses.
import { Simulation } from '../core/Simulation.ts';

const SMALL = {
  seed: 'defence-test',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 2, peoplePerBand: 4 },
};

function settled(person: Person): void {
  person.needs.hunger = 0;
  person.needs.thirst = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  person.needs.company = 0;
  // Calm: the defence of the ground (phase 14b) needs fear, and this test is
  // about the rung that does not.
  person.mood.security = 100;
}

describe('the outsider’s rung', () => {
  it('warns off an outsider caught in the act, with no fear needed', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [owner] = sim.livingPeople().filter(p => p.bandId === 0 && !p.isChild);
    const [thief] = sim.livingPeople().filter(p => p.bandId === 1 && !p.isChild);
    thief!.x = owner!.x + 3;
    thief!.y = owner!.y;
    sim.peopleHash.rebuild(sim.people);
    owner!.caughtId = thief!.id;
    owner!.caughtTick = sim.time.tick;

    let warned = false;
    for (let i = 0; i < 40 && !warned; i++) {
      settled(owner!);
      thief!.x = owner!.x + 3;
      thief!.y = owner!.y;
      sim.step();
      warned = owner!.action === 'warn' && owner!.targetPersonId === thief!.id;
    }
    expect(warned).toBe(true);
  });

  it('does nothing about one of their own caught — that is not this rung', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [owner, kin] = sim.livingPeople().filter(p => p.bandId === 0 && !p.isChild);
    kin!.x = owner!.x + 3;
    kin!.y = owner!.y;
    owner!.caughtId = kin!.id;
    owner!.caughtTick = sim.time.tick;

    for (let i = 0; i < 40; i++) {
      settled(owner!);
      sim.step();
      expect(owner!.action === 'warn' && owner!.targetPersonId === kin!.id).toBe(false);
    }
  });
});

describe('a warning in answer to a deed', () => {
  // M11 phase 15b.2. Measured: counting the owner's warning against the two
  // peoples on top of the theft it answered closed a loop through
  // `bandHostility`, which is what scores sabotage.
  it('does not count against the two peoples a second time', () => {
    const owner = adult('Ann', 50, 50, 0);
    const thief = adult('Bo', 51, 50, 1);
    const relations = new BandRelations();
    const social = new SocialSystem(new RelationshipGraph(), new Map(), relations);
    const hash = new SpatialHash<Person>(8);
    hash.rebuild([owner, thief]);

    social.emit('threaten', owner, thief, 1, 1000, hash, SIGHT, true, undefined, false);
    expect(relations.standing(0, 1)).toBe(0);
    // The warned still takes it personally: that is theirs to feel.
    expect(thief.memory.all().some(m => m.type === 'threaten' && m.actorId === owner.id)).toBe(true);

    social.emit('threaten', owner, thief, 1, 1001, hash, SIGHT);
    expect(relations.standing(0, 1)).toBeLessThan(0);
  });
});

describe('holding somebody back', () => {
  // M11 phase 15b.3. Made one-sided so the struggle's single roll cannot go
  // the other way: a practised fighter against somebody barely standing.
  function aStruggle(): { sim: Simulation; holder: Person; held: Person } {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [holder, held] = sim.livingPeople().filter(p => p.bandId === 0 && !p.isChild);
    settled(holder!);
    holder!.skills.fight = 100;
    held!.health = 5;
    held!.x = holder!.x + 1;
    held!.y = holder!.y;
    return { sim, holder: holder!, held: held! };
  }

  it('holds them still for as long as the holder keeps it up, and no longer', () => {
    const { sim, holder, held } = aStruggle();
    expect(sim.order(holder, 'restrain', { personId: held.id })).toBe(true);
    for (let i = 0; i < 30 && held.heldBy === null; i++) {
      settled(holder);
      sim.step();
    }
    expect(held.heldBy).toBe(holder.id);
    const x = held.x;
    const y = held.y;
    for (let i = 0; i < 20; i++) {
      settled(holder);
      sim.step();
    }
    // Frozen: neither thinking nor walking.
    expect(held.x).toBe(x);
    expect(held.y).toBe(y);
    expect(held.action).toBe('idle');

    // The holder is called away: the hold lapses within `HOLD_RENEW` ticks.
    holder.needs.thirst = 100;
    for (let i = 0; i < 10; i++) sim.step();
    expect(held.heldUntil).toBeLessThan(sim.time.tick);
  });

  it('is chosen by a witness who caught one of their own at it', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [owner, kin] = sim.livingPeople().filter(p => p.bandId === 0 && !p.isChild);
    kin!.health = 20; // Somebody the witness can hope to hold.
    let chose = false;
    for (let i = 0; i < 40 && !chose; i++) {
      settled(owner!);
      owner!.caughtId = kin!.id;
      owner!.caughtTick = sim.time.tick;
      kin!.x = owner!.x + 3;
      kin!.y = owner!.y;
      sim.step();
      chose = owner!.action === 'restrain' && owner!.targetPersonId === kin!.id;
    }
    expect(chose).toBe(true);
  });
});

describe('calling for help', () => {
  // M11 phase 15b.4. The owner's rule applied to sound: a shout carries the
  // fact that somebody called, and the caller tells whoever comes what for.
  it('is heard within earshot, and tells whoever comes who it was about', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [caller, helper, offender] = sim.livingPeople().filter(p => p.bandId === 0 && !p.isChild);
    settled(caller!);
    settled(helper!);
    helper!.x = caller!.x + 6;
    helper!.y = caller!.y;
    offender!.x = caller!.x + 30;
    offender!.y = caller!.y + 30;
    // The caller saw the theft; the helper did not.
    const hash = sim.peopleHash;
    hash.rebuild(sim.people);
    sim.social.emit('theft', offender!, caller!, 0.5, sim.time.tick, hash, 1);
    expect(caughtOffender(caller!, sim.time.tick)).toBe(offender!.id);
    expect(caughtOffender(helper!, sim.time.tick)).toBeNull();

    expect(sim.order(caller!, 'call_for_help', { x: caller!.x, y: caller!.y })).toBe(true);
    for (let i = 0; i < 10 && caller!.order !== null; i++) sim.step();
    expect(sim.helpCalls.some(c => c.callerId === caller!.id)).toBe(true);
    expect(helper!.helpCallerId).toBe(caller!.id);
    // Heard the shout, and nothing else yet.
    expect(caughtOffender(helper!, sim.time.tick)).toBeNull();

    expect(sim.order(helper!, 'answer_call', { personId: caller!.id })).toBe(true);
    for (let i = 0; i < 60 && helper!.order !== null; i++) {
      settled(helper!);
      sim.step();
    }
    expect(caughtOffender(helper!, sim.time.tick)).toBe(offender!.id);
    expect(helper!.memory.all().some(m =>
      m.type === 'theft' && m.actorId === offender!.id && !m.firsthand)).toBe(true);
  });
});

describe('tying somebody up', () => {
  // M11 phase 15c.
  function aHold(): { sim: Simulation; holder: Person; held: Person; binder: Person } {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [holder, held, binder] = sim.livingPeople().filter(p => p.bandId === 0 && !p.isChild);
    settled(holder!);
    settled(binder!);
    held!.x = holder!.x + 1;
    held!.y = holder!.y;
    binder!.x = holder!.x;
    binder!.y = holder!.y + 1;
    binder!.knownTech.add('cordage');
    binder!.inventory.add('rope', 1);
    // Held as `doRestrain` holds, without the roll.
    held!.heldBy = holder!.id;
    held!.heldUntil = sim.time.tick + 200;
    return { sim, holder: holder!, held: held!, binder: binder! };
  }

  it('spends a rope, and outlasts the hold', () => {
    const { sim, held, binder } = aHold();
    expect(sim.order(binder, 'bind', { personId: held.id })).toBe(true);
    for (let i = 0; i < 30 && binder.order !== null; i++) {
      settled(binder);
      sim.step();
    }
    expect(held.boundBy).toBe(binder.id);
    expect(binder.inventory.count('rope')).toBe(0);

    // The holder lets go; the rope does not.
    held.heldBy = null;
    held.heldUntil = -9999;
    const x = held.x;
    for (let i = 0; i < 50; i++) sim.step();
    expect(held.x).toBe(x);
    expect(held.boundUntil).toBeGreaterThan(sim.time.tick);
  });

  it('refuses somebody nobody is holding, and says why', () => {
    const { sim, held, binder } = aHold();
    held.heldBy = null;
    held.heldUntil = -9999;
    expect(sim.order(binder, 'bind', { personId: held.id })).toBe(true);
    for (let i = 0; i < 30 && binder.order !== null; i++) sim.step();
    expect(sim.interruptions.some(n => n.personId === binder.id && n.reason === 'not_held')).toBe(true);
    expect(binder.inventory.count('rope')).toBe(1);
  });
});
