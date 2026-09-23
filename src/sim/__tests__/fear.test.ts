/**
 * Fear, M11 phase 14: who becomes afraid, and of whom.
 *
 * The owner's rule governs every case here — nobody fears what they have not
 * seen or been told — and so does the note's distinction between a quarrel
 * among neighbours and a stranger hurting one of your own.
 */
import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../core/SpatialHash.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { SocialSystem } from '../social/SocialSystem.ts';
import { BandRelations } from '../social/BandRelations.ts';
import {
  sightIntruders, FEAR_AS_VICTIM, FEAR_PER_PASS_CAP, type Sightings, type Territory,
} from '../social/Fear.ts';

const SIGHT = 12;

function world(list: Person[]): { social: SocialSystem; hash: SpatialHash<Person>; rel: RelationshipGraph } {
  const rel = new RelationshipGraph();
  const social = new SocialSystem(rel, new Map(), new BandRelations());
  const hash = new SpatialHash<Person>(8);
  hash.rebuild(list);
  return { social, hash, rel };
}

function calm(person: Person): Person {
  person.mood.security = 0;
  return person;
}

describe('fear from deeds', () => {
  it('frightens the victim, and makes them dread the one who did it', () => {
    const stranger = calm(new Person('Ask', 50, 50, 1, new RNG('f-ask')));
    const victim = calm(new Person('Bel', 51, 50, 0, new RNG('f-bel')));
    const { social, hash, rel } = world([stranger, victim]);

    social.emit('assault', stranger, victim, 1, 100, hash, SIGHT);

    expect(victim.mood.security).toBeCloseTo(-FEAR_AS_VICTIM, 5);
    expect(rel.dread(victim.id, stranger.id)).toBeGreaterThan(0);
    // Dread is not opinion: hating and fearing are separate questions.
    const before = rel.opinion(victim.id, stranger.id);
    rel.addDread(victim.id, stranger.id, 50);
    expect(rel.opinion(victim.id, stranger.id)).toBe(before);
  });

  it('frightens a bystander when an outsider hurts one of their band, not when neighbours quarrel', () => {
    const stranger = calm(new Person('Ask', 50, 50, 1, new RNG('f-ask')));
    const cousin = calm(new Person('Cai', 51, 50, 0, new RNG('f-cai')));
    const witness = calm(new Person('Dun', 52, 51, 0, new RNG('f-dun')));
    const { social, hash } = world([stranger, cousin, witness]);

    social.emit('assault', stranger, cousin, 1, 100, hash, SIGHT);
    const afterStranger = witness.mood.security;
    expect(afterStranger).toBeLessThan(0);

    // Now a quarrel inside the band: the same witness is not made afraid.
    const neighbour = calm(new Person('Eli', 52, 50, 0, new RNG('f-eli')));
    hash.rebuild([stranger, cousin, witness, neighbour]);
    social.emit('assault', neighbour, cousin, 1, 200, hash, SIGHT);
    expect(witness.mood.security).toBe(afterStranger);
  });

  it('frightens nobody who did not see it and was not told', () => {
    const stranger = calm(new Person('Ask', 50, 50, 1, new RNG('f-ask')));
    const cousin = calm(new Person('Cai', 51, 50, 0, new RNG('f-cai')));
    const faraway = calm(new Person('Fen', 90, 90, 0, new RNG('f-fen')));
    const { social, hash } = world([stranger, cousin, faraway]);

    social.emit('theft', stranger, cousin, 1, 100, hash, SIGHT);
    expect(faraway.mood.security).toBe(0);
  });

  it('does not frighten over a gift', () => {
    const stranger = calm(new Person('Ask', 50, 50, 1, new RNG('f-ask')));
    const cousin = calm(new Person('Cai', 51, 50, 0, new RNG('f-cai')));
    const { social, hash, rel } = world([stranger, cousin]);
    social.emit('gift', stranger, cousin, 1, 100, hash, SIGHT);
    expect(cousin.mood.security).toBe(0);
    expect(rel.dread(cousin.id, stranger.id)).toBe(0);
  });
});

describe('strangers on your ground', () => {
  const home: Territory = { bandId: 0, homeX: 50, homeY: 50 };
  const territories = new Map([[0, home], [1, { bandId: 1, homeX: 150, homeY: 150 }]]);

  it('costs a little security and is remembered by the band', () => {
    const looker = calm(new Person('Gar', 50, 50, 0, new RNG('s-gar')));
    const intruder = calm(new Person('Hal', 55, 50, 1, new RNG('s-hal')));
    const hash = new SpatialHash<Person>(8);
    hash.rebuild([looker, intruder]);
    const sightings: Sightings = new Map();

    sightIntruders([looker, intruder], hash, territories, 40, SIGHT, 100, sightings, undefined, []);

    expect(looker.mood.security).toBeLessThan(0);
    expect(looker.mood.security).toBeGreaterThanOrEqual(-FEAR_PER_PASS_CAP);
    expect(sightings.get(0)?.get(intruder.id)).toEqual({ tick: 100, bandId: 1 });
    // The intruder is on somebody else's ground, not their own: they are not
    // frightened by the person whose land they are standing on.
    expect(intruder.mood.security).toBe(0);
    expect(sightings.get(1)).toBeUndefined();
  });

  it('sees nothing it could not see', () => {
    const looker = calm(new Person('Gar', 50, 50, 0, new RNG('s-gar')));
    // On the band's ground, but out of the looker's sight.
    const intruder = new Person('Hal', 50, 80, 1, new RNG('s-hal'));
    const hash = new SpatialHash<Person>(8);
    hash.rebuild([looker, intruder]);
    const sightings: Sightings = new Map();

    sightIntruders([looker, intruder], hash, territories, 40, SIGHT, 100, sightings, undefined, []);

    expect(looker.mood.security).toBe(0);
    expect(sightings.get(0)).toBeUndefined();
  });
});
