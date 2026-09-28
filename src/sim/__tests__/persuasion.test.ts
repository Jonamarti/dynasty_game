import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { BUILDINGS, Building } from '../entities/Building.ts';
import { support } from '../social/Persuasion.ts';

const SMALL = {
  seed: 'project-persuasion',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 10 },
};

describe('project support', () => {
  it('combines regard, belonging, authority, need, loyalty, and project cost', () => {
    const sim = new Simulation(SMALL);
    const [sponsor, listener] = sim.livingPeople().filter(person => !person.isChild);
    const site = new Building(BUILDINGS.windbreak!, 2, 2, sponsor!.bandId);
    listener!.needs.cold = 100;
    listener!.traits.loyalty = 0.8;
    sim.relationships.edge(listener!.id, sponsor!.id).bias = 60;

    const value = support(listener!, sponsor!, site, {
      relationships: sim.relationships,
      chiefByBand: new Map([[sponsor!.bandId, sponsor!.id]]),
      authority: () => 0.4,
    });

    expect(value).toBeGreaterThan(0.5);
    expect(support(listener!, sponsor!, site, {
      relationships: sim.relationships,
      chiefByBand: new Map(),
      authority: () => 0,
    })).toBeLessThan(value);
  });

  it('does not treat an outsider as a possible backer', () => {
    const sim = new Simulation({ ...SMALL, population: { bands: 2, peoplePerBand: 8 } });
    const [sponsor] = sim.livingPeople().filter(person => !person.isChild);
    const outsider = sim.livingPeople().find(person => person.bandId !== sponsor!.bandId)!;
    const site = new Building(BUILDINGS.windbreak!, 2, 2, sponsor!.bandId);

    expect(support(outsider, sponsor!, site, {
      relationships: sim.relationships,
      chiefByBand: new Map(),
      authority: () => 1,
    })).toBe(-Infinity);
  });

  it('adds the listener to the named project after an accepted proposal', () => {
    const sim = new Simulation(SMALL);
    const sponsor = sim.livingPeople().find(person => !person.isChild)!;
    const listener = sim.livingPeople().find(person => !person.isChild && person.id !== sponsor.id)!;
    const site = sim.buildings.find(building => !building.complete && building.ownerBandId === sponsor.bandId)!;
    sim.possess(sponsor);
    site.sponsorId = sponsor.id;
    sponsor.x = listener.x + 1;
    sponsor.y = listener.y;
    listener.needs.cold = 100;
    sim.relationships.edge(listener.id, sponsor.id).bias = 100;
    expect(sim.order(sponsor, 'propose', { personId: listener.id, buildingId: site.id })).toBe(true);

    for (let i = 0; i < 100 && site.backers.length === 0; i++) sim.step();

    expect(site.backers).toContain(listener.id);
    expect(listener.chronicle.some(entry => entry.text.includes('agreed to help'))).toBe(true);
  });
});
