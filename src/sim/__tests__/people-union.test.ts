import { describe, expect, it } from 'vitest';
import { PeopleSim, closeUnderRequires, emptyCohorts, populationOf, type PeopleCohorts } from '../world/PeopleSim.ts';
import { uniting, unionFits, ASSIMILATION_SEASONS, ALLIANCE_STANDING, type UnionEvent } from '../world/PeopleUnion.ts';
import { splitting, ORGANISATION_CEILING } from '../world/PeopleSplit.ts';
import { KnowledgeLedger } from '../world/PeopleKnowledge.ts';
import { TECHS } from '../knowledge/Tech.ts';
import { readFileSync } from 'node:fs';

const CLOCK = { ticksPerDay: 24, daysPerSeason: 10 };
const SEASON = CLOCK.ticksPerDay * CLOCK.daysPerSeason;
function adults(n: number): PeopleCohorts {
  const c = emptyCohorts(); const per = Math.floor(n / 16);
  for (let b = 1; b <= 8; b++) { c.male[b] = per; c.female[b] = per; }
  return c;
}

describe('PeopleSim.absorb: one call owns every consequence', () => {
  function three() {
    const sim = new PeopleSim('uni-1', CLOCK);
    const host = sim.found({ cohorts: adults(64), comarcas: 2, techs: closeUnderRequires(['firemaking']), surplus: 100, culture: { strangerRegard: 0.2 } });
    const gone = sim.found({ cohorts: adults(32), comarcas: 1, techs: closeUnderRequires(['plant_lore', 'cordage']), surplus: 50, culture: { strangerRegard: 0.8 } });
    const third = sim.found({ cohorts: adults(48), comarcas: 1 });
    return { sim, host, gone, third };
  }
  it('adds people, comarcas and surplus, and unites the techniques without breaking a prerequisite', () => {
    const { sim, host, gone } = three();
    const pop = populationOf(host) + populationOf(gone);
    const techs = new Set([...host.techs.list(), ...gone.techs.list()]);
    expect(sim.absorb(gone.id, host.id).moved).toBe(populationOf(gone));
    expect(sim.peoples.has(gone.id)).toBe(false);
    expect(populationOf(host)).toBe(pop);
    expect(host.comarcas).toBe(3);
    expect(host.surplus).toBe(150);
    expect(new Set(host.techs.list())).toEqual(techs);
    for (const t of host.techs.list()) expect(host.techs.prerequisitesHeld(t)).toBe(true);
    // population-weighted mean of regard: (0.2*64 + 0.8*32) / 96
    expect(host.culture.strangerRegard).toBeCloseTo((0.2 * 64 + 0.8 * 32) / 96, 9);
  });
  it('moves the absorbed people\'s relations to the host, merging with one the host has, and leaves none dangling', () => {
    const { sim, host, gone, third } = three();
    sim.relation(host.id, gone.id).contact = 1;
    const g3 = sim.relation(gone.id, third.id); g3.contact = 0.9; g3.standing = 50; g3.stance = 'tributary'; g3.overlord = gone.id; g3.since = 5;
    sim.absorb(gone.id, host.id);
    for (const rel of sim.relations.values()) {
      expect(sim.peoples.has(rel.a) && sim.peoples.has(rel.b)).toBe(true);
      expect(rel.a).toBeLessThan(rel.b);
      expect(rel.a === gone.id || rel.b === gone.id).toBe(false);
    }
    const moved = sim.relation(host.id, third.id);
    expect(moved.contact).toBe(0.9);
    expect(moved.stance).toBe('tributary');
    expect(moved.overlord).toBe(host.id);
    expect(sim.relations.size).toBe(1);
  });
  it('refuses to absorb a people into itself or an unknown one, and the saved copy of the result is valid', () => {
    const { sim, host, gone } = three();
    expect(() => sim.absorb(host.id, host.id)).toThrow();
    expect(() => sim.absorb(99, host.id)).toThrow();
    sim.absorb(gone.id, host.id);
    expect(() => PeopleSim.fromSnapshot(JSON.parse(JSON.stringify(sim.snapshot())))).not.toThrow();
  });
});

