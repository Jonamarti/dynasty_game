/**
 * M15 block IX: the State, as the band builds it. See `social/Polity.ts`.
 * One `describe` per node, in the order the nodes were added.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import type { Person } from '../entities/Person.ts';
import { TEMPLE_PULL, templeOf, templePull } from '../social/Polity.ts';
import { FEAST_MIN_FOOD, feastVenue, mayHostFeast } from '../social/Feast.ts';

const SMALL = {
  seed: 'polity-test',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6, startingTech: ['pottery', 'division_of_labour', 'chiefdom'] },
};

function granaryFor(sim: Simulation, bandId: number, x: number, y: number, def = BUILDINGS.granary!): Building {
  const building = new Building(def, x, y, bandId);
  building.complete = true;
  sim.buildings.push(building);
  sim.buildingsById.set(building.id, building);
  return building;
}

function learn(person: Person, tech: string): void {
  person.knownTech.add(tech as never);
}

describe('redistribution: the temple', () => {
  it('is the chief\'s granary only once the chief understands redistribution', () => {
    const sim = new Simulation(SMALL);
    const chief = sim.livingPeople()[0]!;
    const granary = granaryFor(sim, chief.bandId, 4, 4);
    granaryFor(sim, chief.bandId, 30, 30, BUILDINGS.storage_pit!);

    expect(templeOf(chief, chief.bandId, sim.buildings)).toBeNull();
    learn(chief, 'redistribution');
    expect(templeOf(chief, chief.bandId, sim.buildings)).toBe(granary);
    // Somebody else's band, or nobody: no temple.
    expect(templeOf(chief, chief.bandId + 1, sim.buildings)).toBeNull();
    expect(templeOf(null, chief.bandId, sim.buildings)).toBeNull();
  });

  it('is not a ruin or a building site', () => {
    const sim = new Simulation(SMALL);
    const chief = sim.livingPeople()[0]!;
    learn(chief, 'redistribution');
    const granary = granaryFor(sim, chief.bandId, 4, 4);
    granary.complete = false;
    expect(templeOf(chief, chief.bandId, sim.buildings)).toBeNull();
  });

  it('draws the loyal harder than the disaffected', () => {
    const sim = new Simulation(SMALL);
    const [chief, loyal, sour] = sim.livingPeople();
    learn(chief!, 'redistribution');
    loyal!.traits.loyalty = 0.9;
    sour!.traits.loyalty = 0.1;
    expect(templePull(loyal!, chief!)).toBeGreaterThan(templePull(sour!, chief!));
    expect(templePull(loyal!, chief!)).toBeLessThanOrEqual(TEMPLE_PULL * 1.25);
  });

  it('lets a chief who has worked it out feast the band from the temple, beer or no beer', () => {
    const sim = new Simulation(SMALL);
    const [chief, other] = sim.livingPeople();
    const temple = granaryFor(sim, chief!.bandId, 4, 4);
    temple.store.add('bread', FEAST_MIN_FOOD);

    expect(mayHostFeast(chief!, true, temple)).toBe(false);
    learn(chief!, 'redistribution');
    expect(mayHostFeast(chief!, true, temple)).toBe(true);
    expect(feastVenue(chief!, null, true, sim.buildings, sim.buildingsById, sim.time.day, temple)).toBe(temple);
    // The office, not the knowledge: a non-chief who knows it has no temple to give from.
    learn(other!, 'redistribution');
    expect(mayHostFeast(other!, false, temple)).toBe(false);
  });
});
