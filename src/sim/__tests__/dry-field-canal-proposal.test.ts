import { describe, expect, it, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { Building, BUILDINGS, isStation } from '../entities/Building.ts';
import { earthworkTiles } from '../entities/Earthwork.ts';
import type { BandContext } from '../systems/BandSystem.ts';

function proposeCanal(fieldMoisture: number) {
  const sim = new Simulation({
    seed: 'dry-field-canal-proposal',
    world: { width: 48, height: 48, berryBushes: 30, flintOutcrops: 8, deadwood: 15, gameHerds: 3 },
    population: { bands: 1, peoplePerBand: 8 },
  });
  const band = sim.bands[0]!;
  const sponsor = sim.livingPeople().find(person => person.bandId === band.id && !person.isChild)!;
  sponsor.knownTech.clear();
  sponsor.knownTech.add('farming');
  sponsor.knownTech.add('earthworks');
  sponsor.knownTech.add('irrigation');
  sponsor.inventory.add('sticks', 1);
  sim.bandSystem.chiefByBand.set(band.id, sponsor.id);

  const field = new Building(BUILDINGS.field!, 20, 20, band.id, sim.ids);
  field.complete = true;
  field.sponsorId = sponsor.id;
  field.crop!.sow(0);
  const buildings = [
    new Building(BUILDINGS.longhouse!, 1, 1, band.id, sim.ids),
    new Building(BUILDINGS.storage_pit!, 12, 1, band.id, sim.ids),
    ...Object.values(BUILDINGS).filter(isStation)
      .map((def, index) => new Building(def, 1 + index * 3, 8, band.id, sim.ids)),
    field,
  ];
  for (const building of buildings) building.complete = true;
  sim.buildings.splice(0, sim.buildings.length, ...buildings);
  sim.buildingsById.clear();
  for (const building of buildings) sim.buildingsById.set(building.id, building);
  sim.world.moisture.fill(fieldMoisture);
  sim.buildingHash.rebuild(buildings);
  const freshShoreHash = new SpatialHash<{ x: number; y: number }>(8);
  const freshBank = { x: 21, y: 19 };
  freshShoreHash.insert(freshBank);
  vi.spyOn(sim.world, 'isFreshShore').mockImplementation((x, y) => x === freshBank.x && y === freshBank.y);
  vi.spyOn(sim.world, 'isShore').mockImplementation((x, y) => x === freshBank.x && y === freshBank.y);
  vi.spyOn(sim.world, 'isFreshWater').mockImplementation((x, y) => x === freshBank.x && y === freshBank.y - 1);
  vi.spyOn(sim.world, 'isWalkable').mockReturnValue(true);
  vi.spyOn(sim.world, 'isWater').mockImplementation((x, y) => x === freshBank.x && y === freshBank.y - 1);
  vi.spyOn(sim.world, 'heightAt').mockReturnValue(0);

  const placed: { id: string; x: number; y: number; sponsorId: number | null }[] = [];
  const plannerRng = new RNG('dry-field-canal-test');
  const range = vi.spyOn(plannerRng, 'range');
  const next = vi.spyOn(plannerRng, 'next');
  const ctx = {
    day: sim.time.day,
    rng: plannerRng,
    buildings,
    world: sim.world,
    buildingHash: sim.buildingHash,
    freshShoreHash,
    personById: (id: number) => sim.peopleById.get(id),
    abandonSite: () => undefined,
    place: (id: string, x: number, y: number, ownerBandId: number, sponsorId?: number | null) => {
      placed.push({ id, x, y, sponsorId: sponsorId ?? null });
      const def = BUILDINGS[id];
      if (!def) return null;
      if (buildings.some(existing => x < existing.x + existing.def.width && x + def.width > existing.x &&
          y < existing.y + existing.def.height && y + def.height > existing.y)) return null;
      const site = new Building(def, x, y, ownerBandId, sim.ids);
      site.sponsorId = sponsorId ?? null;
      if (def.earthwork) site.earth = earthworkTiles(def.earthwork, x, y, def.width, def.height, sim.world);
      buildings.push(site);
      sim.buildingHash.insert(site);
      return site;
    },
  } as unknown as BandContext;

  (sim.bandSystem as unknown as {
    planBuildings: (owner: typeof band, members: typeof sim.people, context: BandContext) => void;
  }).planBuildings(band, [sponsor], ctx);
  return { placed, sponsor, band, field, freshBank, buildings, sim,
    draws: range.mock.calls.length + next.mock.calls.length };
}

describe('autonomous canal proposal for a dry field (M15 phase 26e)', () => {
  it('connects freshwater to an actively growing class-zero field and names its sponsor', () => {
    const result = proposeCanal(0.2);
    const canal = result.placed.find(site => site.id === 'canal');

    expect(canal).toMatchObject({ x: result.freshBank.x, y: result.freshBank.y, sponsorId: result.sponsor.id });
    expect(Math.abs(result.field.y - result.freshBank.y)).toBe(1);
    expect(result.draws).toBe(0);

    // The generated earthwork enters the existing sponsor → proposal → backer
    // path, which the ordinary work scorer already reads.
    const site = result.buildings.find(building => building.def.id === 'canal')!;
    result.sim.buildingsById.set(site.id, site);
    const listener = result.sim.livingPeople().find(person =>
      person.bandId === result.band.id && !person.isChild && person.id !== result.sponsor.id)!;
    result.sim.possess(result.sponsor);
    result.sponsor.x = listener.x + 1;
    result.sponsor.y = listener.y;
    listener.needs.cold = 100;
    result.sim.relationships.edge(listener.id, result.sponsor.id).bias = 100;
    expect(result.sim.order(result.sponsor, 'propose', {
      personId: listener.id, buildingId: site.id,
    })).toBe(true);
    for (let i = 0; i < 100 && site.backers.length === 0; i++) result.sim.step();
    expect(site.backers).toContain(listener.id);
  });

  it('does not propose irrigation for a field outside the existing driest moisture class', () => {
    const result = proposeCanal(0.4);
    expect(result.placed.some(site => site.id === 'canal' || site.id === 'canal_ns')).toBe(false);
  });
});
