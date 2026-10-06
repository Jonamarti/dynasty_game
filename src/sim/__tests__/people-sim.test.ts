import { describe, expect, it } from 'vitest';
import {
  PeopleSim, TechSet, AGE_BANDS, derivePeopleStream, seasonOffset, organisationOf, populationOf,
  emptyCohorts, TECH_LIST_HASH, type SeasonMechanism, type PeopleSimClock, type PeopleCohorts,
} from '../world/PeopleSim.ts';
import { TECHS, TECH, reachableFrom, type Tech } from '../knowledge/Tech.ts';
import { CIVILISATION_NEEDS } from '../social/Polity.ts';

const CLOCK: PeopleSimClock = { ticksPerDay: 24, daysPerSeason: 10 }; // 240 steps per season
const cohorts = (): PeopleCohorts => {
  const c = emptyCohorts();
  for (let i = 0; i < 8; i++) { c.male[i] = 5; c.female[i] = 6; }
  return c;
};
/** Closure of a set of wanted techs under `requires`. */
function closure(...wanted: Tech[]): Tech[] {
  const out = new Set<Tech>();
  const visit = (t: Tech) => { if (out.has(t)) return; TECH[t].requires.forEach(visit); out.add(t); };
  wanted.forEach(visit);
  return [...out];
}
/** A mechanism that only records what it was called with and draws from the people's own stream. */
function probe(log: string[]): SeasonMechanism {
  return ctx => { log.push(`${ctx.step}:${ctx.people.id}:${ctx.season}:${ctx.seasonOfYear}:${ctx.people.rng.next().toFixed(9)}`); };
}

describe('TechSet: techniques as a bitset over TECHS, with the same requires', () => {
  const withReq = TECHS.find(t => TECH[t].requires.length > 0)!;

  it('refuses a technique whose prerequisites are not held, and accepts it once they are', () => {
    const set = new TechSet();
    expect(() => set.add(withReq)).toThrow(/requires/);
    for (const r of closure(withReq).filter(t => t !== withReq)) set.add(r);
    expect(set.add(withReq)).toBe(true);
    expect(set.add(withReq)).toBe(false);
    expect(set.has(withReq)).toBe(true);
  });

  it('refuses a founding set that is not closed under requires', () => {
    expect(() => new TechSet([withReq])).toThrow(/prerequisites/);
    expect(new TechSet(closure(withReq)).has(withReq)).toBe(true);
  });

  it("reaches every node of TECHS by repeatedly adding what is reachable (the tree it reads is the game's)", () => {
    const set = new TechSet();
    for (let guard = 0; guard < TECHS.length + 2; guard++) {
      const next = reachableFrom(new Set(set.list()));
      if (next.length === 0) break;
      for (const t of next) set.add(t);
    }
    expect(set.size).toBe(TECHS.length);
  });

  it('round-trips through JSON and rejects a record saved against another TECHS list or not closed', () => {
    const set = new TechSet(closure(withReq));
    const copy = TechSet.fromRecord(JSON.parse(JSON.stringify(set.toRecord())));
    expect(copy.list()).toEqual(set.list());
    const rec = set.toRecord();
    expect(() => TechSet.fromRecord({ ...rec, hash: TECH_LIST_HASH ^ 1 })).toThrow(/different TECHS/);
    expect(() => TechSet.fromRecord({ ...rec, count: rec.count + 1 })).toThrow();
    // A word with only the dependent bit set: the prerequisites are missing.
    const words = new Array(rec.words.length).fill(0);
    const i = TECHS.indexOf(withReq);
    words[i >>> 5] = (1 << (i & 31)) >>> 0;
    expect(() => TechSet.fromRecord({ ...rec, words })).toThrow(/prerequisites/);
  });

  it('derives the level of organisation from what is held, not from a stored label', () => {
    expect(organisationOf(new TechSet())).toBe('band');
    expect(organisationOf(new TechSet(closure('division_of_labour')))).toBe('tribe');
    expect(organisationOf(new TechSet(closure('chiefdom')))).toBe('chiefdom');
    expect(organisationOf(new TechSet(closure(...(CIVILISATION_NEEDS as unknown as Tech[]))))).toBe('state');
    // Every need must be a real node, or `state` would be unreachable for ever.
    for (const need of CIVILISATION_NEEDS) expect(TECHS).toContain(need);
  });
});

