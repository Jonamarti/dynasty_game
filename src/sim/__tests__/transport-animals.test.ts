import { describe, expect, it } from 'vitest';
import { Animal } from '../entities/Animal.ts';
import { Simulation } from '../core/Simulation.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { makeConfig } from '../core/Config.ts';
import { capacityFor, itemCapacityFor } from '../core/Carry.ts';
import {
  claimTransportAnimal, hasPackAnimal, hasRidingHorse, refreshTransportLease,
  releaseTransportAnimal, transportOf,
} from '../core/TransportAnimals.ts';

function pair(species: 'donkey' | 'horse', tech: 'pack_animals' | 'horse_riding') {
  const person = new Person('Traveler', 4, 5, 0, new RNG(1));
  const animal = new Animal(species, 5, 5, 900, new RNG(2));
  const animals = new Map([[animal.id, animal]]);
  animal.tamedBy = person.id;
  person.knownTech.add(tech);
  return { person, animal, animals };
}

describe('transport animal ownership and carrying', () => {
  it('leases one live donkey reciprocally and adds its pack capacity outside human equipment', () => {
    const { person, animal, animals } = pair('donkey', 'pack_animals');
    const base = capacityFor(person, makeConfig().carry);
    expect(claimTransportAnimal(person, animal, 'pack', animals)).toBe(true);
    expect(transportOf(person, animals)).toMatchObject({ mode: 'pack', capacity: 24, speed: 1 });
    expect(hasPackAnimal(person, animals)).toBe(true);
    expect(hasRidingHorse(person, animals)).toBe(false);
    expect(person.transportCapacity).toBe(24);
    expect(capacityFor(person, makeConfig().carry)).toBe(base + 24);
    releaseTransportAnimal(person, animals);
    expect(person.transportCapacity).toBe(0);
    expect(animal.transportedBy).toBeNull();
    expect(capacityFor(person, makeConfig().carry)).toBe(base);
  });

  it('adds pack load to food and timber item limits', () => {
    const { person } = pair('donkey', 'pack_animals');
    const config = makeConfig().carry;
    const meat = itemCapacityFor(person, config, 'meat');
    const wood = itemCapacityFor(person, config, 'wood');
    person.transportCapacity = 24;
    expect(itemCapacityFor(person, config, 'meat')).toBe(meat + 24);
    expect(itemCapacityFor(person, config, 'wood')).toBe(wood + 24);
  });

  it('rejects a wild animal, an unlearned practice, and a species used for the wrong mode', () => {
    const wild = new Animal('donkey', 0, 0, 1, new RNG(3));
    const person = new Person('Traveler', 0, 0, 0, new RNG(4));
    const animals = new Map([[wild.id, wild]]);
    expect(claimTransportAnimal(person, wild, 'pack', animals)).toBe(false);
    wild.tamedBy = person.id;
    expect(claimTransportAnimal(person, wild, 'pack', animals)).toBe(false);
    person.knownTech.add('horse_riding');
    expect(claimTransportAnimal(person, wild, 'riding', animals)).toBe(false);
    expect(person.transportAnimalId).toBeNull();
    expect(wild.transportedBy).toBeNull();
  });

  it('invalidates either side of a lost, dead, or mismatched reciprocal lease', () => {
    const { person, animal, animals } = pair('horse', 'horse_riding');
    expect(claimTransportAnimal(person, animal, 'riding', animals)).toBe(true);
    expect(transportOf(person, animals)?.speed).toBe(1.5);
    animal.alive = false;
    expect(refreshTransportLease(person, animals)).toBe(false);
    expect(person.transportAnimalId).toBeNull();
    expect(person.transportMode).toBeNull();

    animal.alive = true;
    expect(claimTransportAnimal(person, animal, 'riding', animals)).toBe(true);
    animal.transportMode = 'pack';
    expect(transportOf(person, animals)).toBeNull();
    expect(refreshTransportLease(person, animals)).toBe(false);
    expect(animal.transportedBy).toBeNull();
  });

  it('does not let a second owner acquire an already leased individual', () => {
    const { person, animal, animals } = pair('donkey', 'pack_animals');
    const second = new Person('Other', 3, 5, 0, new RNG(5));
    second.knownTech.add('pack_animals');
    expect(claimTransportAnimal(person, animal, 'pack', animals)).toBe(true);
    expect(claimTransportAnimal(second, animal, 'pack', animals)).toBe(false);
    expect(animal.transportedBy).toBe(person.id);
  });
  it('leases a donkey automatically when a trained person completes taming', () => {
    const sim = new Simulation({ seed: 'transport-tame', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } });
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    person.knownTech.add('taming');
    person.knownTech.add('pack_animals');
    person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
    person.inventory.add('berries', 1);
    const donkey = new Animal('donkey', person.x, person.y, 9876, new RNG('tame'), sim.ids);
    donkey.fedBy.add(person.id);
    donkey.meals = 20;
    sim.animals.push(donkey);
    sim.animalsById.set(donkey.id, donkey);
    sim.animalHash.insert(donkey);
    expect(sim.order(person, 'tame', { animalId: donkey.id })).toBe(true);
    sim.step();
    expect(donkey.tamedBy).toBe(person.id);
    expect(person.transportAnimalId).toBe(donkey.id);
    expect(donkey.transportedBy).toBe(person.id);
    expect(transportOf(person, sim.animalsById)?.mode).toBe('pack');
  });

  it('moves a tamed transport animal at its owner’s heel and clears a dead lease', () => {
    const sim = new Simulation({ seed: 'transport-heel', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } });
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    person.knownTech.add('pack_animals');
    person.action = 'rest';
    const donkey = sim.animals.find(animal => animal.species === 'donkey')!;
    person.x = Math.max(4, Math.min(sim.world.width - 5, person.x));
    person.y = Math.max(4, Math.min(sim.world.height - 5, person.y));
    donkey.x = person.x + 8;
    donkey.y = person.y;
    donkey.tamedBy = person.id;
    donkey.fedBy.add(person.id);
    expect(claimTransportAnimal(person, donkey, 'pack', sim.animalsById)).toBe(true);
    sim.animals.forEach(animal => { if (animal !== donkey) animal.alive = false; });
    sim.peopleHash.clear();
    sim.peopleHash.insert(person);
    sim.animalHash.clear();
    sim.animalHash.insert(donkey);
    const wildlife = (sim as any).wildlifeSystem;
    const before = Math.hypot(donkey.x - person.x, donkey.y - person.y);
    for (let tick = 0; tick < 10; tick++) wildlife.update([donkey], { world: sim.world, rng: new RNG('heel'), tick: tick + (5 - donkey.id % 5), peopleHash: sim.peopleHash, peopleById: sim.peopleById, animalHash: sim.animalHash });
    expect(Math.hypot(donkey.x - person.x, donkey.y - person.y)).toBeLessThan(before);
    donkey.alive = false;
    sim.step();
    expect(person.transportAnimalId).toBeNull();
    expect(person.transportCapacity).toBe(0);
  });

  it('adds transport fauna without shifting pre-existing seeded entities', () => {
    const config = { seed: 'transport-spawn-contract', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } };
    const prototype = Simulation.prototype as any;
    const spawn = prototype.spawnTransportAnimals;
    let baseline: Simulation;
    let current: Simulation;
    try {
      prototype.spawnTransportAnimals = function () {};
      baseline = new Simulation(config);
    } finally {
      prototype.spawnTransportAnimals = spawn;
    }
    current = new Simulation(config);
    const establishedAnimals = (sim: Simulation) => sim.animals.filter(animal => animal.species !== 'donkey' && animal.species !== 'horse')
      .map(({ id, species, x, y, herdId }) => ({ id, species, x, y, herdId }));
    expect(establishedAnimals(current)).toEqual(establishedAnimals(baseline));
    expect(current.people.map(({ id, x, y }) => ({ id, x, y }))).toEqual(baseline.people.map(({ id, x, y }) => ({ id, x, y })));
    expect(current.nodes.map(({ id, x, y, kind }) => ({ id, x, y, kind }))).toEqual(baseline.nodes.map(({ id, x, y, kind }) => ({ id, x, y, kind })));
    expect(current.animals.some(animal => animal.species === 'donkey')).toBe(true);
    expect(current.animals.some(animal => animal.species === 'horse')).toBe(true);
    expect(current.animals.filter(animal => animal.species === 'donkey' || animal.species === 'horse')
      .every(animal => Number.isSafeInteger(animal.id) && animal.id > 0)).toBe(true);
  });

  it('claims an already tamed nearby donkey when its owner learns pack practice later', () => {
    const sim = new Simulation({ seed: 'transport-late-learning', population: { bands: 1, peoplePerBand: 4 } });
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    const donkey = sim.animals.find(animal => animal.species === 'donkey')!;
    person.action = 'rest';
    donkey.tamedBy = person.id;
    donkey.fedBy.add(person.id);
    donkey.x = person.x; donkey.y = person.y;
    sim['rebuildHashes']();
    sim.step();
    expect(person.transportAnimalId).toBeNull();
    person.knownTech.add('pack_animals');
    sim.step();
    expect(person.transportAnimalId).toBe(donkey.id);
    expect(donkey.transportedBy).toBe(person.id);
  });

  it('keeps a deliberate release clear across simulation ticks', () => {
    const sim = new Simulation({ seed: 'transport-release', population: { bands: 1, peoplePerBand: 4 } });
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    const donkey = sim.animals.find(animal => animal.species === 'donkey')!;
    person.knownTech.add('pack_animals');
    donkey.tamedBy = person.id;
    donkey.x = person.x; donkey.y = person.y;
    expect(sim.claimTransportAnimalFor(person.id, donkey.id, 'pack')).toBe(true);
    expect(sim.releaseTransportAnimalFor(person.id)).toBe(true);
    sim.step();
    expect(person.transportAnimalId).toBeNull();
    expect(donkey.transportedBy).toBeNull();
    expect(person.transportAutoClaim).toBe(false);
  });

  it('requires a person to stand beside the animal before claiming it', () => {
    const sim = new Simulation({ seed: 'transport-range', population: { bands: 1, peoplePerBand: 4 } });
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    const donkey = sim.animals.find(animal => animal.species === 'donkey')!;
    person.knownTech.add('pack_animals');
    donkey.tamedBy = person.id;
    person.x = 2; person.y = 2;
    donkey.x = 10; donkey.y = 2;
    expect(sim.claimTransportAnimalFor(person.id, donkey.id, 'pack')).toBe(false);
    expect(sim.lastRefusal).toBe('Come closer to the transport animal');
    expect(person.transportAnimalId).toBeNull();
    expect(donkey.transportedBy).toBeNull();
  });
});
