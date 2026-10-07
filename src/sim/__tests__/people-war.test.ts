import { describe, expect, it } from 'vitest';
import { PeopleSim, closeUnderRequires, emptyCohorts, populationOf, type PeopleCohorts } from '../world/PeopleSim.ts';
import {
  warring, fightersOf, strengthOf, RIVALRY, WAR_STANDING, ADVANTAGE_MIN, STRENGTH_PER_WEAPON, CONQUEST_RATIO, PEACE_STANDING, SUFFERED_INTENSITY,
  type WarEvent,
} from '../world/PeopleWar.ts';
import { KnowledgeLedger, traitsOf } from '../world/PeopleKnowledge.ts';
import { TECHS } from '../knowledge/Tech.ts';
import type { PeopleRegion } from '../world/PeopleCapacity.ts';
import { readFileSync } from 'node:fs';

const CLOCK = { ticksPerDay: 24, daysPerSeason: 10 };
const SEASON = CLOCK.ticksPerDay * CLOCK.daysPerSeason;
const flat = (r: number): PeopleRegion => ({ rationsPerComarcaDay: { spring: r, summer: r, autumn: r, winter: r } });
function adults(n: number): PeopleCohorts {
  const c = emptyCohorts(); const per = Math.floor(n / 16);
  for (let b = 1; b <= 8; b++) { c.male[b] = per; c.female[b] = per; }
  c.male[0] = 5; c.female[0] = 5; c.male[1] = 5; c.female[1] = 5;
  return c;
}
const WEAPONS = TECHS.filter(t => traitsOf(t).weapon);

function pair(opts: { standing?: number; contact?: number; a?: number; b?: number; region?: PeopleRegion; ledger?: KnowledgeLedger; techsA?: string[]; seed?: string } = {}) {
  const events: WarEvent[] = [];
  const sim = new PeopleSim(opts.seed ?? 'war-1', CLOCK, [warring({ regionOf: () => opts.region ?? flat(1e6), ledger: opts.ledger }, e => events.push(e))]);
  const a = sim.found({ cohorts: adults(opts.a ?? 96), comarcas: 1, techs: closeUnderRequires((opts.techsA ?? []) as never) });
  const b = sim.found({ cohorts: adults(opts.b ?? 96), comarcas: 1 });
  const rel = sim.relation(a.id, b.id); rel.contact = opts.contact ?? 1; rel.standing = opts.standing ?? 0;
  return { sim, a, b, rel, events };
}

describe('rivalry over food erodes standing', () => {
  it('only when a people is short, in proportion to contact and shortage', () => {
    const plenty = pair(); plenty.sim.advanceTo(SEASON * 4);
    expect(plenty.rel.standing).toBe(0);
    const short = pair({ region: flat(0.25) }); short.sim.advanceTo(SEASON * 2);
    expect(short.rel.standing).toBeLessThan(0);
    const none = pair({ region: flat(0.25), contact: 0 }); none.sim.advanceTo(SEASON * 4);
    expect(none.rel.standing).toBe(0);
    const half = pair({ region: flat(0.25), contact: 0.5 }); half.sim.advanceTo(SEASON * 2);
    expect(half.rel.standing / short.rel.standing).toBeGreaterThan(0.3);
    expect(half.rel.standing / short.rel.standing).toBeLessThan(0.7);
    // once per pair and season, not once per end: two seasons cost at most 2 x RIVALRY x contact x shortage
    expect(short.rel.standing).toBeGreaterThanOrEqual(-2 * RIVALRY - 1e-9);
  });
});

describe('declaring war', () => {
  const declared = (opts: Parameters<typeof pair>[0], seasons = 30, streams = 20) => {
    let n = 0;
    for (let k = 0; k < streams; k++) { const w = pair({ ...opts, seed: `war-d-${k}` }); w.sim.advanceTo(SEASON * seasons); if (w.events.some(e => e.kind === 'declared')) n++; }
    return n;
  };
  it('happens below the standing threshold and not above it (control)', () => {
    expect(declared({ standing: WAR_STANDING - 10 })).toBeGreaterThan(10);
    expect(declared({ standing: WAR_STANDING + 30 })).toBe(0);
    expect(declared({ standing: WAR_STANDING - 10, contact: 0 })).toBe(0);
  });
  it('is not started against a far stronger neighbour, and the weak one is not the declarer', () => {
    const w = pair({ standing: -80, a: 24, b: 480 });
    expect(strengthOf(w.a)).toBeLessThan(ADVANTAGE_MIN * strengthOf(w.b));
    w.sim.advanceTo(SEASON * 1);
    const d = w.events.filter(e => e.kind === 'declared');
    for (const e of d) expect(e.peopleId).toBe(w.b.id);
    expect(declared({ standing: -80, a: 24, b: 480 }, 3, 10)).toBeGreaterThan(0);
  });
  it('more weapons count as more strength, by trait and not by name', () => {
    const armed = pair({ techsA: [WEAPONS[0]!] });
    expect(strengthOf(armed.a)).toBeCloseTo(fightersOf(armed.a) * (1 + STRENGTH_PER_WEAPON * armed.a.techs.list().filter(t => traitsOf(t).weapon).length), 9);
    expect(strengthOf(armed.a)).toBeGreaterThan(strengthOf(armed.b));
  });
});

