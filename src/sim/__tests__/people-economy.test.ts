import { describe, expect, it } from 'vitest';
import { PeopleSim, emptyCohorts, populationOf, type PeopleCohorts } from '../world/PeopleSim.ts';
import { demography } from '../world/PeopleDemography.ts';
import { storing, trading, SPOILAGE, PUT_BY_SHARE, STORE_CAP_SEASONS, TRADE_SHARE, TRIBUTE_SHARE, type StoreReport, type TradeReport } from '../world/PeopleEconomy.ts';
import { suppliedRations, type PeopleRegion } from '../world/PeopleCapacity.ts';
import { TECHS } from '../knowledge/Tech.ts';
import { readFileSync } from 'node:fs';

const CLOCK = { ticksPerDay: 24, daysPerSeason: 10 };
const SEASON = CLOCK.ticksPerDay * CLOCK.daysPerSeason;
const flat = (r: number): PeopleRegion => ({ rationsPerComarcaDay: { spring: r, summer: r, autumn: r, winter: r } });
function adults(n: number): PeopleCohorts {
  const c = emptyCohorts(); const per = Math.floor(n / 16);
  for (let b = 1; b <= 8; b++) { c.male[b] = per; c.female[b] = per; }
  return c;
}

describe('storing: the surplus has a writer and a reader', () => {
  it('puts by a share of what the land gave beyond need, within the cap, and spoils a share of what it holds', () => {
    const reports: StoreReport[] = [];
    const sim = new PeopleSim('eco-1', CLOCK, [storing({ regionOf: () => flat(100) }, r => reports.push(r))]);
    const p = sim.found({ cohorts: adults(48), comarcas: 1 });
    const need = 48 * CLOCK.daysPerSeason;
    sim.advanceTo(SEASON + 1);
    expect(reports[0]!.put).toBeCloseTo((100 * 10 - need) * PUT_BY_SHARE, 9);
    expect(p.drawn).toBe(0);
    sim.advanceTo(SEASON * 30);
    expect(p.surplus).toBeLessThanOrEqual(need * STORE_CAP_SEASONS + 1e-9);
    expect(reports.at(-1)!.spoiled).toBeGreaterThan(0);
    expect(SPOILAGE).toBeGreaterThan(0);
  });

  it('feeds the people from the store in a lean season, as far as the store goes, and the supply reads it', () => {
    const lean = flat(2);
    const sim = new PeopleSim('eco-2', CLOCK, [storing({ regionOf: () => lean })]);
    const p = sim.found({ cohorts: adults(48), comarcas: 1, surplus: 5000 });
    const before = p.surplus;
    sim.advanceTo(SEASON + 1);
    const days = CLOCK.daysPerSeason;
    expect(p.drawn).toBeGreaterThan(0);
    // shortfall = need - land = 48*days - 2*days; the store (5000 less spoilage) covers it
    expect(p.drawn * days).toBeCloseTo(48 * days - 2 * days, 6);
    expect(before - p.surplus).toBeCloseTo(before * SPOILAGE + p.drawn * days, 6);
    expect(suppliedRations(p, lean, 'spring')).toBeCloseTo(2 + p.drawn, 9);
    // an empty store gives nothing
    const sim2 = new PeopleSim('eco-2', CLOCK, [storing({ regionOf: () => lean })]);
    const q = sim2.found({ cohorts: adults(48), comarcas: 1 });
    sim2.advanceTo(SEASON + 1);
    expect(q.drawn).toBe(0);
  });

  it('a granary keeps a people alive through a lean winter that thins the same people without one (control)', () => {
    const seasonal: PeopleRegion = { rationsPerComarcaDay: { spring: 60, summer: 60, autumn: 60, winter: 8 } };
    const run = (withStore: boolean) => {
      let total = 0;
      for (let k = 0; k < 12; k++) {
        const mechs = [...(withStore ? [storing({ regionOf: () => seasonal })] : []), demography({ regionOf: () => seasonal })];
        const sim = new PeopleSim(`eco-3-${k}`, CLOCK, mechs);
        const p = sim.found({ cohorts: adults(64), comarcas: 1 });
        sim.advanceTo(SEASON * 4 * 8);
        total += populationOf(p);
      }
      return total / 12;
    };
    expect(run(true)).toBeGreaterThan(run(false) * 1.1);
  });
});

