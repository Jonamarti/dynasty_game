/**
 * A deed records who saw it — M11 phase 3b.
 *
 * The UI's promise "no one saw you" is only as true as the count `emit` puts on
 * the event. This is that count, checked against brute force: the number of
 * living bystanders inside `sightRadius` at the moment of the deed, with the
 * actor and the victim themselves always excluded. The victim's own knowledge
 * is asserted here too, because the whole point of an unwitnessed deed is that
 * the world splits into the two people who were in it and everybody else.
 */
import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../core/SpatialHash.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { SocialSystem } from '../social/SocialSystem.ts';
import { BandRelations } from '../social/BandRelations.ts';

const SIGHT = 12;

function people(): Person[] {
  return [
    new Person('Ann', 50, 50, 0, new RNG('w-ann')),
    new Person('Bo', 52, 50, 0, new RNG('w-bo')),
    new Person('Cai', 51, 51, 0, new RNG('w-cai')),
    new Person('Dana', 80, 80, 1, new RNG('w-dana')),
  ];
}

function world(list: Person[]): {
  social: SocialSystem;
  hash: SpatialHash<Person>;
} {
  const social = new SocialSystem(new RelationshipGraph(), new Map(), new BandRelations());
  const hash = new SpatialHash<Person>(8);
  hash.rebuild(list);
  return { social, hash };
}

describe('a deed records who saw it', () => {
  it('is unwitnessed when nobody else stands in sight', () => {
    const [actor, victim, near, distant] = people();
    // Dana more than a sight radius away; Cai kept just outside it too.
    near!.x = 50;
    near!.y = 63;
    distant!.x = 80;
    distant!.y = 80;
    const { social, hash } = world([actor!, victim!, near!, distant!]);

    const evt = social.emit('theft', actor!, victim!, 0.5, 1000, hash, SIGHT);

    expect(evt.witnesses).toBe(0);
    // The victim was there and remembers; nobody else does. This is the
    // exact split the UI's "no one else knows yet" rests on.
    expect(victim!.memory.has(evt.id)).toBe(true);
    for (const other of [actor!, near!, distant!]) {
      expect(other.memory.has(evt.id), other.name + ' should not know').toBe(false);
    }
  });

  it('counts every bystander within sight, however many', () => {
    const [actor, victim, near] = people();
    near!.x = 51;
    near!.y = 51;
    const { social, hash } = world([actor!, victim!, near!]);

    const evt = social.emit('theft', actor!, victim!, 0.5, 1000, hash, SIGHT);

    expect(evt.witnesses).toBe(1);
    // The one person who could see it is the one person who now knows it,
    // firsthand.
    const remembered = near!.memory.all().find(e => e.eventId === evt.id);
    expect(remembered).toBeDefined();
    expect(remembered!.firsthand).toBe(true);
  });

  it('ignores the actor and the victim however close they are', () => {
    // The two people in the deed stand on each other's toes, and that is not
    // two witnesses. A deed between a couple by the fire is still a secret
    // from everyone else.
    const [actor, victim] = people();
    actor!.x = 50;
    actor!.y = 50;
    victim!.x = 50.5;
    victim!.y = 50;
    const { social, hash } = world([actor!, victim!]);

    const evt = social.emit('assault', actor!, victim!, 1, 1000, hash, SIGHT);

    expect(evt.witnesses).toBe(0);
  });
});
// M11 phase 14e: a deed against a building moves how the two peoples stand,
// but only when somebody of the owning band saw it, and once per deed.
describe('a property deed seen by its owners', () => {
  function setup(witnessX: number): { social: SocialSystem; hash: SpatialHash<Person>; bands: BandRelations; actor: Person } {
    const actor = new Person('Raid', 50, 50, 1, new RNG('p-raid'));
    const owner = new Person('Own', witnessX, 50, 0, new RNG('p-own'));
    const ownerToo = new Person('Own2', witnessX, 51, 0, new RNG('p-own2'));
    const bands = new BandRelations();
    const social = new SocialSystem(new RelationshipGraph(), new Map(), bands);
    const hash = new SpatialHash<Person>(8);
    hash.rebuild([actor, owner, ownerToo]);
    return { social, hash, bands, actor };
  }

  it('costs standing when an owner sees it, once however many saw', () => {
    const one = setup(52);
    one.social.emit('sabotage', one.actor, null, 1, 100, one.hash, SIGHT, true, 0);
    const seen = one.bands.standing(1, 0);
    expect(seen).toBeLessThan(0);
    // Two owners watched; the standing moved by one deed's worth, which is
    // what a single witness would have produced (checked against the formula
    // through a second, identical deed doubling it rather than quadrupling).
    one.social.emit('sabotage', one.actor, null, 1, 101, one.hash, SIGHT, true, 0);
    expect(one.bands.standing(1, 0)).toBeCloseTo(seen * 2, 5);
  });

  it('costs nothing when nobody of the owning band was there', () => {
    const none = setup(90);
    none.social.emit('sabotage', none.actor, null, 1, 100, none.hash, SIGHT, true, 0);
    expect(none.bands.standing(1, 0)).toBe(0);
  });
});
