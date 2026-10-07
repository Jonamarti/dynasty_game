import { describe, expect, it } from 'vitest';
import { PeopleWorld, STARTING_TECHS, isWorldHabitable, foundingCohorts, REGION_GROUND, STEPS_PER_SEASON } from '../../../tools/people-world-model.ts';
import { populationOf, closeUnderRequires } from '../world/PeopleSim.ts';
import { TECHS, TECH } from '../knowledge/Tech.ts';
import type { WorldRaster } from '../world/WorldBinary.ts';

function raster(): WorldRaster {
  return {
    width: 4, height: 3,
    elevationMeters: new Int16Array([100, 100, 100, 100, 100, -100, 100, 100, 100, 100, 100, 100]),
    koppen: new Uint8Array([1, 28, 29, 0, 2, 2, 30, 8, 3, 17, 28, 29]),
    seaLevelMeters: 0,
  };
}

describe('the world of peoples (tool-side seeding for the 32c gates and the bench)', () => {
  it('seeds only habitable land, every people with the same starting kit and a region', () => {
    expect(isWorldHabitable(true, 1)).toBe(true);
    expect(isWorldHabitable(true, 29)).toBe(false);
    expect(isWorldHabitable(true, 0)).toBe(false);
    expect(isWorldHabitable(false, 1)).toBe(false);
    const w = new PeopleWorld(raster(), 'pw-1');
    // 8 habitable cells: classes 1, 28, 2, 2, 8, 3, 17, 28 on land (the cell at index 5 is sea)
    expect(w.regions.size).toBe(7);
    expect(w.sim.peoples.size).toBeGreaterThanOrEqual(7);
    const kit = closeUnderRequires(STARTING_TECHS);
    for (const p of w.sim.peoples.values()) {
      expect(p.techs.list()).toEqual(TECHS.filter(t => kit.includes(t)));
      expect(w.regions.has(w.regionOfPeople.get(p.id)!)).toBe(true);
      expect(populationOf(p)).toBeGreaterThanOrEqual(24);
      expect(populationOf(p)).toBeLessThanOrEqual(48);
    }
  });

  it('founding cohorts sum to exactly the founders asked for', () => {
    for (const n of [24, 31, 48]) expect(populationOf({ cohorts: foundingCohorts(n) })).toBe(n);
  });

  it('is a function of the seed, and the same however the years are cut', () => {
    const run = (seed: string, cuts: number[]) => { const w = new PeopleWorld(raster(), seed); for (const y of cuts) w.advanceYears(y); return w.sim.snapshot(); };
    const a = run('pw-2', [6]);
    expect(run('pw-2', [1, 2, 3])).toEqual(a);
    expect(run('pw-3', [6])).not.toEqual(a);
  });

  it('keeps every invariant over decades: relations point at living peoples, techniques have their prerequisites, ground is bounded', () => {
    const w = new PeopleWorld(raster(), 'pw-4');
    w.advanceYears(60);
    const sim = w.sim;
    for (const rel of sim.relations.values()) {
      expect(sim.peoples.has(rel.a) && sim.peoples.has(rel.b)).toBe(true);
      expect(rel.a).toBeLessThan(rel.b);
      if (rel.stance === 'tributary') expect([rel.a, rel.b]).toContain(rel.overlord);
    }
    for (const p of sim.peoples.values()) {
      expect(Number.isInteger(populationOf(p))).toBe(true);
      for (const t of p.techs.list()) for (const r of TECH[t].requires) expect(p.techs.has(r)).toBe(true);
      expect(p.surplus).toBeGreaterThanOrEqual(0);
      expect(w.regionOfPeople.has(p.id)).toBe(true);
    }
    expect(w.sim.currentStep).toBe(60 * 4 * STEPS_PER_SEASON);
  });

  it('a daughter is only ever given ground the region has: without unions no region holds more than the ground or what its founders began with', () => {
    const w = new PeopleWorld(raster(), 'pw-6', { union: false });
    const held = () => { const m = new Map<number, number>(); for (const p of w.sim.peoples.values()) m.set(w.regionOfPeople.get(p.id)!, (m.get(w.regionOfPeople.get(p.id)!) ?? 0) + p.comarcas); return m; };
    const start = held();
    w.advanceYears(80);
    expect(w.splits).toBeGreaterThan(0);
    for (const [region, n] of held()) expect(n).toBeLessThanOrEqual(Math.max(REGION_GROUND, start.get(region) ?? 0));
  });

  it('nobody is handed farming by region: with no wild grain anywhere it is never invented in this world', () => {
    const w = new PeopleWorld(raster(), 'pw-5');
    w.advanceYears(60);
    expect(w.stats().farming.inventedInGrainRegion).toBe(0);
  });
});
