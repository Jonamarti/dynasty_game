import { describe, expect, it } from 'vitest';
import { BUILDINGS, Building } from '../entities/Building.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { isUnderRoof, roofOverSleeper } from '../systems/LifeSystem.ts';
import { admittedOccupantsOf, coversShelter, hasRoomFor, occupantsOf } from '../ai/Occupancy.ts';

function leanTo(): Building {
  const roof = new Building(BUILDINGS.lean_to!, 10, 10, 1);
  roof.complete = true;
  return roof;
}
function sleeper(roof: Building, name: string, tick: number): Person {
  const p = new Person(name, roof.centerX, roof.centerY, 1, new RNG('lean-to-' + name));
  p.action = 'sleep';
  p.targetBuildingId = roof.id;
  p.shelterArrivalBuildingId = roof.id;
  p.shelterArrivalTick = tick;
  return p;
}
describe('m16-lean-to', () => {
  it('completes from sticks and leaves, without mud, timber or any tech', () => {
    const def = BUILDINGS.lean_to!;
    expect(def).toMatchObject({
      width: 2, height: 2, materials: { sticks: 10, thatch: 8 },
      workTicks: 200, shelter: 0.6, places: 2, roofed: true,
      storage: 0, requiresTech: null,
    });
    expect(def.interior).toBeUndefined();
    expect(def.placement).toBeUndefined();
    const roof = new Building(def, 10, 10, 1);
    expect(roof.materialsReady).toBe(false);
    roof.delivered.add('sticks', 10);
    roof.delivered.add('thatch', 8);
    expect(roof.materialsReady).toBe(true);
    expect(roof.addWork(199)).toBe(false);
    expect(roof.addWork(1)).toBe(true);
    expect(roof.complete).toBe(true);
  });
  it('admits two sleepers by arrival time, never the third', () => {
    const roof = leanTo();
    const people = [sleeper(roof, 'First', 10), sleeper(roof, 'Second', 20), sleeper(roof, 'Third', 30)];
    const hash = new SpatialHash<Person>(8);
    hash.rebuild([...people].reverse());
    expect(occupantsOf(roof, hash)).toHaveLength(3);
    expect(admittedOccupantsOf(roof, hash).map(p => p.name)).toEqual(['First', 'Second']);
    expect(hasRoomFor(roof, people[0]!, hash)).toBe(true);
    expect(hasRoomFor(roof, people[1]!, hash)).toBe(true);
    expect(hasRoomFor(roof, people[2]!, hash)).toBe(false);
    const roofs = new Map([[roof.id, roof]]);
    expect(roofOverSleeper(people[0]!, roofs)).toBe(roof);
    expect(roofOverSleeper(people[1]!, roofs)).toBe(roof);
    const admittedRoofTonight = new Map(admittedOccupantsOf(roof, hash)
      .filter(p => roofOverSleeper(p, roofs)).map(p => [p.id, roof.id] as const));
    expect(admittedRoofTonight.has(people[0]!.id)).toBe(true);
    expect(admittedRoofTonight.has(people[1]!.id)).toBe(true);
    expect(admittedRoofTonight.has(people[2]!.id)).toBe(false);
    // Under one admitted shared roof is the prerequisite for conception.
    expect(admittedRoofTonight.get(people[0]!.id)).toBe(admittedRoofTonight.get(people[1]!.id));
  });
  it('does not treat a passer-by outside the roof as occupying a place', () => {
    const roof = leanTo();
    const passer = sleeper(roof, 'Outside', 30);
    passer.x = roof.x - 1;
    expect(isUnderRoof(roof, passer.x, passer.y)).toBe(false);
    expect(coversShelter(roof, passer)).toBe(false);
    const windbreak = new Building(BUILDINGS.windbreak!, roof.x, roof.y, 1);
    expect(isUnderRoof(windbreak, passer.x, passer.y)).toBe(true);
  });
  it('holds the starting warmth ladder and is the cheapest pre-tech covered roof', () => {
    expect(BUILDINGS.windbreak!.shelter).toBeLessThan(BUILDINGS.lean_to!.shelter);
    expect(BUILDINGS.lean_to!.shelter).toBeLessThan(BUILDINGS.mud_hut!.shelter);
    const covered = Object.values(BUILDINGS).filter(def =>
      def.requiresTech === null && def.places !== undefined && (def.roofed || def.interior));
    const cheapest = covered.sort((a, b) => a.workTicks - b.workTicks)[0];
    expect(cheapest?.id).toBe('lean_to');
  });
});
