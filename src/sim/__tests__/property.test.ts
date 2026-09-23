/** Property is protected by attention, not by an invisible permission wall. */
import { describe, expect, it } from 'vitest';
import { SpatialHash } from '../core/SpatialHash.ts';
import { RNG } from '../core/RNG.ts';
import { BUILDINGS, Building } from '../entities/Building.ts';
import { Person } from '../entities/Person.ts';
import { mayUse } from '../social/Property.ts';
import { explainPropertyUse } from '../social/Knowledge.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { BandRelations } from '../social/BandRelations.ts';

const SIGHT = 12;

function person(name: string, x: number, y: number, bandId: number): Person {
  return new Person(name, x, y, bandId, new RNG('property-' + name));
}

function access(
  actor: Person, building: Building, people: Person[], bandRelations = new BandRelations()
) {
  const peopleHash = new SpatialHash<Person>(8);
  peopleHash.rebuild(people);
  return mayUse(actor, building, { peopleHash, sightRadius: SIGHT, bandRelations });
}

describe('observable property', () => {
  it('always lets a band use its own structure', () => {
    const actor = person('Ari', 5, 5, 0);
    const store = new Building(BUILDINGS.stockpile!, 5, 5, 0);

    expect(access(actor, store, [actor])).toEqual({
      ours: true,
      allowed: true,
      seen: null,
      basis: 'own',
    });
  });

  it('lets an outsider use an unwatched structure', () => {
    const actor = person('Ari', 5, 5, 0);
    const owner = person('Bo', 40, 40, 1);
    const store = new Building(BUILDINGS.stockpile!, 5, 5, 1);

    expect(access(actor, store, [actor, owner]).allowed).toBe(true);
  });

  it('names an owner close enough to intervene', () => {
    const actor = person('Ari', 5, 5, 0);
    const owner = person('Bo', 7, 5, 1);
    const stranger = person('Cai', 6, 5, 2);
    const store = new Building(BUILDINGS.stockpile!, 5, 5, 1);

    const result = access(actor, store, [actor, owner, stranger]);
    expect(result.allowed).toBe(false);
    expect(result.seen).toBe(owner);
    // A third-party witness can spread the story, but cannot enforce another
    // band's claim merely by standing nearby.
    expect(result.seen).not.toBe(stranger);
  });

  // M11 phase 7c.
  it('treats a close ally as if it were their own band, watched or not', () => {
    const actor = person('Ari', 5, 5, 0);
    const owner = person('Bo', 7, 5, 1);
    const store = new Building(BUILDINGS.stockpile!, 5, 5, 1);

    // Same layout as the watched case above, which refuses without an alliance.
    expect(access(actor, store, [actor, owner]).allowed).toBe(false);

    const allies = new BandRelations();
    allies.add(0, 1, 100);
    const result = access(actor, store, [actor, owner], allies);
    expect(result.allowed).toBe(true);
    expect(result.ours).toBe(true);
  });
});

describe('a witness, in words', () => {
  // M11 phase 13f. `mayUse` used to write `seen.name + ' is close enough to
  // see them'`, and that sentence reached the screen twice with the real name
  // of somebody the player's character had never met.
  it('is a description, not a name, when the reader has never met them', () => {
    const actor = person('Ari', 5, 5, 0);
    const owner = person('Bo', 7, 5, 1);
    const store = new Building(BUILDINGS.stockpile!, 5, 5, 1);
    const said = explainPropertyUse(actor, access(actor, store, [actor, owner]), new RelationshipGraph());
    expect(said).not.toContain('Bo');
    expect(said).toMatch(/^A .* is close enough to see them$/);
  });

  it('is a name once the reader knows it', () => {
    const actor = person('Ari', 5, 5, 0);
    const owner = person('Bo', 7, 5, 1);
    const store = new Building(BUILDINGS.stockpile!, 5, 5, 1);
    const graph = new RelationshipGraph();
    graph.edge(actor.id, owner.id).familiarity = 20;
    expect(explainPropertyUse(actor, access(actor, store, [actor, owner]), graph))
      .toBe('Bo is close enough to see them');
  });
});
