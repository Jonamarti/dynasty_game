import { describe, expect, it } from 'vitest';
import { Animal } from '../entities/Animal.ts';
import { RNG } from '../core/RNG.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';
import { findRememberedHerdQuarry, rememberedHerdMatchesSpecies } from '../ai/HerdMemory.ts';

const origin = { x: 10, y: 10 };
function setup() {
  const memories = new PlaceMemory(128, 128);
  const animals = new SpatialHash<Animal>(8);
  const add = (species: Animal['species'], x: number, y: number) => {
    const animal = new Animal(species, x, y, 1, new RNG('herd-memory-fixture'));
    animals.insert(animal);
    return animal;
  };
  const search = (eligible: (x: number, y: number) => boolean = () => true) =>
    findRememberedHerdQuarry(memories, animals, origin, 35, eligible);
  return { memories, animals, add, search };
}

describe('M16: remembered herds identify only their observed species', () => {
  it('accepts a matching species record but never substitutes another species', () => {
    expect(rememberedHerdMatchesSpecies('herd:deer', 'deer')).toBe(true);
    expect(rememberedHerdMatchesSpecies('herd:boar', 'boar')).toBe(true);
    expect(rememberedHerdMatchesSpecies('herd:hare', 'hare')).toBe(true);
    expect(rememberedHerdMatchesSpecies('herd:deer', 'boar')).toBe(false);
    expect(rememberedHerdMatchesSpecies('herd:hare', 'deer')).toBe(false);
    expect(rememberedHerdMatchesSpecies('water', 'deer')).toBe(false);
  });

  it('skips an empty nearby remembered herd and hunts a known living herd farther away', () => {
    const { memories, add, search } = setup();
    memories.remember('herd:deer', 13, 10, 1, 2);
    memories.remember('herd:boar', 26, 10, 1, 2);
    const boar = add('boar', 26, 10);
    expect(search()).toBe(boar);
  });

  it('never discovers an unseen different species at a remembered position', () => {
    const { memories, add, search } = setup();
    memories.remember('herd:deer', 13, 10, 1, 2);
    add('boar', 13, 10);
    expect(search()).toBeNull();
  });

  it('skips incompatible, dead, unreachable and out-of-range prey', () => {
    const { memories, add, search } = setup();
    memories.remember('herd:deer', 13, 10, 1, 2);
    const dead = add('deer', 13, 10);
    dead.alive = false;
    memories.remember('herd:hare', 25, 10, 1, 2);
    const unreachable = add('hare', 25, 10);
    memories.remember('herd:boar', 60, 10, 1, 2);
    add('boar', 60, 10);
    expect(search((x) => x < 20)).toBeNull();
    expect(search()).toBe(unreachable);
  });
});
