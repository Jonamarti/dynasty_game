import { describe, expect, it } from 'vitest';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { NeedsSystem } from '../systems/NeedsSystem.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { admittedOccupantsOf, hasRoomFor, occupantsOf, syncShelterArrival } from '../ai/Occupancy.ts';
import { toPersonRecord, fromPersonRecord } from '../persistence/EntityRecords.ts';

function camp() {
  const roof = new Building(BUILDINGS.windbreak!, 20, 20, 1);
  roof.complete = true;
  const people = [0, 1, 2, 3].map(i => {
    const p = new Person('Guest' + i, roof.centerX, roof.centerY, 1, new RNG('m16-guest-' + i));
    p.shelterArrivalBuildingId = roof.id;
    p.shelterArrivalTick = [10, 5, 5, 20][i]!;
    return p;
  });
  const hash = new SpatialHash<Person>(8);
  hash.rebuild(people);
  return { roof, people, hash };
}

describe('m16-occupancy', () => {
  it('admits three to a windbreak and denies the fourth, independent of roster order', () => {
    const { roof, people, hash } = camp();
    const accepted = [people[1]!.id, people[2]!.id, people[0]!.id];
    expect(BUILDINGS.windbreak!.places).toBe(3);
    expect(admittedOccupantsOf(roof, hash).map(p => p.id)).toEqual(accepted);
    expect(hasRoomFor(roof, people[3]!, hash)).toBe(false);
    hash.rebuild([...people].reverse());
    expect(admittedOccupantsOf(roof, hash).map(p => p.id)).toEqual(accepted);
  });

  it('counts carried babies with the carrier, not as a new occupant', () => {
    const { roof, people, hash } = camp();
    const baby = new Person('Baby', roof.centerX, roof.centerY, 1, new RNG('m16-baby'));
    baby.carriedBy = people[1]!.id;
    hash.insert(baby);
    expect(occupantsOf(roof, hash)).toHaveLength(4);
    expect(hasRoomFor(roof, baby, hash)).toBe(true);
    baby.carriedBy = people[3]!.id;
    expect(hasRoomFor(roof, baby, hash)).toBe(false);
  });

  it('does not award the building warmth to somebody beyond capacity', () => {
    const { roof, people, hash } = camp();
    const needs = new NeedsSystem(DEFAULT_CONFIG.needs) as unknown as {
      shelterAt: (p: Person, b: Building[], h: SpatialHash<Person>) => number;
    };
    expect(needs.shelterAt(people[0]!, [roof], hash)).toBe(roof.def.shelter);
    expect(needs.shelterAt(people[3]!, [roof], hash)).toBe(0);
  });

  it('tracks first entrance and keeps it through save/load, but resets on departure', () => {
    const { roof, people } = camp();
    const person = people[0]!;
    const structures = new SpatialHash<Building>(8);
    structures.insert(roof);
    syncShelterArrival(person, structures, 30);
    expect(person.shelterArrivalTick).toBe(10);
    const restored = fromPersonRecord(JSON.parse(JSON.stringify(toPersonRecord(person, 30))));
    expect(restored.shelterArrivalTick).toBe(10);
    expect(restored.shelterArrivalBuildingId).toBe(roof.id);
    person.x = 0; person.y = 0;
    syncShelterArrival(person, structures, 31);
    expect(person.shelterArrivalTick).toBeNull();
    person.x = roof.centerX; person.y = roof.centerY;
    syncShelterArrival(person, structures, 32);
    expect(person.shelterArrivalTick).toBe(32);
  });

  it('does not make nonresidential buildings into beds', () => {
    expect(BUILDINGS.granary!.places).toBeUndefined();
    expect(BUILDINGS.library!.places).toBeUndefined();
    expect(BUILDINGS.mud_hut!.places).toBe(3);
    expect(BUILDINGS.wattle_hut!.places).toBe(4);
    expect(BUILDINGS.stone_house!.places).toBe(6);
    expect(BUILDINGS.longhouse!.places).toBe(10);
  });
});
