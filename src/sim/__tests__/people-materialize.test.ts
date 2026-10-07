import { describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { PeopleSim, TechSet, closeUnderRequires, emptyCohorts, populationOf, AGE_BANDS, type PeopleCohorts } from '../world/PeopleSim.ts';
import { demography } from '../world/PeopleDemography.ts';
import { materialize, dissolve, headsOf, KNOWER_SHARE } from '../world/PeopleMaterialize.ts';
import { TECHS, TECH } from '../knowledge/Tech.ts';
import type { PeopleRegion } from '../world/PeopleCapacity.ts';
import { readFileSync } from 'node:fs';

const CLOCK = { ticksPerDay: 24, daysPerSeason: 10 };
const SEASON = CLOCK.ticksPerDay * CLOCK.daysPerSeason;
function mixed(): PeopleCohorts {
  const c = emptyCohorts();
  for (let b = 0; b < AGE_BANDS; b++) { c.male[b] = 3 + b; c.female[b] = 4 + (b % 3); }
  return c;
}
const kit = closeUnderRequires(['firemaking', 'plant_lore', 'cooking', 'cordage', 'basketry']);
function make(seed = 'mat-1') {
  const sim = new PeopleSim(seed, CLOCK, []);
  const people = sim.found({ cohorts: mixed(), comarcas: 2, techs: kit });
  return { sim, people };
}
const cells = (c: PeopleCohorts) => [...c.male, ...c.female];

describe('materialize / dissolve: one authority over every person', () => {
  it('takes exactly the persons it hands over out of the cohorts, and counts them as away', () => {
    const { people } = make();
    const before = cells(people.cohorts), total = populationOf(people);
    const persons = materialize(people, 20, new RNG(5));
    expect(persons.length).toBe(20);
    expect(populationOf(people)).toBe(total - 20);
    expect(people.away).toBe(20);
    expect(headsOf(people)).toBe(total);
    // each person came from a cell that had somebody there
    const taken = cells(people.cohorts).map((n, i) => before[i]! - n);
    expect(taken.every(n => n >= 0)).toBe(true);
    expect(taken.reduce((a, b) => a + b, 0)).toBe(20);
    const bySex = { male: 0, female: 0 };
    for (const p of persons) bySex[p.sex]++;
    expect(taken.slice(0, AGE_BANDS).reduce((a, b) => a + b, 0)).toBe(bySex.male);
  });

  it('coming back restores the cohorts exactly, however often it is repeated, and never mints or loses a head', () => {
    const { people } = make();
    const before = cells(people.cohorts);
    const rng = new RNG(9);
    for (let round = 0; round < 25; round++) {
      const persons = materialize(people, 1 + (round * 7) % 30, rng);
      expect(headsOf(people)).toBe(before.reduce((a, b) => a + b, 0));
      dissolve(people, persons);
      expect(people.away).toBe(0);
    }
    expect(cells(people.cohorts)).toEqual(before);
  });

  it('refuses more persons than the people has, or than were handed out', () => {
    const { people } = make();
    expect(() => materialize(people, populationOf(people) + 1, new RNG(1))).toThrow();
    const some = materialize(people, 3, new RNG(1));
    expect(() => dissolve(people, [...some, ...some])).toThrow(/only 3 are away/);
    dissolve(people, some);
    expect(() => dissolve(people, some)).toThrow();
    expect(people.away).toBe(0);
  });

  it('can take everybody, and then nobody is left in the cohorts', () => {
    const { people } = make();
    const n = populationOf(people);
    const all = materialize(people, n, new RNG(3));
    expect(populationOf(people)).toBe(0);
    dissolve(people, all);
    expect(populationOf(people)).toBe(n);
  });

  it('the sample follows the people\'s own age and sex structure (a very lopsided people gives a lopsided band)', () => {
    const sim = new PeopleSim('mat-2', CLOCK, []);
    const c = emptyCohorts(); c.female[4] = 180; c.male[1] = 20;
    const people = sim.found({ cohorts: c, comarcas: 1 });
    const persons = materialize(people, 100, new RNG(11));
    const women = persons.filter(p => p.sex === 'female');
    expect(women.length).toBeGreaterThan(80);
    for (const w of women) { expect(w.ageYears).toBeGreaterThanOrEqual(20); expect(w.ageYears).toBeLessThan(25); }
    for (const m of persons.filter(p => p.sex === 'male')) { expect(m.ageYears).toBeGreaterThanOrEqual(5); expect(m.ageYears).toBeLessThan(10); }
  });

  it('somebody who aged while away comes back into the band for their new age', () => {
    const { people } = make();
    const [p] = materialize(people, 1, new RNG(2));
    const bandBefore = Math.min(AGE_BANDS - 1, Math.floor(p!.ageYears / 5));
    const snapshot = cells(people.cohorts);
    dissolve(people, [{ ...p!, ageYears: p!.ageYears + 5 }]);
    const after = cells(people.cohorts);
    const side = p!.sex === 'male' ? 0 : AGE_BANDS;
    const gained = after.map((n, i) => n - snapshot[i]!).findIndex(d => d === 1);
    expect(gained - side).toBe(Math.min(AGE_BANDS - 1, bandBefore + 1));
  });
});

describe('techniques are shared out so the group knows what the people knows, but not everybody knows everything', () => {
  it('every technique the people holds is known by at least one of the persons, and each person\'s set is closed under requires', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { people } = make(`mat-t-${seed}`);
      const persons = materialize(people, 6, new RNG(seed));
      const known = new Set(persons.flatMap(p => p.techs));
      for (const t of kit) expect(known.has(t)).toBe(true);
      for (const p of persons) for (const t of p.techs) for (const r of TECH[t].requires) expect(p.techs).toContain(r);
    }
  });
  it('nobody gets a technique the people does not hold, and not everybody knows all of them', () => {
    const { people } = make();
    const persons = materialize(people, 12, new RNG(4));
    for (const p of persons) for (const t of p.techs) expect(kit).toContain(t);
    const counts = persons.map(p => p.techs.length);
    expect(Math.min(...counts)).toBeLessThan(kit.length);
    expect(Math.max(...counts)).toBeGreaterThan(0);
    // about KNOWER_SHARE (plus the one person it is forced on) know a technique that nothing else forces on them
    // a technique nothing else in the kit requires, so only the draw gives it to a person
    const leaf = kit.find(t => !kit.some(o => TECH[o].requires.includes(t)))!;
    let hits = 0, trials = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { people: q } = make(`mat-k-${seed}`);
      for (const p of materialize(q, 10, new RNG(seed))) { trials++; if (p.techs.includes(leaf)) hits++; }
    }
    expect(hits / trials).toBeGreaterThan(KNOWER_SHARE - 0.15);
    expect(hits / trials).toBeLessThan(KNOWER_SHARE + 0.25);
  });
  it('what a band learned while away is added to the people\'s, closed under requires; a lone person is never wrong about requires', () => {
    const { people } = make();
    const persons = materialize(people, 4, new RNG(8));
    const extra = closeUnderRequires(['pottery']);
    expect(extra.every(t => !people.techs.has(t) || kit.includes(t))).toBe(true);
    const learned = persons.map((p, i) => i === 0 ? { ...p, techs: [...new Set([...p.techs, ...extra])] } : p);
    dissolve(people, learned);
    for (const t of extra) expect(people.techs.has(t)).toBe(true);
    for (const t of people.techs.list()) expect(people.techs.prerequisitesHeld(t)).toBe(true);
  });
  it('a people with no techniques hands over persons who know nothing', () => {
    const sim = new PeopleSim('mat-3', CLOCK, []);
    const people = sim.found({ cohorts: mixed(), comarcas: 1 });
    expect(materialize(people, 5, new RNG(1)).every(p => p.techs.length === 0)).toBe(true);
  });
});