describe('uniting', () => {
  function pair(opts: { a?: number; b?: number; stance?: 'tributary'; standing?: number; contact?: number; ageSeasons?: number; seed?: string; ledger?: KnowledgeLedger } = {}) {
    const events: UnionEvent[] = [];
    const sim = new PeopleSim(opts.seed ?? 'uni-2', CLOCK, [uniting({ ledger: opts.ledger }, e => events.push(e))]);
    const a = sim.found({ cohorts: adults(opts.a ?? 32), comarcas: 1 });
    const b = sim.found({ cohorts: adults(opts.b ?? 16), comarcas: 1 });
    const rel = sim.relation(a.id, b.id);
    rel.contact = opts.contact ?? 1; rel.standing = opts.standing ?? 0;
    if (opts.stance) { rel.stance = opts.stance; rel.overlord = a.id; rel.since = -(opts.ageSeasons ?? 0) * SEASON; }
    return { sim, a, b, rel, events };
  }
  const merged = (make: (k: number) => ReturnType<typeof pair>, seasons: number, streams = 30) => {
    let n = 0;
    for (let k = 0; k < streams; k++) { const w = make(k); w.sim.advanceTo(SEASON * seasons); if (w.sim.peoples.size === 1) n++; }
    return n;
  };

  it('absorbs a vassal into its overlord after a long tribute, not before, and not without contact', () => {
    const tributary = (k: number, age: number, contact = 1) => pair({ seed: `uni-t-${k}`, stance: 'tributary', ageSeasons: age, contact });
    expect(merged(k => tributary(k, 0), 10)).toBe(0);
    expect(merged(k => tributary(k, ASSIMILATION_SEASONS + 5), 60)).toBeGreaterThan(20);
    expect(merged(k => tributary(k, ASSIMILATION_SEASONS + 5, 0.2), 60)).toBe(0);
    const w = tributary(0, ASSIMILATION_SEASONS + 5); w.sim.advanceTo(SEASON * 80);
    expect(w.events[0]!.kind).toBe('assimilated');
    expect(w.events[0]!.hostId).toBe(w.a.id);
    expect(w.sim.peoples.size).toBe(1);
  });
  it('an alliance needs high standing and high contact, and the larger absorbs the smaller', () => {
    expect(merged(k => pair({ seed: `uni-a-${k}`, standing: ALLIANCE_STANDING }), 60)).toBeGreaterThan(20);
    expect(merged(k => pair({ seed: `uni-a-${k}`, standing: ALLIANCE_STANDING - 20 }), 60)).toBe(0);
    expect(merged(k => pair({ seed: `uni-a-${k}`, standing: ALLIANCE_STANDING, contact: 0.5 }), 60)).toBe(0);
    const w = pair({ a: 16, b: 32, standing: 100 }); w.sim.advanceTo(SEASON * 100);
    expect(w.events[0]!.hostId).toBe(w.b.id);
    expect(w.events[0]!.absorbedId).toBe(w.a.id);
  });
  it('is refused when the union would at once be over its organisation\'s ceiling (so a daughter does not rejoin its parent)', () => {
    const big = pair({ a: 32, b: 24, standing: 100 });
    expect(unionFits(big.a, big.b)).toBe(true);
    const over = pair({ a: 48, b: 32, standing: 100 });
    expect(populationOf(over.a) + populationOf(over.b)).toBeGreaterThan(ORGANISATION_CEILING.band);
    expect(unionFits(over.a, over.b)).toBe(false);
    expect(merged(() => pair({ a: 48, b: 32, standing: 100 }), 100, 10)).toBe(0);
  });
  it('a split followed by long friendship does not undo itself: parent and daughter stay two', () => {
    const merges: UnionEvent[] = [];
    const sim = new PeopleSim('uni-3', CLOCK, [splitting({ newGround: () => 1 }), uniting({}, e => merges.push(e))]);
    sim.found({ cohorts: adults(80), comarcas: 1 });
    sim.advanceTo(SEASON * 2);
    expect(sim.peoples.size).toBe(2);
    for (const rel of sim.relations.values()) { rel.standing = 100; rel.contact = 1; }
    sim.advanceTo(SEASON * 4 * 40);
    expect(sim.peoples.size).toBe(2);
    expect(merges).toEqual([]);
  });
  it('keeps the absorbed people\'s higher insight and is the same however the run is cut', () => {
    const ledger = new KnowledgeLedger();
    const w = pair({ standing: 100, ledger });
    ledger.addInsight(w.b.id, 'pottery', 0.6); ledger.addInsight(w.a.id, 'pottery', 0.2);
    w.sim.advanceTo(SEASON * 200);
    expect(w.sim.peoples.size).toBe(1);
    expect(ledger.insight(w.a.id, 'pottery')).toBeCloseTo(0.6, 9);
    const whole = pair({ seed: 'uni-cut', standing: 100 }); whole.sim.advanceTo(SEASON * 100);
    const cut = pair({ seed: 'uni-cut', standing: 100 }); for (let s = 1; s <= SEASON * 100; s += 131) cut.sim.advanceTo(s); cut.sim.advanceTo(SEASON * 100);
    expect(cut.sim.snapshot()).toEqual(whole.sim.snapshot());
  });
  it('names no technique and compares no id, step or season in its code', () => {
    const src = readFileSync(new URL('../world/PeopleUnion.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\bseason\s*[<>]|\bstep\s*[<>]/);
    for (const tech of TECHS) expect(src).not.toContain(`'${tech}'`);
  });
});
