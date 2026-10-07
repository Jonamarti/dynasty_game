import { describe, expect, it } from 'vitest';
import {
  PeopleWorld, densityOf, gridFromGeography, regionOfStart, STARTING_TECHS, type PeopleWorldOptions,
} from '../world/PeopleWorld.ts';
import { legacyIslandGeography, randomWorldGeography } from '../world/WorldGeography.ts';
import { closeUnderRequires, populationOf } from '../world/PeopleSim.ts';
import { DEFAULT_NORMS, VARIABLE_NORMS } from '../social/Events.ts';
import { KnowledgeLedger } from '../world/PeopleKnowledge.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const geography = (seed: string) => randomWorldGeography(seed, { regionsWide: 24, regionsHigh: 12 });
const gameOptions = (reserved: ReadonlySet<number> = new Set()): PeopleWorldOptions => ({ game: true, trackEvents: false, reserved });

describe('seeding the world with peoples in the game (phase 33a)', () => {
  it('the classic island has no map, so nobody lives beyond it', () => {
    expect(gridFromGeography(legacyIslandGeography())).toBeNull();
  });

  it('seeds every habitable region of a generated map, and only those', () => {
    const grid = gridFromGeography(geography('pg-1'))!;
    expect(grid.regions.length).toBeGreaterThan(20);
    const w = new PeopleWorld(grid, 'pg-1', gameOptions());
    const habitable = new Set(grid.regions.map(r => r.id));
    const seeded = new Set<number>();
    for (const p of w.sim.peoples.values()) {
      expect(habitable.has(w.regionOfPeople.get(p.id)!)).toBe(true);
      seeded.add(w.regionOfPeople.get(p.id)!);
    }
    expect(seeded.size).toBe(habitable.size);
  });

  it('nobody is handed a technique: every people starts with the one kit', () => {
    const w = new PeopleWorld(gridFromGeography(geography('pg-2'))!, 'pg-2', gameOptions());
    const kit = new Set(closeUnderRequires(STARTING_TECHS));
    for (const p of w.sim.peoples.values()) expect(new Set(p.techs.list())).toEqual(kit);
  });

  it('density follows what a region feeds: a poor region holds fewer people than a rich one', () => {
    const poor = densityOf(0.3), rich = densityOf(1.3);
    expect(poor.founders[1]).toBeLessThan(rich.founders[1]);
    expect(poor.founders[0]).toBeLessThan(rich.founders[0]);
    expect(poor.peoples[1]).toBeLessThanOrEqual(rich.peoples[1]);
    const w = new PeopleWorld(gridFromGeography(geography('pg-3'))!, 'pg-3', gameOptions());
    for (const p of w.sim.peoples.values()) {
      const d = densityOf(w.regions.get(w.regionOfPeople.get(p.id)!)!.productivity);
      expect(populationOf(p)).toBeGreaterThanOrEqual(d.founders[0]);
      expect(populationOf(p)).toBeLessThanOrEqual(d.founders[1]);
    }
  });

  it('every people has a culture of its own, from the same bell curves as the detailed bands', () => {
    const w = new PeopleWorld(gridFromGeography(geography('pg-4'))!, 'pg-4', gameOptions());
    const peoples = [...w.sim.peoples.values()];
    expect(new Set(peoples.map(p => p.culture.strangerRegard)).size).toBeGreaterThan(peoples.length * 0.9);
    expect(new Set(peoples.map(p => p.culture.norms.theft)).size).toBeGreaterThan(peoples.length * 0.9);
    for (const p of peoples) {
      expect(p.culture.strangerRegard).toBeGreaterThanOrEqual(0.02);
      expect(p.culture.strangerRegard).toBeLessThanOrEqual(0.98);
      for (const v of VARIABLE_NORMS) {
        expect(p.culture.norms[v.type]).toBeGreaterThanOrEqual(v.min);
        expect(p.culture.norms[v.type]).toBeLessThanOrEqual(v.max);
      }
      // a norm no culture varies stays at the baseline
      expect(p.culture.norms.body_found).toBe(DEFAULT_NORMS.body_found);
    }
  });

  it("the player's own region belongs to the detailed level: nobody is seeded there and no daughter settles it", () => {
    const grid = gridFromGeography(geography('pg-5'))!;
    const home = grid.regions[Math.floor(grid.regions.length / 2)]!;
    const reserved = new Set([home.id]);
    const w = new PeopleWorld(grid, 'pg-5', gameOptions(reserved));
    for (const p of w.sim.peoples.values()) expect(w.regionOfPeople.get(p.id)).not.toBe(home.id);
    w.advanceYears(60);
    for (const p of w.sim.peoples.values()) expect(w.regionOfPeople.get(p.id)).not.toBe(home.id);
    expect(regionOfStart(grid, { x: home.x * grid.comarcasPerRegion + 3, y: home.y * grid.comarcasPerRegion + 3 })).toBe(home.id);
  });

  it('is a function of the seed, and the same however the years are cut', () => {
    const grid = gridFromGeography(geography('pg-6'))!;
    const run = (cuts: number[]) => { const w = new PeopleWorld(grid, 'pg-6', gameOptions()); for (const y of cuts) w.advanceYears(y); return w.sim.snapshot(); };
    expect(run([20])).toEqual(run([5, 15]));
    expect(run([20])).not.toEqual(new PeopleWorld(gridFromGeography(geography('pg-7'))!, 'pg-7', gameOptions()).sim.snapshot());
  });
});

describe('the record of a world of peoples', () => {
  it('a knowledge ledger comes back with its insights, its seen exposures and its queue', () => {
    const l = new KnowledgeLedger();
    l.addInsight(3, 'farming', 0.4); l.addInsight(3, 'pottery', 0.1); l.addInsight(1, 'weaving', 0.7);
    l.post({ id: 'a', peopleId: 3, tech: 'farming', how: 'witnessed', intensity: 0.5 });
    const back = KnowledgeLedger.fromSnapshot(wire(l.snapshot()));
    expect(back.snapshot()).toEqual(l.snapshot());
    expect(back.insight(3, 'farming')).toBe(0.4);
    expect(back.post({ id: 'a', peopleId: 3, tech: 'farming', how: 'witnessed', intensity: 0.5 })).toBe(false);
    expect(back.take(3)).toHaveLength(1);
  });

  it('save, load and advance equals not having saved (bit-identical)', () => {
    const grid = gridFromGeography(geography('pg-8'))!;
    const live = new PeopleWorld(grid, 'pg-8', gameOptions());
    live.advanceYears(40);
    const loaded = PeopleWorld.fromRecord(grid, wire(live.toRecord()), gameOptions());
    expect(wire(loaded.toRecord())).toEqual(wire(live.toRecord()));
    for (const years of [1, 10, 30]) {
      live.advanceYears(years); loaded.advanceYears(years);
      expect(wire(loaded.toRecord())).toEqual(wire(live.toRecord()));
    }
  });

  it('refuses a record whose people live somewhere the map does not have', () => {
    const grid = gridFromGeography(geography('pg-9'))!;
    const w = new PeopleWorld(grid, 'pg-9', gameOptions());
    const bad = wire(w.toRecord());
    bad.regionOfPeople[0]![1] = -5;
    expect(() => PeopleWorld.fromRecord(grid, bad, gameOptions())).toThrow(/region/);
  });
});