describe('PeopleSim structure and schedule', () => {
  function build(extra: SeasonMechanism[] = [], n = 40): PeopleSim {
    const sim = new PeopleSim('seed-a', CLOCK, extra);
    for (let i = 0; i < n; i++) sim.found({ cohorts: cohorts(), comarcas: 2 });
    return sim;
  }

  it('founds peoples with stable ids and cohorts by age and sex (never a bare counter)', () => {
    const sim = build([], 3);
    expect([...sim.peoples.keys()]).toEqual([1, 2, 3]);
    const p = sim.peoples.get(1)!;
    expect(p.cohorts.male).toHaveLength(AGE_BANDS);
    expect(populationOf(p)).toBe(5 * 8 + 6 * 8);
    expect(() => sim.found({ cohorts: { male: [1], female: [1] }, comarcas: 1 })).toThrow();
    expect(() => sim.found({ cohorts: cohorts(), comarcas: 0 })).toThrow();
    const bad = cohorts(); bad.male[0] = -1;
    expect(() => sim.found({ cohorts: bad, comarcas: 1 })).toThrow();
  });

  it('updates every people exactly once per season, spread over the steps of the season', () => {
    const log: string[] = [];
    const sim = build([probe(log)]);
    sim.advanceTo(CLOCK.ticksPerDay * CLOCK.daysPerSeason * 3 - 1);
    const rows = log.map(l => l.split(':'));
    for (let id = 1; id <= 40; id++) {
      expect(rows.filter(r => Number(r[1]) === id).map(r => Number(r[2]))).toEqual([0, 1, 2]);
    }
    expect(rows).toHaveLength(40 * 3);
    const offsets = new Set(rows.filter(r => r[2] === '1').map(r => Number(r[0]) % sim.stepsPerSeason));
    // Spread: 40 peoples land on many different steps, not one.
    expect(offsets.size).toBeGreaterThan(30);
    expect(rows.find(r => r[2] === '2')![3]).toBe('autumn');
  });

  it('is a function of the schedule alone: cutting the run anywhere gives the same state and draws', () => {
    const a: string[] = [], b: string[] = [], c: string[] = [];
    const whole = build([probe(a)]); whole.advanceTo(2000);
    const cut = build([probe(b)]); for (const s of [1, 7, 333, 334, 1999, 2000]) cut.advanceTo(s);
    const stepwise = build([probe(c)]); for (let s = 1; s <= 2000; s += 1) stepwise.advanceTo(s);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(cut.snapshot()).toEqual(whole.snapshot());
    expect(() => cut.advanceTo(10)).toThrow(/cannot move/);
  });

  it('control: a mechanism that reads the step the caller asked for (a clock) is caught by that comparison', () => {
    const leak = (log: string[]): SeasonMechanism => ctx => { log.push(String(ctx.sim.currentStep)); };
    const a: string[] = [], b: string[] = [];
    const whole = build([leak(a)]); whole.advanceTo(2000);
    const cut = build([leak(b)]); for (const s of [500, 1000, 2000]) cut.advanceTo(s);
    expect(b).not.toEqual(a);
  });

  it('derives each stream from seed and id: independent of how many other peoples exist', () => {
    const one = new PeopleSim('seed-a', CLOCK); one.found({ cohorts: cohorts(), comarcas: 1 });
    const many = build([], 10);
    const x = Array.from({ length: 5 }, () => one.peoples.get(1)!.rng.next());
    const y = Array.from({ length: 5 }, () => many.peoples.get(1)!.rng.next());
    expect(y).toEqual(x);
    const ref = derivePeopleStream('seed-a', 1);
    expect(x).toEqual(Array.from({ length: 5 }, () => ref.next()));
    expect(derivePeopleStream('seed-b', 1).next()).not.toBe(derivePeopleStream('seed-a', 1).next());
    expect(derivePeopleStream('seed-a', 2).next()).not.toBe(derivePeopleStream('seed-a', 1).next());
    expect(seasonOffset('seed-a', 1, 240)).toBe(seasonOffset('seed-a', 1, 240));
  });

  it('saves to JSON mid-run and continues the same draws; a restore that re-derives its streams diverges', () => {
    const a: string[] = [], b: string[] = [], bad: string[] = [];
    const whole = build([probe(a)], 12); whole.advanceTo(1500); const mid = a.length; whole.advanceTo(3000);
    const first = build([probe([])], 12); first.advanceTo(1500);
    const json = JSON.parse(JSON.stringify(first.snapshot()));
    const resumed = PeopleSim.fromSnapshot(json, [probe(b)]); resumed.advanceTo(3000);
    expect(b).toEqual(a.slice(mid));
    expect(resumed.snapshot()).toEqual(whole.snapshot());
    // Control: forget the saved stream states.
    const forgotten = PeopleSim.fromSnapshot(json, [probe(bad)]);
    for (const p of forgotten.peoples.values()) Object.assign(p, { rng: derivePeopleStream('seed-a', p.id) });
    forgotten.advanceTo(3000);
    expect(bad).not.toEqual(a.slice(mid));
  });

  it('keeps one record per relation and applies an aggregate transaction once', () => {
    const sim = build([], 3);
    const r = sim.relation(2, 1);
    expect(sim.relation(1, 2)).toBe(r);
    r.standing = 12; r.contact = 0.4;
    expect(sim.relation(2, 1).standing).toBe(12);
    expect(sim.relations.size).toBe(1);
    expect(() => sim.relation(1, 1)).toThrow();
    expect(() => sim.relation(1, 9)).toThrow();
    expect(sim.commit(77)).toBe(true);
    expect(sim.commit(77)).toBe(false);
    const copy = PeopleSim.fromSnapshot(JSON.parse(JSON.stringify(sim.snapshot())));
    expect(copy.relation(1, 2).standing).toBe(12);
    expect(copy.commit(77)).toBe(false);
    // Control: a snapshot with the relation listed twice or a transaction twice is refused.
    const rec = JSON.parse(JSON.stringify(sim.snapshot()));
    expect(() => PeopleSim.fromSnapshot({ ...rec, relations: [...rec.relations, rec.relations[0]] })).toThrow(/duplicate/);
    expect(() => PeopleSim.fromSnapshot({ ...rec, applied: [77, 77] })).toThrow(/duplicate/);
  });

  it('refuses damaged records: version, lost update, negative cohort', () => {
    const sim = build([], 2); sim.advanceTo(500);
    const rec = JSON.parse(JSON.stringify(sim.snapshot()));
    expect(() => PeopleSim.fromSnapshot({ ...rec, version: 2 })).toThrow();
    const lost = JSON.parse(JSON.stringify(rec)); lost.peoples[0].nextDue = 3;
    expect(() => PeopleSim.fromSnapshot(lost)).toThrow(/lost/);
    const neg = JSON.parse(JSON.stringify(rec)); neg.peoples[0].cohorts.male[0] = -2;
    expect(() => PeopleSim.fromSnapshot(neg)).toThrow();
  });
});
