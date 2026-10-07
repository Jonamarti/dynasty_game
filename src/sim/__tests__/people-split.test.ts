import { describe, expect, it } from 'vitest';
import { PeopleSim, closeUnderRequires, emptyCohorts, populationOf, organisationOf, type PeopleCohorts } from '../world/PeopleSim.ts';
import { demography } from '../world/PeopleDemography.ts';
import { KnowledgeLedger } from '../world/PeopleKnowledge.ts';
import {
  splitting, overCeiling, ORGANISATION_CEILING, DAUGHTER_SHARE, MIN_DAUGHTER, SPLIT_CONTACT, SPLIT_STANDING, type SplitReport,
} from '../world/PeopleSplit.ts';
import type { PeopleRegion } from '../world/PeopleCapacity.ts';
import { readFileSync } from 'node:fs';

const CLOCK = { ticksPerDay: 24, daysPerSeason: 10 };
const SEASON = CLOCK.ticksPerDay * CLOCK.daysPerSeason;
const YEARS = (n: number) => n * 4 * SEASON;
const rich: PeopleRegion = { rationsPerComarcaDay: { spring: 1e6, summer: 1e6, autumn: 1e6, winter: 1e6 } };
function adults(n: number): PeopleCohorts {
  const c = emptyCohorts();
  const per = Math.floor(n / 16); // per sex per band, 8 bands each
  for (let b = 1; b <= 8; b++) { c.male[b] = per; c.female[b] = per; }
  return c;
}
/** An owner with `free` comarcas to give away. */
const ground = (free: { n: number }) => (_p: unknown, wanted: number) => { const g = Math.min(wanted, free.n); free.n -= g; return g; };