describe('trading: reciprocal sharing, settled once, conserving rations', () => {
  function pair(contact: number, stance?: 'war') {
    const reports: TradeReport[] = [];
    const sim = new PeopleSim('eco-4', CLOCK, [trading(r => reports.push(r))]);
    const rich = sim.found({ cohorts: adults(48), comarcas: 1, surplus: 1000 });
    const poor = sim.found({ cohorts: adults(48), comarcas: 1, surplus: 0 });
    const rel = sim.relation(rich.id, poor.id); rel.contact = contact;
    if (stance) { rel.stance = stance; rel.since = 0; }
    return { sim, rich, poor, rel, reports };
  }

  it('moves surplus from the richer per head to the poorer in proportion to contact, once per season, conserving the total', () => {
    const { sim, rich, poor, rel, reports } = pair(0.5);
    sim.advanceTo(SEASON * 2 - 1);
    const seasons = new Set(reports.map(r => r.season));
    expect(reports.length).toBe(seasons.size);
    expect(rich.surplus + poor.surplus).toBeCloseTo(1000, 9);
    expect(poor.surplus).toBeGreaterThan(0);
    expect(reports[0]!.amount).toBeCloseTo(TRADE_SHARE * 0.5 * (1000 - 500), 9);
    expect(rel.standing).toBeGreaterThan(0);
  });

  it('no contact, no exchange; a war stops it; more contact moves more (control)', () => {
    const none = pair(0); none.sim.advanceTo(SEASON * 3); expect(none.poor.surplus).toBe(0);
    const war = pair(1, 'war'); war.sim.advanceTo(SEASON * 3); expect(war.poor.surplus).toBe(0);
    const low = pair(0.2), high = pair(0.9);
    low.sim.advanceTo(SEASON * 2); high.sim.advanceTo(SEASON * 2);
    expect(high.poor.surplus).toBeGreaterThan(low.poor.surplus);
  });

  it('a second end of the same transaction is refused even if the mechanism is run twice (the identifier is the guard)', () => {
    const reports: TradeReport[] = [];
    const sim = new PeopleSim('eco-5', CLOCK, [trading(r => reports.push(r)), trading(r => reports.push(r))]);
    const a = sim.found({ cohorts: adults(48), comarcas: 1, surplus: 800 });
    const b = sim.found({ cohorts: adults(48), comarcas: 1 });
    sim.relation(a.id, b.id).contact = 1;
    sim.advanceTo(SEASON);
    expect(reports.length).toBe(1);
    expect(a.surplus + b.surplus).toBeCloseTo(800, 9);
  });

  it('a tributary pays its overlord a share of its surplus once a season, in either id order', () => {
    for (const overlordIsLow of [true, false]) {
      const reports: TradeReport[] = [];
      const sim = new PeopleSim('eco-6', CLOCK, [trading(r => reports.push(r))]);
      const x = sim.found({ cohorts: adults(48), comarcas: 1, surplus: 100 });
      const y = sim.found({ cohorts: adults(48), comarcas: 1, surplus: 100 });
      const rel = sim.relation(x.id, y.id);
      rel.stance = 'tributary'; rel.since = 0; rel.overlord = overlordIsLow ? x.id : y.id; rel.contact = 1;
      sim.advanceTo(SEASON);
      expect(reports.length).toBe(1);
      const lord = overlordIsLow ? x : y, vassal = overlordIsLow ? y : x;
      expect(vassal.surplus).toBeCloseTo(100 * (1 - TRIBUTE_SHARE), 9);
      expect(lord.surplus).toBeCloseTo(100 * (1 + TRIBUTE_SHARE), 9);
    }
  });

  it('is not scripted: nothing in the code names a technique, compares an id or reads a date', () => {
    const src = readFileSync(new URL('../world/PeopleEconomy.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\.id\s*[<>]=?\s|\bstep\s*[<>=]/);
    for (const tech of TECHS) expect(src).not.toContain(`'${tech}'`);
    expect(src).not.toMatch(/Math\.random/);
  });
});
