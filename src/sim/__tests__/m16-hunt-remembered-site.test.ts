import { describe, expect, it } from 'vitest';
import { Brain, rememberedHerdSiteForUnknownQuarry } from '../ai/Brain.ts';
import { RNG } from '../core/RNG.ts';
import { telemetry } from '../core/Telemetry.ts';
import { Person } from '../entities/Person.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';

function hunter() {
  const person = new Person('Tracker', 10, 10, 1, new RNG('herd-tracking'));
  person.placeMemory = new PlaceMemory(128, 128);
  person.placeMemory.remember('herd:deer', 40, 40, 0, 2);
  return person;
}

describe('M16: a remembered herd site is not omniscient prey knowledge', () => {
  it('redirects an unseen different species to the remembered location, not its live coordinates', () => {
    const person = hunter();
    const quarry = { id: 456, species: 'boar' as const, x: 40.5, y: 40.5 };
    expect(rememberedHerdSiteForUnknownQuarry(person, quarry, 6)).toEqual({ x: 40, y: 40 });

    const brain = new Brain() as unknown as {
      setupKnowledgeSafe: (person: Person, action: string, ctx: unknown, found: unknown) => string;
    };
    const found = { quarry, explorePoint: null, kinDefence: null };
    telemetry.reset(); telemetry.enable();
    try {
      const action = brain.setupKnowledgeSafe(person, 'hunt', { sightRadius: 6 }, found);
      expect(action).toBe('explore');
      expect(person.action).toBe('explore');
      expect(person.targetAnimalId).toBeNull();
      expect(person.targetX).toBe(40);
      expect(person.targetY).toBe(40);
      expect(telemetry.get('hunt_track_remembered_site')).toBe(1);
    } finally { telemetry.disable(); telemetry.reset(); }
  });

  it('keeps visible and correctly remembered species as ordinary hunts', () => {
    const person = hunter();
    const quarry = { species: 'boar' as const, x: 40.5, y: 40.5 };
    expect(rememberedHerdSiteForUnknownQuarry(person, quarry, 6)).toEqual({ x: 40, y: 40 });
    person.placeMemory.remember('herd:boar', 40.5, 40.5, 0, 2);
    expect(rememberedHerdSiteForUnknownQuarry(person, quarry, 6)).toBeNull();
    person.placeMemory = new PlaceMemory(128, 128);
    person.x = 39; person.y = 40;
    expect(rememberedHerdSiteForUnknownQuarry(person, quarry, 6)).toBeNull();
  });

  it('does not invent a tracking destination without a remembered herd', () => {
    const person = hunter();
    person.placeMemory = new PlaceMemory(128, 128);
    expect(rememberedHerdSiteForUnknownQuarry(person,
      { species: 'boar', x: 40, y: 40 }, 6)).toBeNull();
  });
});
