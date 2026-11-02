import { describe, expect, it } from 'vitest';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { isUnderRoof } from '../systems/LifeSystem.ts';
import { ActionSystem, shelterNeedsEntry } from '../systems/ActionSystem.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { telemetry } from '../core/Telemetry.ts';

describe('M16: shelter only warms people inside a covered roof', () => {
  it('must move beyond the outside wall of a mud hut before counting shelter', () => {
    const hut = new Building(BUILDINGS.mud_hut!, 20, 20, 1);
    hut.complete = true;
    const wall = { x: 20.5, y: 21.5 };
    const room = { x: hut.centerX, y: hut.centerY };

    // reachBuilding accepts the footprint, including its wall tiles.
    expect(hut.contains(wall.x, wall.y)).toBe(true);
    expect(isUnderRoof(hut, wall.x, wall.y)).toBe(false);
    expect(shelterNeedsEntry(hut, wall.x, wall.y)).toBe(true);

    expect(isUnderRoof(hut, room.x, room.y)).toBe(true);
    expect(shelterNeedsEntry(hut, room.x, room.y)).toBe(false);
  });

  it('does not count sheltered ticks until the person actually enters the room', () => {
    const hut = new Building(BUILDINGS.mud_hut!, 20, 20, 1);
    hut.complete = true;
    const person = new Person('Shelter seeker', 20.5, 21.5, 1, new RNG('shelter-entry'));
    person.needs.cold = 60;
    const people = new SpatialHash<Person>(8);
    people.insert(person);
    let travelCalls = 0;
    // Only the action's infrastructure is mocked: admission, room geometry,
    // targeting and the telemetry counter are all production code.
    const action = Object.assign(Object.create(ActionSystem.prototype), {
      reachBuilding: () => hut,
      travel: () => { travelCalls++; },
    }) as { doShelter: (person: Person, context: unknown) => void };
    const context = { peopleHash: people };
    telemetry.reset();
    telemetry.enable();
    try {
      action.doShelter(person, context);
      expect(travelCalls).toBe(1);
      expect(person.targetX).toBe(hut.centerX);
      expect(person.targetY).toBe(hut.centerY);
      expect(telemetry.get('sheltering')).toBe(0);

      person.x = hut.centerX;
      person.y = hut.centerY;
      action.doShelter(person, context);
      expect(travelCalls).toBe(1);
      expect(telemetry.get('sheltering')).toBe(1);
    } finally {
      telemetry.disable();
      telemetry.reset();
    }
  });

  it('also requires an actual roofed lean-to footprint before claiming shelter', () => {
    const lean = new Building(BUILDINGS.lean_to!, 20, 20, 1);
    lean.complete = true;
    expect(shelterNeedsEntry(lean, 19.5, 20.5)).toBe(true);
    expect(shelterNeedsEntry(lean, lean.centerX, lean.centerY)).toBe(false);
  });

  it('preserves the legacy windbreak proximity rule', () => {
    const windbreak = new Building(BUILDINGS.windbreak!, 20, 20, 1);
    windbreak.complete = true;
    expect(shelterNeedsEntry(windbreak, 19.5, 20.5)).toBe(false);
  });
});
