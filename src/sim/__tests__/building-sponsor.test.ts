import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

const SMALL = {
  seed: 'building-sponsors',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 10 },
};

describe('building sponsors', () => {
  it('gives each starter project a living adult from its band', () => {
    const sim = new Simulation(SMALL);
    const sites = sim.buildings.filter(building => !building.complete);

    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      const sponsor = site.sponsorId === null ? undefined : sim.peopleById.get(site.sponsorId);
      expect(sponsor?.alive).toBe(true);
      expect(sponsor?.isChild).toBe(false);
      expect(sponsor?.bandId).toBe(site.ownerBandId);
    }
  });

  it('makes the player the proponent of a site they place', () => {
    const sim = new Simulation(SMALL);
    const player = sim.livingPeople().find(person => !person.isChild)!;
    sim.possess(player);

    let site = null;
    for (let y = 2; y < sim.world.height - 2 && site === null; y++) {
      for (let x = 2; x < sim.world.width - 2 && site === null; x++) {
        site = sim.place('windbreak', x, y, player.bandId);
      }
    }

    expect(site).not.toBeNull();
    expect(site?.sponsorId).toBe(player.id);
    expect(site?.backers).toEqual([]);
  });
});
