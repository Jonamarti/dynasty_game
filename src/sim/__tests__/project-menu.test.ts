import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { availableActions } from '../ai/ActionCatalog.ts';

const SMALL = {
  seed: 'project-menu',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 10 },
};

describe('player project menu', () => {
  it('offers one submenu entry per project the player sponsors', () => {
    const sim = new Simulation(SMALL);
    const player = sim.livingPeople().find(person => !person.isChild)!;
    sim.possess(player);
    const site = sim.buildings.find(building => !building.complete && building.ownerBandId === player.bandId)!;
    site.sponsorId = player.id;
    for (const building of sim.buildings) {
      if (building !== site && !building.complete && building.ownerBandId === player.bandId) {
        building.sponsorId = null;
      }
    }
    const other = sim.livingPeople().find(person => !person.isChild && person.id !== player.id)!;

    const actions = availableActions(player,
      { kind: 'person', x: other.x, y: other.y, person: other },
      { world: sim.world, nearWater: false, buildings: sim.buildings,
        backersWanted: 3, relationships: sim.relationships, tick: 0 });
    const help = actions.find(option => option.label === 'Ask for help with...');

    expect(help?.children).toHaveLength(1);
    expect(help?.children?.[0]).toMatchObject({ id: 'propose', buildingId: site.id, enabled: true });
  });
});
