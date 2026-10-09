import { describe, expect, it } from 'vitest';
import { makeConfig } from '../core/Config.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { Household } from '../entities/Household.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { deriveCompactStream, fromCompactRecord, goalOf, toCompactRecord, type CompactPerson } from '../compact/CompactPerson.ts';
import { advanceCompactBandLife, type CompactBandLifeContext } from '../compact/CompactBandLife.ts';

const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function world() {
  const config = makeConfig({ time: { ticksPerDay: 1 }, population: { conceptionChance: 0 } });
  const ids = new IdSpace();
  const mother = new Person('Mara', 4, 5, 0, new RNG('mother'), config.time.daysPerSeason * 4, ids);
  const father = new Person('Tarin', 4, 5, 0, new RNG('father'), config.time.daysPerSeason * 4, ids);
  mother.age = 25 * mother.daysPerYear;
  father.age = 27 * father.daysPerYear;
  mother.lifespanDays = 65 * mother.daysPerYear;
  father.lifespanDays = 65 * father.daysPerYear;
  mother.sex = 'female';
  father.sex = 'male';
  mother.spouseId = father.id;
  father.spouseId = mother.id;
  mother.pregnant = true;
  mother.gestationLeft = 1;
  mother.pregnantBy = father.id;
  mother.lastBirthDay = -100;
  const house = new Household('Mara', mother.id, 0, 0, ids);
  house.add(mother.id);
  house.add(father.id);
  mother.householdId = house.id;
  father.householdId = house.id;
  const roster: CompactPerson[] = [mother, father].map(person => ({
    person, lastAdvancedTick: 1, epoch: 0, rng: deriveCompactStream('compact-life-fixture', person.id),
    goal: goalOf(person, 1), intake: null,
  }));
  const ctx: CompactBandLifeContext = {
    ledger: { version: 1, lastAdvancedDay: 0 },
    tick: 1, day: 1, time: { ...config.time }, population: { ...config.population },
    childhood: { ...config.childhood }, learning: { ...config.learning }, worldSeed: 'compact-life-fixture',
    ids, peopleById: new Map([[mother.id, mother], [father.id, father]]),
    householdsById: new Map([[house.id, house]]), relationships: new RelationshipGraph(),
    roofTonight: new Map([[mother.id, house.id], [father.id, house.id]]),
  };
  return { config, ids, mother, father, house, roster, ctx };
}

