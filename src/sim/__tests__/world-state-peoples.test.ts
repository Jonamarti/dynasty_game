import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { TREES } from '../entities/Tree.ts';
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
  type Graph = { root: unknown; nodes: { kind: string; prototype?: string; type?: string; fields?: [string, unknown][]; values?: unknown[]; entries?: [unknown, unknown][] }[] };
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

  /**
   * Compare a snapshot's graph by its references, not by its incidental node
   * numbering. Report the FIRST path where a previously shared object is split
   * (or where separate live objects have been merged on load).
   *
   * Diagnostic only: this must not rewrite graph IDs, snapshot baselines, or
   * make the existing it.fails regression silently pass.
   */
  function firstGraphDifference(live: Graph, loaded: Graph): string | null {
    const liveOwners = new Map<number, { id: number; path: string }>();
    const loadedOwners = new Map<number, { id: number; path: string }>();
    type Pair = { left: unknown; right: unknown; path: string };
    const pairs: Pair[] = [{ left: live.root, right: loaded.root, path: 'objects' }];
    const ref = (value: unknown): number | null => {
      if (value === null || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'ref')) return null;
      const id = (value as { ref: unknown }).ref;
      return typeof id === 'number' && Number.isSafeInteger(id) && id >= 0 ? id : null;
    };
    const show = (value: unknown) => (JSON.stringify(value) ?? String(value)).slice(0, 100);
    while (pairs.length) {
      const { left, right, path } = pairs.pop()!;
      const a = ref(left), b = ref(right);
      if ((a === null) !== (b === null)) return `${path}: reference vs literal (${show(left)} / ${show(right)})`;
      if (a === null || b === null) {
        if (JSON.stringify(left) !== JSON.stringify(right)) return `${path}: value ${show(left)} vs ${show(right)}`;
        continue;
      }
      const oldA = liveOwners.get(a), oldB = loadedOwners.get(b);
      if (oldA && oldA.id !== b) return `${path}: live node ${a} first seen at ${oldA.path}, but loaded split it between nodes ${oldA.id} and ${b}`;
      if (oldB && oldB.id !== a) return `${path}: loaded node ${b} first seen at ${oldB.path}, but live split it between nodes ${oldB.id} and ${a}`;
      if (oldA || oldB) continue;
      liveOwners.set(a, { id: b, path });
      loadedOwners.set(b, { id: a, path });
      const x = live.nodes[a], y = loaded.nodes[b];
      if (!x || !y || x.kind !== y.kind || x.prototype !== y.prototype || x.type !== y.type) {
        return `${path}: incompatible nodes ${a}/${b} (${x?.kind ?? 'missing'} / ${y?.kind ?? 'missing'})`;
      }
      const children: Pair[] = [];
      if (x.kind === 'object') {
        const lf = x.fields ?? [], rf = y.fields ?? [];
        if (lf.length !== rf.length) return `${path}: ${lf.length} vs ${rf.length} fields`;
        for (let i = 0; i < lf.length; i++) {
          const aField = lf[i]!, bField = rf[i]!;
          if (aField[0] !== bField[0]) return `${path}: field name/order differs at ${i}: ${aField[0]} / ${bField[0]}`;
          children.push({ left: aField[1], right: bField[1], path: `${path}.${aField[0]}` });
        }
      } else if (x.kind === 'array' || x.kind === 'set' || x.kind === 'typed') {
        const lv = x.values ?? [], rv = y.values ?? [];
        if (lv.length !== rv.length) return `${path}: ${lv.length} vs ${rv.length} values`;
        for (let i = 0; i < lv.length; i++) children.push({ left: lv[i], right: rv[i], path: `${path}[${i}]` });
      } else if (x.kind === 'map') {
        const le = x.entries ?? [], re = y.entries ?? [];
        if (le.length !== re.length) return `${path}: ${le.length} vs ${re.length} entries`;
        for (let i = 0; i < le.length; i++) {
          const ae = le[i]!, be = re[i]!;
          children.push({ left: ae[0], right: be[0], path: `${path}.entry[${i}].key` });
          children.push({ left: ae[1], right: be[1], path: `${path}.entry[${i}].value` });
        }
      }
      // Reverse-push preserves natural field / array order in the reported path.
      for (let i = children.length - 1; i >= 0; i--) pairs.push(children[i]!);
    }
    return null;
  }

  it('M16 E5 graph comparer reports split aliases but accepts renumbered nodes', () => {
    const shared: Graph = { root: { ref: 0 }, nodes: [
      { kind: 'array', values: [{ ref: 1 }, { ref: 1 }] },
      { kind: 'object', prototype: 'Object', fields: [['value', 9]] },
    ] };
    const renumbered: Graph = { root: { ref: 1 }, nodes: [
      { kind: 'object', prototype: 'Object', fields: [['value', 9]] },
      { kind: 'array', values: [{ ref: 0 }, { ref: 0 }] },
    ] };
    const split: Graph = { root: { ref: 0 }, nodes: [
      { kind: 'array', values: [{ ref: 1 }, { ref: 2 }] },
      { kind: 'object', prototype: 'Object', fields: [['value', 9]] },
      { kind: 'object', prototype: 'Object', fields: [['value', 9]] },
    ] };
    expect(firstGraphDifference(shared, renumbered)).toBeNull();
    expect(firstGraphDifference(shared, split)).toContain('loaded split');
    expect(firstGraphDifference(split, shared)).toContain('live split');
  });

  const whole = (s: WorldState) => {
    const world = JSON.parse(serializeSave(s, 0)).world;
    world.simulation.objects.graph = expand(world.simulation.objects.graph);
    return JSON.stringify(world);
  };

  it('m16-load-rebinds-tree-species: a loaded tree and a new seedling share the same definition', () => {
    const world = globe('wsp-1');
    const loaded = deserializeSave(serializeSave(world, 1));
    for (const tree of loaded.current.trees) {
      expect(tree.def).toBe(TREES[tree.def.species]);
    }
  });

  it.fails('m16-load-keeps-sharing: save, load, and advance preserves the exact object graph', () => {
    const live = globe('wsp-1');
    live.current.possessFirst();
    days(live, 4);
    const loaded = deserializeSave(serializeSave(live, 1234));
    const graph = (world: WorldState): Graph => JSON.parse(serializeSave(world, 0)).world.simulation.objects.graph;
    let first = firstGraphDifference(graph(live), graph(loaded));
    if (first) console.info('[M16 E5] divergence immediately after loading: ' + first);
    const checkpoints = new Set([1, 2, 4, 8, 12, 16, 20]);
    for (let day = 1; day <= 20; day++) {
      days(live, 1);
      days(loaded, 1);
      if (!first && checkpoints.has(day)) {
        const difference = firstGraphDifference(graph(live), graph(loaded));
        if (difference) {
          first = difference;
          console.info('[M16 E5] first detected on or before day ' + day + ': ' + difference);
        }
      }
    }
    if (!first) console.info('[M16 E5] no alias/content differences at sampled checkpoints; checking raw graph');
    const liveGraph = graph(live);
    const loadedGraph = JSON.parse(serializeSave(loaded, 0)).world.simulation.objects.graph;
    expect(loadedGraph.nodes.length).toBe(liveGraph.nodes.length);
    const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    expect(hash(loadedGraph)).toBe(hash(liveGraph));
  });

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
    const newer = JSON.parse(text);
    newer.version = 9;
    expect(reason(JSON.stringify(newer))).toBe('newer_version');
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
    delete envelope.world.tileLedger;
    // v1 predates both the comarca book and the frontier envelope.
    delete envelope.world.frontier;
    delete envelope.world.traffic;
    const loaded = deserializeSave(JSON.stringify(envelope));
    expect(loaded.peoples).toBeNull();
  });
});