describe('splitting: a people that outgrows its organisation sends out a daughter', () => {
  it('does nothing below the ceiling of its organisation, and the ceiling rises with the organisation', () => {
    const sim = new PeopleSim('split-1', CLOCK, [splitting({ newGround: () => 5 })]);
    const small = sim.found({ cohorts: adults(48), comarcas: 2 });
    sim.advanceTo(YEARS(3));
    expect(sim.peoples.size).toBe(1);
    expect(populationOf(small)).toBe(48);
    expect(ORGANISATION_CEILING.band).toBeLessThan(ORGANISATION_CEILING.tribe);
    expect(ORGANISATION_CEILING.tribe).toBeLessThan(ORGANISATION_CEILING.chiefdom);
    expect(ORGANISATION_CEILING.chiefdom).toBeLessThan(ORGANISATION_CEILING.state);
    // 100 people are over a band but not over a tribe: the ceiling is read from the techniques held.
    const band = sim.found({ cohorts: adults(112), comarcas: 1 });
    const tribe = sim.found({ cohorts: adults(112), comarcas: 1, techs: closeUnderRequires(['division_of_labour']) });
    expect(overCeiling(band)).toBe(true);
    expect(organisationOf(tribe.techs)).toBe('tribe');
    expect(overCeiling(tribe)).toBe(false);
  });

  it('conserves population, surplus and techniques exactly, and the daughter has the parent\'s culture and tie', () => {
    const reports: SplitReport[] = [];
    const sim = new PeopleSim('split-2', CLOCK, [splitting({ newGround: () => 3 }, r => reports.push(r))]);
    const parent = sim.found({ cohorts: adults(160), comarcas: 3, techs: ['firemaking', 'plant_lore'], surplus: 1000, culture: { strangerRegard: 0.8 } });
    const before = populationOf(parent);
    sim.advanceTo(SEASON + 1);
    expect(reports.length).toBe(1);
    const daughter = sim.peoples.get(reports[0]!.daughterId)!;
    expect(populationOf(parent) + populationOf(daughter)).toBe(before);
    expect(parent.surplus + daughter.surplus).toBeCloseTo(1000, 9);
    expect(daughter.techs.list()).toEqual(parent.techs.list());
    expect(daughter.techs).not.toBe(parent.techs);
    expect(daughter.culture.strangerRegard).toBe(0.8);
    expect(daughter.culture.norms).not.toBe(parent.culture.norms);
    expect(daughter.comarcas).toBe(Math.round(3 * DAUGHTER_SHARE));
    expect(daughter.comarcas).toBe(reports[0]!.comarcas);
    // about DAUGHTER_SHARE left, with both sexes and several ages in it
    expect(populationOf(daughter) / before).toBeGreaterThan(DAUGHTER_SHARE - 0.12);
    expect(populationOf(daughter) / before).toBeLessThan(DAUGHTER_SHARE + 0.12);
    expect(daughter.cohorts.male.some(n => n > 0) && daughter.cohorts.female.some(n => n > 0)).toBe(true);
    const tie = sim.relation(parent.id, daughter.id);
    expect(tie.standing).toBe(SPLIT_STANDING);
    expect(tie.contact).toBe(SPLIT_CONTACT);
    expect(sim.relations.size).toBe(1);
  });

  it('does not split when no ground is granted, and takes no draw from the stream for it', () => {
    const run = (grant: number) => {
      const sim = new PeopleSim('split-3', CLOCK, [splitting({ newGround: () => grant })]);
      const p = sim.found({ cohorts: adults(160), comarcas: 2 });
      sim.advanceTo(SEASON + 1);
      return { sim, p };
    };
    const refused = run(0);
    expect(refused.sim.peoples.size).toBe(1);
    expect(populationOf(refused.p)).toBe(160);
    const control = new PeopleSim('split-3', CLOCK, []);
    const untouched = control.found({ cohorts: adults(160), comarcas: 2 });
    control.advanceTo(SEASON + 1);
    expect(refused.p.rng.snapshot()).toEqual(untouched.rng.snapshot());
    expect(run(2).sim.peoples.size).toBe(2);
  });

  it('never asks for ground it will not use: a tiny parent over a tiny ceiling is not sent out', () => {
    let asked = 0;
    // a people whose daughter would be below MIN_DAUGHTER cannot exist at the real ceilings, so test the gate directly
    const sim = new PeopleSim('split-4', CLOCK, [splitting({ newGround: () => { asked++; return 1; } })]);
    sim.found({ cohorts: adults(56), comarcas: 1 });
    sim.advanceTo(YEARS(1));
    expect(asked).toBe(0);
    expect(MIN_DAUGHTER).toBeLessThanOrEqual(ORGANISATION_CEILING.band * DAUGHTER_SHARE);
  });

  it('the daughter inherits the parent\'s insight into techniques it lacks, and the parent keeps it', () => {
    const ledger = new KnowledgeLedger();
    const sim = new PeopleSim('split-5', CLOCK, [splitting({ newGround: () => 1, ledger })]);
    const parent = sim.found({ cohorts: adults(160), comarcas: 1 });
    ledger.addInsight(parent.id, 'pottery', 0.37);
    sim.advanceTo(SEASON + 1);
    const daughterId = [...sim.peoples.keys()].find(id => id !== parent.id)!;
    expect(ledger.insight(daughterId, 'pottery')).toBeCloseTo(0.37, 12);
    expect(ledger.insight(parent.id, 'pottery')).toBeCloseTo(0.37, 12);
  });

  it('is the same however the run is cut into calls, daughters included', () => {
    const build = () => new PeopleSim('split-6', CLOCK, [
      demography({ regionOf: () => rich }), splitting({ newGround: () => 1 }),
    ]);
    const whole = build(); whole.found({ cohorts: adults(120), comarcas: 2 });
    whole.advanceTo(YEARS(6));
    const cut = build(); cut.found({ cohorts: adults(120), comarcas: 2 });
    for (let s = 1; s <= YEARS(6); s += 97) cut.advanceTo(s);
    cut.advanceTo(YEARS(6));
    expect(whole.peoples.size).toBeGreaterThan(1);
    expect(cut.snapshot()).toEqual(whole.snapshot());
    // and a restored copy continues identically
    const half = build(); half.found({ cohorts: adults(120), comarcas: 2 });
    half.advanceTo(YEARS(3));
    const resumed = PeopleSim.fromSnapshot(JSON.parse(JSON.stringify(half.snapshot())), [demography({ regionOf: () => rich }), splitting({ newGround: () => 1 })]);
    resumed.advanceTo(YEARS(6));
    expect(resumed.snapshot()).toEqual(whole.snapshot());
  });

  it('a growing people in good land divides again and again but never loses anybody (population is only births and deaths)', () => {
    const reports: SplitReport[] = [];
    const free = { n: 100000 };
    const sim = new PeopleSim('split-7', CLOCK, [demography({ regionOf: () => rich }), splitting({ newGround: ground(free) }, r => reports.push(r))]);
    sim.found({ cohorts: adults(48), comarcas: 1 });
    sim.advanceTo(YEARS(40));
    expect(reports.length).toBeGreaterThan(2);
    for (const p of sim.peoples.values()) expect(populationOf(p)).toBeLessThanOrEqual(ORGANISATION_CEILING.band * 1.4);
    // every daughter has a tie to its parent
    for (const r of reports) expect(sim.relations.has(`${Math.min(r.parentId, r.daughterId)}:${Math.max(r.parentId, r.daughterId)}`)).toBe(true);
    expect(free.n).toBeLessThan(100000);
  });

  it('is not scripted: no technique, id, region or date in the code, and swapping ids changes nothing about whether it splits', () => {
    const src = readFileSync(new URL('../world/PeopleSplit.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\.id\s*[=<>!]=|season\s*[<>=]|\bstep\s*[<>=]|'[a-z_]+'\s*\)/);
    const decide = (offsetSeasons: number) => {
      const sim = new PeopleSim('split-8', CLOCK, [splitting({ newGround: () => 1 })]);
      for (let i = 0; i < offsetSeasons; i++) sim.found({ cohorts: adults(8), comarcas: 1 }); // shifts the ids
      sim.found({ cohorts: adults(80), comarcas: 2 }); // 80 is over a band, and neither half is
      sim.advanceTo(SEASON * 2);
      return sim.peoples.size - offsetSeasons - 1;
    };
    expect(decide(0)).toBe(1);
    expect(decide(5)).toBe(1);
  });
});
