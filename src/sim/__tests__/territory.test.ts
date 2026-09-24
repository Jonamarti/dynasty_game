import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { MAP_CELL } from '../social/BandMaps.ts';

describe('marked territory', () => {
  it('claims camp cells only after a band knows marking', () => {
    const sim = new Simulation({
      seed: 'territory-claims',
      world: { width: 64, height: 64, berryBushes: 30, flintOutcrops: 8, deadwood: 12, gameHerds: 3 },
      population: { bands: 2, peoplePerBand: 4 },
    });
    const band = sim.bands[0]!;
    expect(band.claimedCells?.size ?? 0).toBe(0);
    for (const person of sim.livingPeople().filter(person => person.bandId === band.id)) {
      person.needs.hunger = 0;
      person.needs.thirst = 0;
      person.needs.cold = 0;
      person.needs.fatigue = 0;
      if (!person.isChild) person.knownTech.add('marking');
    }
    for (let i = 0; i < sim.config.time.ticksPerDay; i++) sim.step();
    const key = `${Math.floor(band.homeX / MAP_CELL)},${Math.floor(band.homeY / MAP_CELL)}`;
    expect(band.claimedCells?.has(key)).toBe(true);
    expect(band.claimedCells?.size).toBeGreaterThan(0);
  });

  it('records a trespass when a foreign gatherer is seen on a claimed cell', () => {
    const sim = new Simulation({
      seed: 'territory-trespass',
      world: { width: 64, height: 64, berryBushes: 30, flintOutcrops: 8, deadwood: 12, gameHerds: 3 },
      population: { bands: 2, peoplePerBand: 4 },
    });
    const intruder = sim.livingPeople().find(person => person.bandId === 0 && !person.isChild)!;
    const owner = sim.livingPeople().find(person => person.bandId === 1 && !person.isChild)!;
    const node = sim.nodes.find(candidate => !candidate.depleted)!;
    node.x = intruder.x + 0.5;
    node.y = intruder.y;
    owner.x = node.x;
    owner.y = node.y;
    sim.bands[1]!.claimedCells = new Set([
      `${Math.floor(node.x / MAP_CELL)},${Math.floor(node.y / MAP_CELL)}`,
    ]);
    intruder.needs.hunger = 0;
    intruder.needs.thirst = 0;
    intruder.needs.cold = 0;
    expect(sim.order(intruder, 'gather', { nodeId: node.id })).toBe(true);
    sim.step();
    expect(sim.social.recent.some(event => event.type === 'trespass' &&
      event.actorId === intruder.id && event.victimBandId === owner.bandId)).toBe(true);
  });

  it('grants a one-day pass in exchange for food when the neighbour is short', () => {
    const sim = new Simulation({
      seed: 'territory-permission',
      world: { width: 64, height: 64, berryBushes: 30, flintOutcrops: 8, deadwood: 12, gameHerds: 3 },
      population: { bands: 2, peoplePerBand: 4 },
    });
    const visitor = sim.livingPeople().find(person => person.bandId === 0 && !person.isChild)!;
    const owner = sim.livingPeople().find(person => person.bandId === 1 && !person.isChild)!;
    visitor.x = owner.x;
    visitor.y = owner.y;
    sim.bands[1]!.claimedCells = new Set([
      `${Math.floor(visitor.x / MAP_CELL)},${Math.floor(visitor.y / MAP_CELL)}`,
    ]);
    visitor.inventory.add('berries', 1);
    expect(sim.requestTerritoryPermission(visitor, owner)).toBe(true);
    expect(sim.hasTerritoryPermission(visitor, owner.bandId)).toBe(true);
    expect(visitor.inventory.count('berries')).toBe(0);
  });
});