describe('compact band life', () => {
  it('uses shared pregnancy rules and registers the dated newborn in canonical kin and household records', () => {
    const w = world();
    const result = advanceCompactBandLife(w.roster, w.ctx);
    expect(result.newborns).toHaveLength(1);
    const child = result.newborns[0]!.person;
    expect(result.events).toEqual([expect.objectContaining({
      tick: 1, kind: 'birth', subjectId: w.mother.id,
      data: { childId: child.id, fatherId: w.father.id },
    })]);
    expect(child).toBe(w.ctx.peopleById.get(child.id));
    expect(child.motherId).toBe(w.mother.id);
    expect(child.fatherId).toBe(w.father.id);
    expect(w.mother.childIds).toContain(child.id);
    expect(w.father.childIds).toContain(child.id);
    expect(w.house.memberIds).toContain(child.id);
    expect(w.ctx.relationships.peek(w.mother.id, child.id)?.kinship).toBeGreaterThan(0);
    expect(w.ctx.relationships.peek(w.father.id, child.id)?.kinship).toBeGreaterThan(0);
    expect(w.father.age).toBe(27 * w.father.daysPerYear + 1);
    expect(result.ledger.lastAdvancedDay).toBe(1);
    expect(() => advanceCompactBandLife(w.roster, { ...w.ctx, ledger: result.ledger })).toThrow(/advance once/);
  });

  it('keeps IDs, per-person streams and the continuation identical through JSON', () => {
    const a = world();
    const b = world();
    const first = advanceCompactBandLife(a.roster, a.ctx);
    const second = advanceCompactBandLife(b.roster, b.ctx);
    expect(wire(first.events)).toEqual(wire(second.events));
    expect(wire(first.newborns.map(toCompactRecord))).toEqual(wire(second.newborns.map(toCompactRecord)));
    expect(a.ids.snapshot()).toEqual(b.ids.snapshot());

    const restored = first.newborns.map(compact => fromCompactRecord(wire(toCompactRecord(compact))));
    expect(wire(restored.map(toCompactRecord))).toEqual(wire(first.newborns.map(toCompactRecord)));
    expect(restored[0]!.rng.nextUint32()).toBe(first.newborns[0]!.rng.nextUint32());
  });

  it('rejects a roster whose body has not reached the daily life tick', () => {
    const w = world();
    w.roster[0]!.lastAdvancedTick = 0;
    expect(() => advanceCompactBandLife(w.roster, w.ctx)).toThrow(/not advanced/);
  });
  it('does not conceive by a spouse who already died in the same boundary, and retains the dead archive record', () => {
    const w = world();
    w.mother.pregnant = false;
    w.mother.gestationLeft = 0;
    w.mother.pregnantBy = null;
    w.father.die('hunger');
    const ctx = { ...w.ctx, population: { ...w.ctx.population, conceptionChance: 1 } };
    const result = advanceCompactBandLife(w.roster, ctx);
    expect(w.mother.pregnant).toBe(false);
    expect(result.newborns).toHaveLength(0);
    expect(result.events).toHaveLength(0); // the body advance owns the death event
    expect(ctx.peopleById.get(w.father.id)).toBe(w.father);
    expect(w.father.alive).toBe(false);
  });

  it('keeps the shared-roof conception gate and resumes conception after hunger clears', () => {
    const roofless = world();
    roofless.mother.pregnant = false;
    roofless.mother.gestationLeft = 0;
    roofless.mother.pregnantBy = null;
    const certain = { ...roofless.ctx, population: { ...roofless.ctx.population, conceptionChance: 1 }, roofTonight: new Map() };
    advanceCompactBandLife(roofless.roster, certain);
    expect(roofless.mother.pregnant).toBe(false);

    const recovering = world();
    recovering.mother.pregnant = false;
    recovering.mother.gestationLeft = 0;
    recovering.mother.pregnantBy = null;
    recovering.mother.needs.hunger = 140;
    const ctx = { ...recovering.ctx, population: { ...recovering.ctx.population, conceptionChance: 1 } };
    const hungry = advanceCompactBandLife(recovering.roster, ctx);
    expect(recovering.mother.pregnant).toBe(false);

    recovering.mother.needs.hunger = 0;
    const nextRoster = recovering.roster.map(compact => ({ ...compact, lastAdvancedTick: 2 }));
    const next = advanceCompactBandLife(nextRoster, {
      ...ctx, ledger: hungry.ledger, tick: 2, day: 2,
    });
    expect(recovering.mother.pregnant).toBe(true);
    expect(recovering.mother.pregnantBy).toBe(recovering.father.id);
    expect(next.newborns).toHaveLength(0);
  });

  it('records real old-age deaths for both spouses and keeps them in the canonical person archive', () => {
    const w = world();
    w.mother.sex = 'male';
    w.mother.pregnant = false;
    w.mother.gestationLeft = 0;
    w.mother.pregnantBy = null;
    w.father.sex = 'male';
    for (const person of [w.mother, w.father]) {
      person.age = 60 * person.daysPerYear;
      person.lifespanDays = 30 * person.daysPerYear;
      person.health = 40;
    }
    const deathStream = (personId: number): RNG => {
      for (let n = 0; ; n++) {
        const seed = 'compact-life-death-' + personId + '-' + n;
        if (new RNG(seed).next() < 0.5) return new RNG(seed);
      }
    };
    const roster = w.roster.map(compact => ({ ...compact, rng: deathStream(compact.person.id) }));
    const result = advanceCompactBandLife(roster, w.ctx);
    expect(w.mother.alive).toBe(false);
    expect(w.father.alive).toBe(false);
    expect(result.events.map(event => [event.kind, event.subjectId, event.data.cause])).toEqual([
      ['death', w.mother.id, 'old age'], ['death', w.father.id, 'old age'],
    ]);
    expect(w.ctx.peopleById.get(w.mother.id)).toBe(w.mother);
    expect(w.ctx.peopleById.get(w.father.id)).toBe(w.father);
  });
});
