import { describe, expect, it } from 'vitest';
import { makeConfig } from '../core/Config.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { Household } from '../entities/Household.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { compactNightShelter } from '../compact/CompactNightShelter.ts';
import { advanceCompactBandLife } from '../compact/CompactBandLife.ts';
import { deriveCompactStream, goalOf } from '../compact/CompactPerson.ts';
import { RelationshipGraph } from '../social/Relationships.ts';

function fixture() {
  const ids = new IdSpace();
  const config = makeConfig({ time: { ticksPerDay: 1 }, population: { conceptionChance: 1 } });
  const people: Person[] = [];
  const homes = new Map<number, Household>();
  const buildings: Building[] = [];
  const makePerson = (name: string, band = 1) => {
    const p = new Person(name, 10, 10, band, new RNG(name), config.time.daysPerSeason * 4, ids);
    p.age = 25 * p.daysPerYear; p.health = 100;
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    p.action = 'forage'; // frozen action is not evidence of where they sleep
    people.push(p); return p;
  };
  const makeRoof = (kind = 'lean_to', band = 1) => {
    const roof = new Building(BUILDINGS[kind]!, 4, 4, band, ids);
    roof.complete = true; roof.durability = roof.def.workTicks;
    buildings.push(roof); return roof;
  };
  const house = (members: Person[], roof: Building | null) => {
    const h = new Household(members[0]!.name, members[0]!.id, members[0]!.bandId, 0, ids);
    for (const p of members) { p.householdId = h.id; h.add(p.id); }
    h.homeBuildingId = roof?.id ?? null; homes.set(h.id, h); return h;
  };
  const admit = (roster: readonly Person[] = people) =>
    compactNightShelter(roster, homes, buildings, config.childhood);
  return { ids, config, people, homes, buildings, makePerson, makeRoof, house, admit };
}

describe('compact nightly shelter', () => {
  it('allows a healthy local couple to conceive using the unchanged daily life rule', () => {
    const f = fixture();
    const mother = f.makePerson('mother'), father = f.makePerson('father');
    mother.sex = 'female'; father.sex = 'male';
    mother.spouseId = father.id; father.spouseId = mother.id;
    const roof = f.makeRoof(); const home = f.house([mother, father], roof);
    const night = f.admit();
    expect(night).toEqual(new Map([[mother.id, roof.id], [father.id, roof.id]]));
    const roster = f.people.map(person => ({ person, lastAdvancedTick: 1, epoch: 0,
      rng: deriveCompactStream('compact-roof', person.id), goal: goalOf(person, 1), intake: null }));
    advanceCompactBandLife(roster, {
      ledger: { version: 1, lastAdvancedDay: 0 }, tick: 1, day: 1,
      time: f.config.time, population: f.config.population, childhood: f.config.childhood,
      learning: f.config.learning, worldSeed: 'compact-roof', ids: f.ids,
      peopleById: new Map(f.people.map(p => [p.id, p])), householdsById: f.homes,
      relationships: new RelationshipGraph(), roofTonight: night,
    });
    expect(mother.pregnant).toBe(true);
    expect(mother.pregnantBy).toBe(father.id);
    expect(home.homeBuildingId).toBe(roof.id);
    expect(mother.action).toBe('forage');
    expect([mother.x, mother.y]).toEqual([10, 10]);
  });

  it('never overbooks one roof across households, regardless of iteration order', () => {
    const f = fixture();
    const a = f.makePerson('A'), b = f.makePerson('B'), c = f.makePerson('C'), d = f.makePerson('D');
    const roof = f.makeRoof();
    f.house([a, b], roof); f.house([c, d], roof);
    const expected = new Map([[a.id, roof.id], [b.id, roof.id]]);
    expect(f.admit()).toEqual(expected);
    expect(f.admit([...f.people].reverse())).toEqual(expected);
    expect(f.admit()).toEqual(expected);
  });

  it('refuses unfinished, ruined, nonresidential, foreign and missing homes, and newcomers without one', () => {
    const f = fixture();
    const a = f.makePerson('unfinished'), b = f.makePerson('ruined'), c = f.makePerson('store');
    const d = f.makePerson('foreign'), e = f.makePerson('visitor'), g = f.makePerson('missing');
    const incomplete = f.makeRoof(); incomplete.complete = false;
    const ruined = f.makeRoof(); ruined.durability = 0;
    f.house([a], incomplete); f.house([b], ruined);
    f.house([c], f.makeRoof('stockpile')); f.house([d], f.makeRoof('lean_to', 2));
    f.house([e], null);
    const missing = f.house([g], null); missing.homeBuildingId = 99999;
    expect(f.admit().size).toBe(0);
  });

  it('counts a carried baby with an admitted carrier but never an older child as a free place', () => {
    const f = fixture();
    const a = f.makePerson('adult A'), b = f.makePerson('adult B');
    const baby = f.makePerson('baby'), older = f.makePerson('older');
    baby.age = 0; baby.carriedBy = a.id;
    older.age = 8 * older.daysPerYear; older.carriedBy = a.id;
    const roof = f.makeRoof(); f.house([a, b, baby, older], roof);
    expect(f.admit()).toEqual(new Map([[a.id, roof.id], [b.id, roof.id], [baby.id, roof.id]]));
    // The local roster, not the household's archived members, decides admission.
    expect(f.admit([b, baby])).toEqual(new Map([[b.id, roof.id]]));
    a.captiveOf = b.id;
    expect(f.admit().has(a.id)).toBe(false);
    expect(f.admit().has(baby.id)).toBe(false);
  });

  it('does not grant a roof to an absent spouse or to stale nonreciprocal household membership', () => {
    const f = fixture();
    const a = f.makePerson('present'), b = f.makePerson('absent');
    const roof = f.makeRoof(); const h = f.house([a, b], roof);
    a.spouseId = b.id; b.spouseId = a.id;
    expect(f.admit([a])).toEqual(new Map([[a.id, roof.id]]));
    h.remove(a.id);
    expect(f.admit([a])).toEqual(new Map());
    b.die('hunger');
    expect(f.admit().size).toBe(0);
  });
});
