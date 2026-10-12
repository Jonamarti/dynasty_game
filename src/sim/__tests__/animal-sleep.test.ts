import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { RNG } from '../core/RNG.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { World } from '../core/World.ts';
import { Animal } from '../entities/Animal.ts';
import { Person } from '../entities/Person.ts';
import { WildlifeSystem } from '../systems/WildlifeSystem.ts';

function fixture(species: 'deer' | 'wolf' = 'deer') {
  const rng = new RNG('animal-sleep');
  const ids = new IdSpace();
  const world = new World({ ...DEFAULT_CONFIG.world, width: 32, height: 32 }, rng);
  world.walkable.fill(1);
  world.grass.fill(1);
  world.grassCap.fill(1);
  const animal = new Animal(species, 16.5, 16.5, 1, rng, ids);
  const peopleHash = new SpatialHash<Person>();
  const animals = [animal];
  return { rng, ids, world, animal, animals, peopleHash, wildlife: new WildlifeSystem() };
}

function update(f: ReturnType<typeof fixture>, opts: {
  night?: boolean; growth?: number; tick?: number; people?: Person[]; peopleById?: Map<number, Person>;
} = {}): void {
  f.peopleHash.rebuild(opts.people ?? []);
  f.wildlife.update(f.animals, {
    world: f.world, rng: f.rng, tick: opts.tick ?? 4,
    peopleHash: f.peopleHash, isNight: opts.night ?? true,
    dailyGrowth: opts.growth ?? 1, peopleById: opts.peopleById,
  });
}

describe('animal night rest', () => {
  it('puts a calm, fed herbivore to sleep without drawing randomness', () => {
    const f = fixture();
    const before = f.rng.getState();
    update(f);
    expect(f.animal.sleeping).toBe(true);
    expect(f.rng.getState()).toEqual(before);
  });

  it('keeps herbivores active in daylight, winter pressure, or hunger', () => {
    const f = fixture();
    update(f, { night: false });
    expect(f.animal.sleeping).toBe(false);
    update(f, { growth: 0.1 });
    expect(f.animal.sleeping).toBe(false);
    f.animal.fed = 0.2;
    update(f);
    expect(f.animal.sleeping).toBe(false);
  });

  it('leaves predators active and wakes a prey animal for a nearby person', () => {
    const wolf = fixture('wolf');
    update(wolf);
    expect(wolf.animal.sleeping).toBe(false);

    const f = fixture();
    const person = new Person('Mira', 17, 16.5, 1, new RNG('animal-sleep-person'), 200, f.ids);
    update(f, { people: [person], peopleById: new Map([[person.id, person]]) });
    expect(f.animal.sleeping).toBe(false);
    expect(f.animal.alarmedUntil).toBeGreaterThan(4);
  });

  it('keeps an animal following its tamer awake', () => {
    const f = fixture();
    const owner = new Person('Mira', 16.5, 16.5, 1, new RNG('animal-sleep-owner'), 200, f.ids);
    f.animal.tamedBy = owner.id;
    update(f, { people: [owner], peopleById: new Map([[owner.id, owner]]) });
    expect(f.animal.sleeping).toBe(false);
  });
});