describe('a season of war', () => {
  it('is settled once per pair, costs fighting-age men only, and falls on both', () => {
    const w = pair({ standing: -90 });
    w.rel.stance = 'war'; w.rel.since = 0;
    const before = { a: structuredClone(w.a.cohorts), b: structuredClone(w.b.cohorts), pop: populationOf(w.a) + populationOf(w.b) };
    w.sim.advanceTo(SEASON - 1);
    const fights = w.events.filter(e => e.kind === 'fought');
    expect(fights.length).toBe(1);
    const lost = fights[0]!.lost!;
    expect(lost[0] + lost[1]).toBeGreaterThan(0);
    expect(populationOf(w.a) + populationOf(w.b)).toBe(before.pop - lost[0] - lost[1]);
    expect(w.a.cohorts.female).toEqual(before.a.female);
    expect(w.b.cohorts.female).toEqual(before.b.female);
    expect(w.a.cohorts.male[0]).toBe(before.a.male[0]);
    expect(w.a.cohorts.male[9]).toBe(before.a.male[9]);
    // still at war: standing fell; if the war ended this very season, peace lifted it to the post-war floor
    expect(w.rel.stance === 'war' ? w.rel.standing < -90 : w.rel.standing === PEACE_STANDING).toBe(true);
  });
  it('the weaker side loses the larger share of its men', () => {
    let lossWeak = 0, lossStrong = 0;
    for (let k = 0; k < 20; k++) {
      const w = pair({ a: 64, b: 192, seed: `war-l-${k}` }); w.rel.stance = 'war'; w.rel.since = 0;
      const a0 = fightersOf(w.a), b0 = fightersOf(w.b);
      w.sim.advanceTo(SEASON - 1);
      lossWeak += (a0 - fightersOf(w.a)) / a0; lossStrong += (b0 - fightersOf(w.b)) / b0;
    }
    expect(lossWeak).toBeGreaterThan(lossStrong * 1.5);
  });
  it('ends in peace in time, never while the war is young (tiredness grows with its length)', () => {
    let early = 0, late = 0;
    for (let k = 0; k < 20; k++) {
      const w = pair({ seed: `war-p-${k}`, region: flat(1e6) }); w.rel.stance = 'war'; w.rel.since = 0;
      w.sim.advanceTo(SEASON * 3);
      if ((w.rel.stance as string | null) !== 'war') early++;
      w.sim.advanceTo(SEASON * 60);
      if ((w.rel.stance as string | null) !== 'war') late++;
    }
    expect(early).toBeLessThan(10);
    expect(late).toBeGreaterThan(14);
    const w = pair({ seed: 'war-p-0' }); w.rel.stance = 'war'; w.rel.since = 0; w.sim.advanceTo(SEASON * 80);
    if ((w.rel.stance as string | null) === 'peace') expect(w.rel.standing).toBeGreaterThanOrEqual(PEACE_STANDING - 1e-9);
  });
  it('a lopsided war ends in tribute to the stronger, an even one never does', () => {
    const tribute = (a: number, b: number) => {
      let n = 0, right = 0;
      for (let k = 0; k < 24; k++) {
        const w = pair({ a, b, seed: `war-c-${k}` }); w.rel.stance = 'war'; w.rel.since = 0;
        w.sim.advanceTo(SEASON * 6);
        if ((w.rel.stance as string | null) === 'tributary') { n++; if (w.rel.overlord === w.b.id) right++; }
      }
      return { n, right };
    };
    const lop = tribute(24, 480);
    expect(strengthOf(pair({ a: 24, b: 480 }).b) / strengthOf(pair({ a: 24, b: 480 }).a)).toBeGreaterThan(CONQUEST_RATIO);
    expect(lop.n).toBeGreaterThan(4);
    expect(lop.right).toBe(lop.n);
    expect(tribute(96, 96).n).toBe(0);
  });
  it('a weapon suffered is posted once to the people that lacks it, and a people that holds it posts nothing', () => {
    const ledger = new KnowledgeLedger();
    const w = pair({ techsA: [WEAPONS[0]!], ledger }); w.rel.stance = 'war'; w.rel.since = 0;
    w.sim.advanceTo(SEASON - 1);
    const heldByA = w.a.techs.list().filter(t => traitsOf(t).weapon);
    const forB = ledger.take(w.b.id);
    expect(forB.map(e => e.tech).sort()).toEqual([...heldByA].sort());
    for (const e of forB) { expect(e.how).toBe('suffered'); expect(e.intensity).toBe(SUFFERED_INTENSITY); }
    expect(ledger.take(w.a.id)).toEqual([]);
  });
});

describe('determinism and no script', () => {
  it('the same however the run is cut, and across a restore', () => {
    const build = (seed: string) => pair({ seed, standing: -70, region: flat(0.5) });
    const whole = build('war-x'); whole.sim.advanceTo(SEASON * 40);
    const cut = build('war-x'); for (let s = 1; s <= SEASON * 40; s += 211) cut.sim.advanceTo(s); cut.sim.advanceTo(SEASON * 40);
    expect(cut.sim.snapshot()).toEqual(whole.sim.snapshot());
    expect(whole.events.length).toBeGreaterThan(0);
  });
  it('names no technique and compares no id, step or season in its code', () => {
    const src = readFileSync(new URL('../world/PeopleWar.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\.id\s*[<>]=?\s|\bseason\s*[<>]|\bstep\s*[<>]/);
    for (const tech of TECHS) expect(src).not.toContain(`'${tech}'`);
    expect(src).not.toMatch(/Math\.random/);
  });
});
