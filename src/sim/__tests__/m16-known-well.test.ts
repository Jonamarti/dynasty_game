import { describe, expect, it } from 'vitest';
import { Brain, type BrainContext } from '../ai/Brain.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';

/** Focus on one water-source choice without rolling any simulation seeds. */
function wellSearch() {
  const person = new Person('Well seeker', 12.5, 20.5, 1, new RNG('known-well'));
  person.placeMemory = new PlaceMemory(64, 64);
  const well = new Building(BUILDINGS.well!, 32, 20, 1);
  well.complete = true;
  const ctx = {
    world: { sameRegion: () => true, isFreshShore: () => false },
    shoreHash: new SpatialHash<{ x: number; y: number }>(8),
    buildings: [well],
    sightRadius: 5,
  } as unknown as BrainContext;
  const brain = new Brain();
  const find = () => (brain as unknown as {
    findWater: (person: Person, ctx: BrainContext) => { x: number; y: number } | null;
  }).findWater(person, ctx);
  return { person, well, find };
}

describe('M16: autonomous water discovery is situated', () => {
  it('does not target a remote well that was neither seen nor described', () => {
    const { person, well, find } = wellSearch();
    expect(person.distanceTo({ x: well.centerX, y: well.centerY })).toBeGreaterThan(5);
    expect(find()).toBeNull();
  });

  it('can walk to a previously seen well outside current sight', () => {
    const { person, well, find } = wellSearch();
    person.placeMemory.remember('building:well', well.centerX, well.centerY, 1, 2);
    expect(find()).toEqual({ x: well.centerX, y: well.centerY });
  });

  it('can choose a visible well without any earlier memory', () => {
    const { person, well, find } = wellSearch();
    person.x = well.centerX - 1;
    person.y = well.centerY;
    expect(find()).toEqual({ x: well.centerX, y: well.centerY });
  });

  it('never targets a ruined or unfinished well even when remembered', () => {
    const { person, well, find } = wellSearch();
    person.placeMemory.remember('building:well', well.centerX, well.centerY, 1, 2);
    well.complete = false;
    expect(find()).toBeNull();
    well.complete = true;
    well.ruined = true;
    expect(find()).toBeNull();
  });
});
