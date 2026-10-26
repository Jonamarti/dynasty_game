import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { BUILDINGS, Building } from '../entities/Building.ts';

const SMALL = {
  seed: 'm16-player-sites-not-dropped',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

function placeAwayFromPeople(sim: Simulation, sponsorId: number | null, playerPlaced = false): Building {
  const designs = Object.values(BUILDINGS)
    .filter(def => !def.furniture && !def.earthwork && !def.dig && def.requiresTech === null)
    .sort((a, b) => b.workTicks - a.workTicks);
  for (const def of designs) {
    for (let y = 3; y < sim.world.height - def.height - 3; y += 2) {
      for (let x = 3; x < sim.world.width - def.width - 3; x += 2) {
        if (sim.livingPeople().some(person => Math.hypot(person.x - x, person.y - y) < 12)) continue;
        const site = sim.place(def.id, x, y, sim.livingPeople()[0]!.bandId, sponsorId, playerPlaced);
        if (site) return site;
      }
    }
  }
  throw new Error('Could not place a construction site away from people');
}

function groundCount(sim: Simulation, item: string): number {
  return sim.piles.reduce((sum, pile) => sum + pile.contents.count(item), 0);
}

describe('m16-player-sites-not-dropped', () => {
  it('keeps a player-marked site through ten days and retires an untouched NPC site with its reason and materials', () => {
    const sim = new Simulation(SMALL);
    const player = sim.possessFirst()!;
    const playerSite = placeAwayFromPeople(sim, player.id, true);
    const npcSponsor = sim.livingPeople().find(person => person.id !== player.id)!;
    const npcSite = placeAwayFromPeople(sim, npcSponsor.id);
    npcSite.delivered.add('sticks', 3);
    const sticksBefore = groundCount(sim, 'sticks');
    const npcSiteId = npcSite.id;
    let sticksDeliveredBeforeRetirement = npcSite.delivered.count('sticks');

    for (let i = 0; i < sim.config.time.ticksPerDay * 10; i++) {
      sim.step();
      if (sim.buildings.some(site => site.id === npcSiteId)) {
        sticksDeliveredBeforeRetirement = npcSite.delivered.count('sticks');
      }
    }

    expect(playerSite.complete).toBe(false);
    expect(sim.buildings.some(site => site.id === playerSite.id)).toBe(true);
    expect(sim.buildings.some(site => site.id === npcSiteId)).toBe(false);
    const siteSticks = sim.piles.filter(pile => pile.x === Math.round(npcSite.centerX) &&
      pile.y === Math.round(npcSite.centerY)).reduce((sum, pile) => sum + pile.contents.count('sticks'), 0);
    expect(siteSticks).toBe(sticksDeliveredBeforeRetirement);
    expect(groundCount(sim, 'sticks')).toBeGreaterThanOrEqual(sticksBefore + 3);
    expect(npcSite.delivered.total).toBe(0);
    const notice = sim.insights.find(insight => insight.personId === npcSponsor.id && insight.text.includes('was shelved'));
    expect(notice).toMatchObject({ x: npcSite.centerX, y: npcSite.centerY, kind: 'setback' });
    expect(npcSponsor.chronicle.some(entry => entry.text === notice?.text)).toBe(true);
  });
});
