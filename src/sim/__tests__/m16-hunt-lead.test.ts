import { describe, expect, it, vi } from 'vitest';
import { Brain, type BrainContext } from '../ai/Brain.ts';
import { findHuntLead } from '../ai/HuntLead.ts';
import { Animal } from '../entities/Animal.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';

function fixture() {
  const person = new Person('Hunter', 10, 10, 1, new RNG('observed-hunt-lead'));
  person.placeMemory = new PlaceMemory(128, 128);
  const animals = new SpatialHash<Animal>(8);
  const add = (species: Animal['species'], x: number, y: number) => {
    const animal = new Animal(species, x, y, 1, new RNG('observed-hunt-prey'));
    animals.insert(animal);
    return animal;
  };
  const search = (canSearchAt: (x: number, y: number) => boolean = () => true, allow = true) =>
    findHuntLead(person, 5, animals, person.placeMemory, () => true, canSearchAt, allow);
  const select = (lead: ReturnType<typeof search>) => {
    const brain = new Brain() as unknown as {
      setup(person: Person, action: string, ctx: BrainContext, found: {
        quarry: Animal | null; rememberedHerd: { x: number; y: number; species: Animal['species'] } | null;
      }): void;
    };
    brain.setup(person, 'hunt', { time: { tick: 1 }, sightRadius: 5 } as BrainContext, {
      quarry: lead?.kind === 'visible' ? lead.animal : null,
      rememberedHerd: lead?.kind === 'remembered' ? lead.place : null,
    });
  };
  return { person, animals, add, search, select };
}

describe('M16: hunting from observed leads rather than hidden live animals', () => {
  it('gives visible prey priority and preserves ordinary hunting targets', () => {
    const f = fixture();
    f.person.placeMemory.remember('herd:deer', 20, 10, 1, 2);
    const hare = f.add('hare', 13, 10);
    const lead = f.search();
    expect(lead).toEqual({ kind: 'visible', animal: hare });
    f.select(lead);
    expect(f.person.action).toBe('hunt');
    expect(f.person.targetAnimalId).toBe(hare.id);
  });

  it('does not use the identity or exact coordinates of unseen animals of any species', () => {
    const f = fixture();
    f.person.placeMemory.remember('herd:deer', 20, 10, 1, 2);
    const find = vi.spyOn(f.animals, 'findNearest');
    const before = f.search();
    expect(before).toEqual({ kind: 'remembered', place: { x: 20, y: 10, species: 'deer' } });
    f.add('boar', 20.25, 10);
    f.add('deer', 20.5, 10);
    expect(f.search()).toEqual(before);
    expect(find).toHaveBeenCalledTimes(2);
    expect(find.mock.calls.every(([x, y, r]) => x === 10 && y === 10 && r === 5)).toBe(true);
    f.select(before);
    expect(f.person.action).toBe('explore');
    expect(f.person.targetAnimalId).toBeNull();
    expect([f.person.targetX, f.person.targetY]).toEqual([20, 10]);
  });

  it('does not investigate empty markers already in sight, predators, inaccessible or distant places', () => {
    const f = fixture();
    f.person.placeMemory.remember('herd:deer', 12, 10, 1, 2);
    f.person.placeMemory.remember('herd:wolf', 18, 10, 1, 2);
    f.person.placeMemory.remember('herd:hare', 20, 10, 1, 0);
    f.person.placeMemory.remember('herd:boar', 22, 10, 1, 2);
    f.person.placeMemory.remember('herd:deer', 40, 10, 1, 2);
    expect(f.search(x => x < 21)).toBeNull();
    expect(f.search()).toEqual({ kind: 'remembered', place: { x: 22, y: 10, species: 'boar' } });
    expect(f.search(() => true, false)).toBeNull();
  });

  it('uses the next remembered lead after observation forgets an empty one', () => {
    const f = fixture();
    f.person.placeMemory.remember('herd:deer', 18, 10, 1, 2);
    f.person.placeMemory.remember('herd:boar', 22, 10, 1, 2);
    expect(f.search()).toMatchObject({ kind: 'remembered', place: { species: 'deer' } });
    f.person.placeMemory.forget('herd:deer', 18, 10);
    expect(f.search()).toMatchObject({ kind: 'remembered', place: { species: 'boar' } });
  });
});
