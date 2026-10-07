import { describe, expect, it } from 'vitest';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { findGlobeStart } from '../world/WorldTerrain.ts';
import { WorldState } from '../world/WorldState.ts';
import { gridFromGeography, regionOfStart } from '../world/PeopleWorld.ts';

const SMALL = { population: { bands: 1, peoplePerBand: 6 }, world: { width: 96, height: 96 } };
function globe(seed: string, peoples?: boolean): WorldState {
  const geography = randomWorldGeography(seed, { regionsWide: 24, regionsHigh: 12 });
  const start = findGlobeStart(geography, 4)!;
  return new WorldState({ seed, ...SMALL }, { geography, start, comarcasWide: 4, comarcasHigh: 4, ...(peoples === undefined ? {} : { peoples }) });
}
const days = (state: WorldState, n: number) => {
  const per = state.current.config.time.ticksPerDay;
  for (let i = 0; i < n * per; i++) { state.current.step(); state.advancePeoples(); }
};

describe('a world with a map has peoples in the rest of it (phase 33a)', () => {
  it('the classic island has none', () => {
    expect(new WorldState({ seed: 'wsp-classic', population: { bands: 1, peoplePerBand: 4 } }).peoples).toBeNull();
  });

  it('a start with a map seeds every other habitable region, and holds the start region for the detailed level', () => {
    const state = globe('wsp-1');
    const peoples = state.peoples!;
    expect(peoples.sim.peoples.size).toBeGreaterThan(50);
    const grid = gridFromGeography(state.geography)!;
    const home = regionOfStart(grid, state.initialGeographicStart!.start);
    for (const p of peoples.sim.peoples.values()) expect(peoples.regionOfPeople.get(p.id)).not.toBe(home);
  });

  it('can be switched off', () => {
    expect(globe('wsp-2', false).peoples).toBeNull();
  });

  it('does not move anything in the detailed comarca: same people, same places, with or without the world', () => {
    const a = globe('wsp-3'), b = globe('wsp-3', false);
    const at = (s: WorldState) => s.current.people.map(p => [p.id, p.x, p.y, p.name]);
    expect(at(a)).toEqual(at(b));
    days(a, 3); days(b, 3);
    expect(at(a)).toEqual(at(b));
  });

  it('advances only forward and on the game clock: a season is 4 days of steps and the peoples have aged by then', () => {
    const state = globe('wsp-4');
    const before = JSON.stringify(state.peoples!.toRecord());
    days(state, 1);
    expect(state.peoples!.sim.currentStep).toBe(state.current.time.tick);
    days(state, state.current.config.time.daysPerSeason * 4);
    expect(JSON.stringify(state.peoples!.toRecord())).not.toBe(before);
  });
});