describe('looking closely must not move the future', () => {
  const rich: PeopleRegion = { rationsPerComarcaDay: { spring: 40, summer: 40, autumn: 40, winter: 40 } };
  it('does not touch the people\'s own stream, and its seasons are the same with or without a look in between', () => {
    const run = (look: boolean) => {
      const sim = new PeopleSim('mat-4', CLOCK, [demography({ regionOf: () => rich })]);
      const p = sim.found({ cohorts: mixed(), comarcas: 2, techs: kit });
      sim.advanceTo(SEASON * 4);
      const streamBefore = JSON.stringify(p.rng.snapshot());
      if (look) {
        const persons = materialize(p, 15, new RNG(77));
        expect(JSON.stringify(p.rng.snapshot())).toBe(streamBefore);
        dissolve(p, persons);
      }
      sim.advanceTo(SEASON * 40);
      return sim.snapshot();
    };
    // same cells go in and come out, so the people is identical, and so is everything after
    expect(run(true)).toEqual(run(false));
  });
  it('a people seen closely and left away still grows from its remaining heads, and the away count survives a save', () => {
    const sim = new PeopleSim('mat-5', CLOCK, [demography({ regionOf: () => rich })]);
    const p = sim.found({ cohorts: mixed(), comarcas: 2 });
    materialize(p, 10, new RNG(2));
    const copy = PeopleSim.fromSnapshot(JSON.parse(JSON.stringify(sim.snapshot())), [demography({ regionOf: () => rich })]);
    expect(copy.peoples.get(p.id)!.away).toBe(10);
    expect(headsOf(copy.peoples.get(p.id)!)).toBe(headsOf(p));
  });
  it('the same draws give the same persons, and another stream gives other persons (control)', () => {
    const a = materialize(make().people, 12, new RNG(5)), b = materialize(make().people, 12, new RNG(5)), c = materialize(make().people, 12, new RNG(6));
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });
  it('is not scripted: no technique name and no Math.random in the code', () => {
    const src = readFileSync(new URL('../world/PeopleMaterialize.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const tech of TECHS) expect(src).not.toContain(`'${tech}'`);
    expect(src).not.toMatch(/Math\.random/);
  });
  it('TechSet.union closes under requires whatever the order of TECHS', () => {
    const a = new TechSet(closeUnderRequires(['farming']));
    const b = new TechSet();
    expect(b.union(a)).toBe(a.size);
    expect(b.list()).toEqual(a.list());
    expect(b.union(a)).toBe(0);
  });
});
