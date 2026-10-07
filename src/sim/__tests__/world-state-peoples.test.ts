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

import { deserializeSave, peekSave, serializeSave, SaveError } from '../persistence/SaveFile.ts';

describe('saving the whole game (phase 33c)', () => {
  // The detailed comarca and the world of peoples are compared as one record, through JSON, as a save file would be. Every part is
  // compared exactly except the world-object graph, which is compared by content with each shared object written out where it
  // is used: after a load some objects that were one object are two equal ones (see docs/bugs.md, "the loader does not restore
  // sharing"), and the graph's node numbering moves with that although nothing in it differs.
  type Graph = { root: unknown; nodes: { kind: string; prototype?: string; fields?: [string, unknown][]; values?: unknown[]; entries?: [unknown, unknown][] }[] };
  function expand(g: Graph): string {
    const memo = new Map<number, string>(), open = new Set<number>();
    const val = (v: unknown): string => v && typeof v === 'object' && 'ref' in v ? node((v as { ref: number }).ref) : JSON.stringify(v);
    const node = (i: number): string => {
      if (open.has(i)) return `{"cycle":${i}}`;
      const hit = memo.get(i); if (hit !== undefined) return hit;
      open.add(i);
      const n = g.nodes[i]!;
      const out = n.kind === 'object' ? `{${n.prototype}:` + n.fields!.map(([k, x]) => JSON.stringify(k) + '=' + val(x)).join(',') + '}'
        : n.kind === 'array' ? '[' + n.values!.map(val).join(',') + ']'
        : n.kind === 'map' ? 'M[' + n.entries!.map(([k, x]) => val(k) + '=>' + val(x)).join(',') + ']'
        : n.kind === 'set' ? 'S[' + n.values!.map(val).join(',') + ']' : JSON.stringify(n);
      open.delete(i); memo.set(i, out);
      return out;
    };
    return val(g.root);
  }
  const whole = (s: WorldState) => {
    const world = JSON.parse(serializeSave(s, 0)).world;
    world.simulation.objects.graph = expand(world.simulation.objects.graph);
    return JSON.stringify(world);
  };

  it('save, load, advance equals not having saved: comarca and peoples, bit for bit', () => {
    const live = globe('wsp-1');
    live.current.possessFirst();
    days(live, 4);
    const loaded = deserializeSave(serializeSave(live, 1234));
    expect(whole(loaded)).toBe(whole(live));
    expect(loaded.current.player?.id).toBe(live.current.player?.id);
    expect(loaded.peoples!.sim.peoples.size).toBe(live.peoples!.sim.peoples.size);
    // Across a season boundary, so the peoples' seasonal updates have run on the loaded side as well.
    for (const n of [1, 5, 20]) {
      days(live, n); days(loaded, n);
      expect(whole(loaded)).toBe(whole(live));
    }
  });

  it('the envelope says what the save is without loading it', () => {
    const state = globe('wsp-peek');
    days(state, 2);
    const summary = peekSave(serializeSave(state, 99));
    expect(summary).toMatchObject({ seed: 'wsp-peek', tick: state.current.time.tick, savedAt: 99, peoples: state.peoples!.sim.peoples.size });
    expect(summary.living).toBe(state.current.livingPeople().length);
  });

  it('saves a classic island too (no peoples) and loads it back', () => {
    const classic = new WorldState({ seed: 'wsp-classic-save', population: { bands: 1, peoplePerBand: 4 } });
    days(classic, 1);
    const loaded = deserializeSave(serializeSave(classic, 0));
    expect(loaded.peoples).toBeNull();
    expect(whole(loaded)).toBe(whole(classic));
  });

  it('refuses what is not a save, with a reason, and never half a world', () => {
    const text = serializeSave(globe('wsp-2'), 0);
    const reason = (t: string) => { try { deserializeSave(t); } catch (e) { return (e as SaveError).reason; } return 'loaded'; };
    expect(reason('not json {')).toBe('not_json');
    expect(reason('{"hello":1}')).toBe('not_a_save');
    expect(reason(text.replace('"version":1', '"version":9'))).toBe('newer_version');
    const damaged = JSON.parse(text);
    damaged.world.peoples.regionOfPeople[0][1] = -7;
    expect(reason(JSON.stringify(damaged))).toBe('corrupt');
    const alien = JSON.parse(text);
    alien.world.simulation.config.seed = { not: 'a seed' };
    expect(reason(JSON.stringify(alien))).toBe('corrupt');
  });

  it('still reads a world record saved before the peoples existed (v1): it loads without them', () => {
    const state = globe('wsp-v1', false);
    const envelope = JSON.parse(serializeSave(state, 0));
    envelope.world.version = 1;
    delete envelope.world.peoples;
    const loaded = deserializeSave(JSON.stringify(envelope));
    expect(loaded.peoples).toBeNull();
  });
});
