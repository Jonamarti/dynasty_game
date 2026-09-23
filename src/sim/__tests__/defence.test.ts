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
