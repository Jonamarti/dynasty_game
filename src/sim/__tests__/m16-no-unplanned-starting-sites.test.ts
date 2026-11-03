import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

const WORLD = {
  width: 64, height: 64, berryBushes: 80, flintOutcrops: 20,
  deadwood: 45, gameHerds: 6,
};

function fresh(seed: string, bands = 1): Simulation {
  return new Simulation({ seed, world: WORLD, population: { bands, peoplePerBand: 8 } });
}

/** Drive the genuine planning clock; this test never places a building. */
function firstBandPlan(sim: Simulation): void {
  for (let tick = 0; tick < sim.config.time.ticksPerDay * 4 && sim.buildings.length === 0; tick++) {
    sim.step();
  }
}

function siteSnapshot(sim: Simulation) {
  return sim.buildings.map(site => ({
    id: site.id, design: site.def.id, bandId: site.ownerBandId,
    sponsorId: site.sponsorId, playerPlaced: site.playerPlaced,
    plannedTick: site.plannedTick, progress: site.progress, complete: site.complete,
  }));
}

describe('m16-no-unplanned-starting-sites (#55)', () => {
  it('never imposes starter huts and stores on newly founded bands', () => {
    for (const seed of ['no-starter-sites-a', 'no-starter-sites-b', 'no-starter-sites-c']) {
      const sim = fresh(seed, 2);
      expect(sim.bands).toHaveLength(2);
      expect(sim.people.length).toBeGreaterThan(0);
      expect(sim.buildings).toHaveLength(0);
    }
  });

  it('the first site is a later band decision with a living actual proposer', () => {
    const sim = fresh('m16-band-builds-its-own-camp');
    expect(sim.buildings).toHaveLength(0);

    firstBandPlan(sim);

    const band = sim.bands[0]!;
    const sites = sim.buildings.filter(site => site.ownerBandId === band.id);
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(site.playerPlaced).toBe(false);
      expect(site.plannedTick).toBeGreaterThan(0);
      expect(site.sponsorId).not.toBeNull();
      const proposer = sim.peopleById.get(site.sponsorId!);
      expect(proposer?.alive).toBe(true);
      expect(proposer?.isChild).toBe(false);
      expect(proposer?.bandId).toBe(band.id);
    }
  });

  it('preserves an autonomous proposal across same-build save/load and continuation', () => {
    const sim = fresh('m16-band-site-roundtrip');
    firstBandPlan(sim);
    expect(sim.buildings.length).toBeGreaterThan(0);

    const wire = JSON.parse(JSON.stringify(toCheckpointRecord(sim)));
    const restored = Simulation.fromCheckpointRecord(wire);
    expect(siteSnapshot(restored)).toEqual(siteSnapshot(sim));

    for (let tick = 0; tick < 20; tick++) {
      sim.step();
      restored.step();
    }
    expect(siteSnapshot(restored)).toEqual(siteSnapshot(sim));
  });
});
